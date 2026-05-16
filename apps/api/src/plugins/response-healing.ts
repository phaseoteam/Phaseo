import type { Endpoint } from "@core/types";
import type { PipelineContext } from "@/pipeline/before/types";
import type { RequestResult } from "@/pipeline/execute";
import { normalizeResponseFormat } from "@/protocols/shared/text-normalizers";
import type {
	GatewayPluginExecutionMetadata,
	NormalizedGatewayPluginConfig,
	ResponseHealingMode,
} from "./types";

type HealingResult =
	| {
		ok: true;
		healed: boolean;
		jsonText: string;
		transformsApplied: string[];
	}
	| {
		ok: false;
		failureReason: "not_json" | "unrepairable" | "truncated";
		transformsApplied: string[];
	};

type ResponsePluginArgs = {
	ctx: PipelineContext;
	result: RequestResult;
	payload: any;
	plugin: NormalizedGatewayPluginConfig;
	finishReason: string | null;
};

type StructuredTextAccessor = {
	get: () => string | null;
	set: (value: string) => void;
};

type SchemaValidationResult =
	| { ok: true }
	| {
		ok: false;
		errors: string[];
	};

function isSchemaValidationFailure(
	result: SchemaValidationResult,
): result is Extract<SchemaValidationResult, { ok: false }> {
	return result.ok === false;
}

function hasStructuredJsonTarget(body: any): boolean {
	const responseFormatType =
		typeof body?.response_format?.type === "string"
			? body.response_format.type
			: typeof body?.text?.format?.type === "string"
				? body.text.format.type
				: null;
	return responseFormatType === "json_object" || responseFormatType === "json_schema";
}

function getStructuredJsonSchema(body: any): Record<string, any> | null {
	const format = normalizeResponseFormat(body?.response_format ?? body?.text?.format);
	if (format?.type !== "json_schema" || !format.schema || typeof format.schema !== "object") {
		return null;
	}
	return format.schema as Record<string, any>;
}

function stripMarkdownFence(value: string): string {
	const match = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
	return match?.[1]?.trim() ?? value;
}

function extractJsonWindow(value: string): string {
	const firstBrace = value.indexOf("{");
	const firstBracket = value.indexOf("[");
	const starts = [firstBrace, firstBracket].filter((index) => index >= 0);
	if (!starts.length) return value;
	const start = Math.min(...starts);
	const lastBrace = value.lastIndexOf("}");
	const lastBracket = value.lastIndexOf("]");
	const end = Math.max(lastBrace, lastBracket);
	if (end < start) return value;
	return value.slice(start, end + 1).trim();
}

function removeTrailingCommas(value: string): string {
	return value.replace(/,\s*([}\]])/g, "$1");
}

function quoteBareKeys(value: string): string {
	return value.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_-]*)(\s*:)/g, '$1"$2"$3');
}

function appendMissingClosers(value: string): string {
	const stack: string[] = [];
	let inString = false;
	let escaped = false;

	for (const char of value) {
		if (escaped) {
			escaped = false;
			continue;
		}
		if (char === "\\") {
			escaped = true;
			continue;
		}
		if (char === '"') {
			inString = !inString;
			continue;
		}
		if (inString) continue;
		if (char === "{") stack.push("}");
		else if (char === "[") stack.push("]");
		else if (char === "}" || char === "]") {
			if (stack[stack.length - 1] === char) {
				stack.pop();
			}
		}
	}

	if (!stack.length) return value;
	return value + stack.reverse().join("");
}

function tryParseCanonicalJson(value: string): string | null {
	try {
		return JSON.stringify(JSON.parse(value));
	} catch {
		return null;
	}
}

function resolveResponseHealingMode(plugin: NormalizedGatewayPluginConfig): ResponseHealingMode {
	const raw =
		typeof plugin.config?.mode === "string"
			? plugin.config.mode
			: (plugin as Record<string, unknown>).mode;
	return raw === "strict" ? "strict" : "safe";
}

