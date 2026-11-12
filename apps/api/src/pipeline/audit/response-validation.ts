import { validateJsonSchemaValue } from "@/plugins/response-healing";

// The audit measures the model, not our regex engine: a pattern too risky to run is
// skipped, not counted as the output breaking it.
const AUDIT_SCHEMA_OPTIONS = { skipUnsafePatterns: true };

export type ToolCallValidation = {
	totalCalls: number;
	invalidCalls: number;
	invalidJson: number;
	schemaMismatch: number;
	unknownToolName: number;
};

export type StructuredOutputValidation = {
	attempted: boolean;
	succeeded: boolean;
	basis: "json_parse" | "schema_validation" | "unobserved" | null;
	errorReason: "invalid_json" | "schema_mismatch" | "missing_output" | null;
};

type ToolDefinition = {
	name: string;
	schema: Record<string, unknown> | null;
};

type ToolCall = {
	name: string;
	arguments: unknown;
};

function asRecord(value: unknown): Record<string, any> | null {
	return value != null && typeof value === "object" && !Array.isArray(value)
		? value as Record<string, any>
		: null;
}

function requestedTools(requestPayload: unknown): Map<string, ToolDefinition> {
	const request = asRecord(requestPayload);
	const definitions = new Map<string, ToolDefinition>();
	for (const value of Array.isArray(request?.tools) ? request.tools : []) {
		const tool = asRecord(value);
		const fn = asRecord(tool?.function);
		const name = String(fn?.name ?? tool?.name ?? "").trim();
		if (!name) continue;
		const schema = asRecord(fn?.parameters ?? tool?.parameters ?? tool?.input_schema);
		definitions.set(name, { name, schema });
	}
	return definitions;
}

function responseToolCalls(gatewayResponse: unknown): ToolCall[] {
	const response = asRecord(gatewayResponse);
	if (!response) return [];
	const candidates: unknown[] = [];
	for (const choiceValue of Array.isArray(response.choices) ? response.choices : []) {
		const choice = asRecord(choiceValue);
		const message = asRecord(choice?.message);
		candidates.push(...(Array.isArray(message?.tool_calls) ? message.tool_calls : []));
		candidates.push(...(Array.isArray(message?.toolCalls) ? message.toolCalls : []));
	}
	for (const itemValue of Array.isArray(response.output) ? response.output : []) {
		const item = asRecord(itemValue);
		if (item?.type === "function_call" || item?.type === "tool_call") candidates.push(item);
	}
	for (const itemValue of Array.isArray(response.content) ? response.content : []) {
		const item = asRecord(itemValue);
		if (item?.type === "tool_use") candidates.push(item);
	}
	return candidates.map((value) => {
		const call = asRecord(value);
		const fn = asRecord(call?.function);
		return {
			name: String(fn?.name ?? call?.name ?? "").trim(),
			arguments: fn?.arguments ?? call?.arguments ?? call?.input,
		};
	});
}

function parseToolArguments(value: unknown): { ok: true; value: unknown } | { ok: false } {
	if (value != null && typeof value === "object") return { ok: true, value };
	// Several providers send no arguments as an empty string; that is an empty object,
	// and a tool that requires arguments still fails its schema check below.
	if (value == null || (typeof value === "string" && value.trim().length === 0)) return { ok: true, value: {} };
	if (typeof value !== "string") return { ok: false };
	try {
		return { ok: true, value: JSON.parse(value) };
	} catch {
		return { ok: false };
	}
}

export function validateToolCallResponses(
	requestPayload: unknown,
	gatewayResponse: unknown,
): ToolCallValidation {
	const tools = requestedTools(requestPayload);
	const calls = responseToolCalls(gatewayResponse);
	const result: ToolCallValidation = {
		totalCalls: calls.length,
		invalidCalls: 0,
		invalidJson: 0,
		schemaMismatch: 0,
		unknownToolName: 0,
	};
	for (const call of calls) {
		let invalid = false;
		const definition = tools.get(call.name);
		if (!definition) {
			result.unknownToolName += 1;
			invalid = true;
		}
		const parsed = parseToolArguments(call.arguments);
		if (!parsed.ok) {
			result.invalidJson += 1;
			invalid = true;
		} else if (definition?.schema && !validateJsonSchemaValue(parsed.value, definition.schema, "$", 8, AUDIT_SCHEMA_OPTIONS).ok) {
			result.schemaMismatch += 1;
			invalid = true;
		}
		if (invalid) result.invalidCalls += 1;
	}
	return result;
}