function healJsonText(
	input: string,
	args: { allowAppendClosers: boolean; mode: ResponseHealingMode },
): HealingResult {
	const trimmed = input.trim();
	if (!trimmed) {
		return { ok: false, failureReason: "not_json", transformsApplied: [] };
	}

	const direct = tryParseCanonicalJson(trimmed);
	if (direct) {
		return {
			ok: true,
			healed: false,
			jsonText: direct,
			transformsApplied: [],
		};
	}

	const transforms: Array<[string, (value: string) => string]> = [
		["strip_markdown_fence", stripMarkdownFence],
		["extract_json_window", extractJsonWindow],
	];
	if (args.mode === "safe") {
		transforms.push(["remove_trailing_commas", removeTrailingCommas]);
		transforms.push(["quote_bare_keys", quoteBareKeys]);
	}
	if (args.mode === "safe" && args.allowAppendClosers) {
		transforms.push(["append_missing_closers", appendMissingClosers]);
	}

	let candidate = trimmed;
	const applied: string[] = [];
	for (const [id, transform] of transforms) {
		const next = transform(candidate);
		if (next !== candidate) {
			applied.push(id);
			candidate = next.trim();
		}
		const parsed = tryParseCanonicalJson(candidate);
		if (parsed) {
			return {
				ok: true,
				healed: true,
				jsonText: parsed,
				transformsApplied: applied,
			};
		}
	}

	return {
		ok: false,
		failureReason: args.allowAppendClosers ? "unrepairable" : "truncated",
		transformsApplied: applied,
	};
}

function isSameJsonValue(left: unknown, right: unknown): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

function getSchemaTypes(schema: Record<string, any>): string[] {
	if (typeof schema.type === "string") return [schema.type];
	if (Array.isArray(schema.type)) {
		return schema.type.filter((value): value is string => typeof value === "string");
	}
	return [];
}

function matchesSchemaType(value: unknown, type: string): boolean {
	switch (type) {
		case "object":
			return !!value && typeof value === "object" && !Array.isArray(value);
		case "array":
			return Array.isArray(value);
		case "string":
			return typeof value === "string";
		case "number":
			return typeof value === "number" && Number.isFinite(value);
		case "integer":
			return typeof value === "number" && Number.isInteger(value);
		case "boolean":
			return typeof value === "boolean";
		case "null":
			return value === null;
		default:
			return true;
	}
}

function formatPath(basePath: string, segment: string | number): string {
	if (typeof segment === "number") return `${basePath}[${segment}]`;
	return basePath === "$" ? `$.${segment}` : `${basePath}.${segment}`;
}

function isValidEmail(value: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
}

function isValidUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function isValidUri(value: string): boolean {
	try {
		const parsed = new URL(value);
		return typeof parsed.protocol === "string" && parsed.protocol.length > 0;
	} catch {
		return false;
	}
}

function isValidDateTime(value: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)) {
		return false;
	}
	return !Number.isNaN(Date.parse(value));
}

function validateStringFormat(value: string, format: string): boolean {
	switch (format) {
		case "email":
			return isValidEmail(value);
		case "uri":
		case "url":
			return isValidUri(value);
		case "date-time":
			return isValidDateTime(value);
		case "uuid":
			return isValidUuid(value);
		default:
			return true;
	}
}

function validateJsonSchemaValue(
	value: unknown,
	schema: Record<string, any>,
	path = "$",
	limit = 8,
): SchemaValidationResult {
	const errors: string[] = [];

	const visit = (candidate: unknown, candidateSchema: Record<string, any>, candidatePath: string) => {
		if (errors.length >= limit) return;

		if (candidateSchema.const !== undefined && !isSameJsonValue(candidate, candidateSchema.const)) {
			errors.push(`${candidatePath} must equal the configured const value`);
			return;
		}

		if (Array.isArray(candidateSchema.enum) && !candidateSchema.enum.some((item) => isSameJsonValue(candidate, item))) {
			errors.push(`${candidatePath} must match one of the configured enum values`);
			return;
		}

		const schemaTypes = getSchemaTypes(candidateSchema);
		if (
			schemaTypes.length > 0 &&
			!schemaTypes.some((type) => matchesSchemaType(candidate, type))
		) {
			errors.push(
				`${candidatePath} must be ${schemaTypes.join(" or ")}`,
			);
			return;
		}

		if (typeof candidate === "string") {
			if (typeof candidateSchema.minLength === "number" && candidate.length < candidateSchema.minLength) {
				errors.push(`${candidatePath} must be at least ${candidateSchema.minLength} character(s)`);
				if (errors.length >= limit) return;
			}
			if (typeof candidateSchema.maxLength === "number" && candidate.length > candidateSchema.maxLength) {
				errors.push(`${candidatePath} must be at most ${candidateSchema.maxLength} character(s)`);
				if (errors.length >= limit) return;
			}
			if (typeof candidateSchema.pattern === "string") {
				try {
					const pattern = new RegExp(candidateSchema.pattern);
					if (!pattern.test(candidate)) {
						errors.push(`${candidatePath} does not match the required pattern`);
						if (errors.length >= limit) return;
					}
				} catch {
					// Ignore invalid schema regexes here; request-time schema validation is handled elsewhere.
				}
			}
			if (typeof candidateSchema.format === "string") {
				const format = candidateSchema.format.trim().toLowerCase();
				if (format && !validateStringFormat(candidate, format)) {
					errors.push(`${candidatePath} must match the ${format} format`);
					if (errors.length >= limit) return;
				}
			}
		}

		if (typeof candidate === "number" && Number.isFinite(candidate)) {
			if (typeof candidateSchema.minimum === "number" && candidate < candidateSchema.minimum) {
				errors.push(`${candidatePath} must be greater than or equal to ${candidateSchema.minimum}`);
				if (errors.length >= limit) return;
			}
			if (typeof candidateSchema.maximum === "number" && candidate > candidateSchema.maximum) {
				errors.push(`${candidatePath} must be less than or equal to ${candidateSchema.maximum}`);
				if (errors.length >= limit) return;
			}
			if (
				typeof candidateSchema.exclusiveMinimum === "number" &&
				candidate <= candidateSchema.exclusiveMinimum
			) {
				errors.push(`${candidatePath} must be greater than ${candidateSchema.exclusiveMinimum}`);
				if (errors.length >= limit) return;
			}
			if (
				typeof candidateSchema.exclusiveMaximum === "number" &&
				candidate >= candidateSchema.exclusiveMaximum
			) {
				errors.push(`${candidatePath} must be less than ${candidateSchema.exclusiveMaximum}`);
				if (errors.length >= limit) return;
			}
			if (
				typeof candidateSchema.multipleOf === "number" &&
				Number.isFinite(candidateSchema.multipleOf) &&
				candidateSchema.multipleOf > 0
			) {
				const quotient = candidate / candidateSchema.multipleOf;
				if (Math.abs(quotient - Math.round(quotient)) > 1e-9) {
					errors.push(`${candidatePath} must be a multiple of ${candidateSchema.multipleOf}`);
					if (errors.length >= limit) return;
				}
			}
		}

		if (!!candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
			const objectCandidate = candidate as Record<string, any>;
			if (
				typeof candidateSchema.minProperties === "number" &&
				Object.keys(objectCandidate).length < candidateSchema.minProperties
			) {
				errors.push(`${candidatePath} must contain at least ${candidateSchema.minProperties} propert${candidateSchema.minProperties === 1 ? "y" : "ies"}`);
				if (errors.length >= limit) return;
			}
			if (
				typeof candidateSchema.maxProperties === "number" &&
				Object.keys(objectCandidate).length > candidateSchema.maxProperties
			) {
				errors.push(`${candidatePath} must contain at most ${candidateSchema.maxProperties} propert${candidateSchema.maxProperties === 1 ? "y" : "ies"}`);
				if (errors.length >= limit) return;
			}
			const required = Array.isArray(candidateSchema.required)
				? candidateSchema.required.filter((entry): entry is string => typeof entry === "string")
				: [];
			for (const key of required) {
				if (!(key in objectCandidate)) {
					errors.push(`${formatPath(candidatePath, key)} is required`);
					if (errors.length >= limit) return;
				}
			}

			const properties =
				candidateSchema.properties && typeof candidateSchema.properties === "object"
					? candidateSchema.properties as Record<string, any>
					: {};
			if (candidateSchema.additionalProperties === false) {
				for (const key of Object.keys(objectCandidate)) {
					if (!(key in properties)) {
						errors.push(`${formatPath(candidatePath, key)} is not allowed`);
						if (errors.length >= limit) return;
					}
				}
			}

			for (const [key, propertySchema] of Object.entries(properties)) {
				if (!(key in objectCandidate)) continue;
				if (!propertySchema || typeof propertySchema !== "object") continue;
				visit(objectCandidate[key], propertySchema as Record<string, any>, formatPath(candidatePath, key));
				if (errors.length >= limit) return;
			}
			return;
		}

		if (Array.isArray(candidate)) {
			const itemsSchema =
				candidateSchema.items && typeof candidateSchema.items === "object"
					? candidateSchema.items as Record<string, any>
					: null;
			if (typeof candidateSchema.minItems === "number" && candidate.length < candidateSchema.minItems) {
				errors.push(`${candidatePath} must contain at least ${candidateSchema.minItems} item(s)`);
			}
			if (typeof candidateSchema.maxItems === "number" && candidate.length > candidateSchema.maxItems) {
				errors.push(`${candidatePath} must contain at most ${candidateSchema.maxItems} item(s)`);
			}
			if (candidateSchema.uniqueItems === true) {
				const seen = new Set<string>();
				for (const item of candidate) {
					const key = JSON.stringify(item);
					if (seen.has(key)) {
						errors.push(`${candidatePath} must contain only unique items`);
						break;
					}
					seen.add(key);
				}
				if (errors.length >= limit) return;
			}
			if (!itemsSchema) return;
			for (let index = 0; index < candidate.length; index += 1) {
				visit(candidate[index], itemsSchema, formatPath(candidatePath, index));
				if (errors.length >= limit) return;
			}
		}
	};

	visit(value, schema, path);
	return errors.length > 0 ? { ok: false, errors } : { ok: true };
}