/** The JSON output format a request asks for: Chat `response_format`, Responses `text.format`, Messages `output_config.format`. */
export function structuredFormat(requestPayload: unknown): Record<string, any> | null {
	const request = asRecord(requestPayload);
	for (const candidate of [request?.response_format, request?.text?.format, request?.output_config?.format]) {
		const format = asRecord(candidate);
		if (format?.type === "json_schema" || format?.type === "json_object") return format;
	}
	return null;
}

function structuredSchema(format: Record<string, any>): Record<string, any> | null {
	if (format.type !== "json_schema") return null;
	return asRecord(format.schema ?? format.json_schema?.schema ?? format.json_schema?.schema_);
}

function joinTextParts(parts: unknown, types: string[]): string | null {
	if (!Array.isArray(parts)) return null;
	const texts = parts
		.map((part) => asRecord(part))
		.filter((part) => part && types.includes(String(part.type)) && typeof part.text === "string")
		.map((part) => part!.text as string);
	return texts.length > 0 ? texts.join("") : null;
}

/**
 * The reply's answer text. Undefined when the response has no reply shape the
 * gateway can read, so its output was never observed.
 */
function extractStructuredOutput(value: unknown): unknown {
	const response = asRecord(value);
	if (!response) return undefined;
	if (asRecord(response.output_parsed)) return response.output_parsed;
	if (asRecord(response.parsed)) return response.parsed;
	if (typeof response.output_text === "string") return response.output_text;
	if (Array.isArray(response.choices)) {
		const content = asRecord(response.choices[0])?.message?.content;
		if (typeof content === "string") return content;
		return joinTextParts(content, ["text", "output_text"]);
	}
	// Responses: answer text lives in message items. Reasoning items carry
	// reasoning text that is not the answer.
	if (Array.isArray(response.output)) {
		const texts = response.output
			.map((item: unknown) => asRecord(item))
			.filter((item: Record<string, any> | null) => item?.type === "message" || item?.type == null)
			.map((item: Record<string, any> | null) => joinTextParts(item?.content, ["output_text", "text"]))
			.filter((text: string | null): text is string => text != null);
		return texts.length > 0 ? texts.join("") : null;
	}
	// Messages: text blocks, not thinking blocks.
	if (Array.isArray(response.content)) return joinTextParts(response.content, ["text"]);
	if (typeof response.text === "string") return response.text;
	return undefined;
}

export function validateStructuredOutputResponse(
	requestPayload: unknown,
	gatewayResponse: unknown,
): StructuredOutputValidation {
	const format = structuredFormat(requestPayload);
	if (!format) {
		return { attempted: false, succeeded: false, basis: null, errorReason: null };
	}
	const output = extractStructuredOutput(gatewayResponse);
	// No readable reply, or a turn that called tools instead of answering: there is
	// no final answer to check, which is not a structured-output failure.
	const blank = output == null || (typeof output === "string" && output.trim().length === 0);
	if (output === undefined || (blank && responseToolCalls(gatewayResponse).length > 0)) {
		return { attempted: true, succeeded: false, basis: "unobserved", errorReason: null };
	}
	if (blank) {
		return { attempted: true, succeeded: false, basis: "json_parse", errorReason: "missing_output" };
	}
	let parsed = output;
	if (typeof output === "string") {
		try {
			parsed = JSON.parse(output);
		} catch {
			return { attempted: true, succeeded: false, basis: "json_parse", errorReason: "invalid_json" };
		}
	}
	const schema = structuredSchema(format);
	if (schema && !validateJsonSchemaValue(parsed, schema, "$", 8, AUDIT_SCHEMA_OPTIONS).ok) {
		return { attempted: true, succeeded: false, basis: "schema_validation", errorReason: "schema_mismatch" };
	}
	return {
		attempted: true,
		succeeded: true,
		basis: schema ? "schema_validation" : "json_parse",
		errorReason: null,
	};
}