function getStructuredTextAccessors(
	payload: any,
	endpoint: Endpoint,
): StructuredTextAccessor[] {
	if (!payload || typeof payload !== "object") return [];

	if (endpoint === "chat.completions") {
		const message = payload?.choices?.[0]?.message;
		if (!message || typeof message !== "object") return [];
		if (typeof message.content !== "string") return [];
		return [{
			get: () => message.content,
			set: (value) => {
				message.content = value;
			},
		}];
	}

	if (endpoint === "messages") {
		const blocks = Array.isArray(payload?.content) ? payload.content : [];
		const textIndexes = blocks
			.map((block: any, index: number) =>
				block &&
				typeof block === "object" &&
				String(block.type ?? "").toLowerCase() === "text" &&
				typeof block.text === "string"
					? index
					: -1,
			)
			.filter((index) => index >= 0);
		return textIndexes.map((textIndex) => ({
			get: () => String(blocks[textIndex]?.text ?? ""),
			set: (value: string) => {
				const nextContent = blocks.filter(
					(part: any, index: number) =>
						String(part?.type ?? "").toLowerCase() !== "text" || index === textIndex,
				);
				const targetIndex = nextContent.findIndex(
					(part: any) =>
						part &&
						typeof part === "object" &&
						String(part.type ?? "").toLowerCase() === "text",
				);
				if (targetIndex >= 0) {
					nextContent[targetIndex] = {
						...nextContent[targetIndex],
						text: value,
					};
					payload.content = nextContent;
				}
			},
		}));
	}

	if (endpoint === "responses") {
		const items = Array.isArray(payload?.output_items)
			? payload.output_items
			: Array.isArray(payload?.output)
				? payload.output
				: [];
		const messageItem = items.find(
			(item: any) =>
				item &&
				typeof item === "object" &&
				String(item.type ?? "").toLowerCase() === "message" &&
				Array.isArray(item.content),
		);
		if (!messageItem) return [];
		const content = messageItem.content as any[];
		const textIndexes = content
			.map((part, index) =>
				part &&
				typeof part === "object" &&
				String(part.type ?? "").toLowerCase() === "output_text" &&
				typeof part.text === "string"
					? index
					: -1,
			)
			.filter((index) => index >= 0);
		return textIndexes.map((textIndex) => ({
			get: () => String(content[textIndex]?.text ?? ""),
			set: (value) => {
				const nextContent = content.filter(
					(part, index) =>
						String(part?.type ?? "").toLowerCase() !== "output_text" ||
						index === textIndex,
				);
				const targetIndex = nextContent.findIndex(
					(part) =>
						part &&
						typeof part === "object" &&
						String(part.type ?? "").toLowerCase() === "output_text",
				);
				if (targetIndex >= 0) {
					nextContent[targetIndex] = {
						...nextContent[targetIndex],
						text: value,
					};
					messageItem.content = nextContent;
				}
			},
		}));
	}

	return [];
}

export function applyResponseHealingPlugin(
	args: ResponsePluginArgs,
): { payload: any; execution: GatewayPluginExecutionMetadata } {
	const baseExecution = {
		id: args.plugin.id,
		stage: "response.post_provider" as const,
		changed: false,
	};
	const mode = resolveResponseHealingMode(args.plugin);

	if (args.ctx.stream) {
		return {
			payload: args.payload,
			execution: {
				...baseExecution,
				status: "skipped",
				metadata: {
					attempted: false,
					healed: false,
					mode,
					failure_reason: "streaming_unsupported",
				},
			},
		};
	}

	if (!hasStructuredJsonTarget(args.ctx.body)) {
		return {
			payload: args.payload,
			execution: {
				...baseExecution,
				status: "skipped",
				metadata: {
					attempted: false,
					healed: false,
					mode,
					failure_reason: "not_json",
				},
			},
		};
	}

	const accessors = getStructuredTextAccessors(args.payload, args.ctx.endpoint);
	const jsonSchema = getStructuredJsonSchema(args.ctx.body);
	if (!accessors.length) {
		return {
			payload: args.payload,
			execution: {
				...baseExecution,
				status: "skipped",
				metadata: {
					attempted: false,
					healed: false,
					mode,
					failure_reason: "not_json",
				},
			},
		};
	}

	const allowAppendClosers = args.finishReason !== "length";
	let healed: HealingResult | null = null;
	let selectedAccessor: StructuredTextAccessor | null = null;
	let schemaMismatch:
		| {
			errors: string[];
			transformsApplied: string[];
		}
		| null = null;

	for (const accessor of accessors) {
		const current = accessor.get();
		if (!current) continue;
		const candidate = healJsonText(current, { allowAppendClosers, mode });
		if (candidate.ok) {
			if (jsonSchema) {
				const validation = validateJsonSchemaValue(JSON.parse(candidate.jsonText), jsonSchema);
				if (isSchemaValidationFailure(validation)) {
					const validationErrors = validation.errors;
					if (!schemaMismatch) {
						schemaMismatch = {
							errors: validationErrors,
							transformsApplied: candidate.transformsApplied,
						};
					}
					continue;
				}
			}
			healed = candidate;
			selectedAccessor = accessor;
			break;
		}
		if (!healed) {
			healed = candidate;
		}
	}

	if (!healed) {
		if (schemaMismatch) {
			return {
				payload: args.payload,
				execution: {
					...baseExecution,
					status: "skipped",
					metadata: {
						attempted: true,
						healed: false,
						mode,
						failure_reason: "schema_mismatch",
						transforms_applied: schemaMismatch.transformsApplied,
						validation_errors: schemaMismatch.errors,
					},
				},
			};
		}
		return {
			payload: args.payload,
			execution: {
				...baseExecution,
				status: "skipped",
				metadata: {
					attempted: false,
					healed: false,
					mode,
					failure_reason: "not_json",
				},
			},
		};
	}

	if (healed.ok === false) {
		return {
			payload: args.payload,
			execution: {
				...baseExecution,
				status: "skipped",
				metadata: {
					attempted: true,
					healed: false,
					mode,
					failure_reason: healed.failureReason,
					transforms_applied: healed.transformsApplied,
				},
			},
		};
	}

	const selectedCurrent = selectedAccessor?.get()?.trim() ?? null;
	const shouldRewrite =
		Boolean(selectedAccessor) &&
		(healed.healed ||
			selectedCurrent !== healed.jsonText ||
			accessors.length > 1);

	if (shouldRewrite && selectedAccessor) {
		selectedAccessor.set(healed.jsonText);
	}

	return {
		payload: args.payload,
		execution: {
			...baseExecution,
			changed: shouldRewrite,
			status: shouldRewrite ? "applied" : "skipped",
			metadata: {
				attempted: true,
				healed: healed.healed,
				mode,
				transforms_applied: healed.transformsApplied,
			},
		},
	};
}
