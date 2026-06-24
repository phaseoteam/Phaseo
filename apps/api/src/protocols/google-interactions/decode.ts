// Purpose: Protocol adapter for Google Interactions-compatible requests.
// Why: Lets /v1/interactions use the shared text generation IR and routing stack.
// How: Maps Google input/content/step shapes into IR messages and request params.

import type {
	IRChatRequest,
	IRContentPart,
	IRMessage,
	IRReasoning,
	IRTool,
	IRToolCall,
	IRToolChoice,
	IRToolResult,
} from "@core/ir";
import type { InteractionsRequest } from "@core/schemas";
import {
	normalizeModalities,
	normalizeProviderGeoPreferences,
	resolveTextServiceTier,
} from "../shared/text-normalizers";

type MutableAssistantMessage = Extract<IRMessage, { role: "assistant" }>;

function asRecord(value: unknown): Record<string, any> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? value as Record<string, any>
		: null;
}

function nonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim().length > 0
		? value
		: undefined;
}

function stringifyJson(value: unknown): string {
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value ?? {});
	} catch {
		return "{}";
	}
}

function parseAudioFormatFromMimeType(mimeType: unknown): Extract<IRContentPart, { type: "audio" }>["format"] | undefined {
	if (typeof mimeType !== "string") return undefined;
	const normalized = mimeType.toLowerCase();
	if (normalized.includes("mpeg") || normalized.includes("mp3")) return "mp3";
	if (normalized.includes("flac")) return "flac";
	if (normalized.includes("mp4") || normalized.includes("m4a")) return "m4a";
	if (normalized.includes("ogg")) return "ogg";
	if (normalized.includes("l16") || normalized.includes("pcm16")) return "pcm16";
	if (normalized.includes("l24") || normalized.includes("pcm24")) return "pcm24";
	if (normalized.includes("wav")) return "wav";
	return undefined;
}

function contentText(value: unknown): string {
	if (typeof value === "string") return value;
	if (Array.isArray(value)) return value.map(contentText).filter(Boolean).join("");
	const record = asRecord(value);
	if (!record) return "";
	if (typeof record.text === "string") return record.text;
	if (record.content !== undefined) return contentText(record.content);
	if (record.summary !== undefined) return contentText(record.summary);
	return "";
}

function normalizeContentBlock(block: unknown): IRContentPart | null {
	if (typeof block === "string") return { type: "text", text: block };
	const record = asRecord(block);
	if (!record) return null;

	const type = String(record.type ?? "").toLowerCase();
	if (type === "text" || type === "input_text" || type === "output_text") {
		return { type: "text", text: String(record.text ?? "") };
	}

	if (type === "thought" || type === "thought_summary" || type === "reasoning_text") {
		const text = contentText(record.summary ?? record.content ?? record.text);
		if (!text) return null;
		return {
			type: "reasoning_text",
			text,
			summary: text,
			thoughtSignature: nonEmptyString(record.signature ?? record.thought_signature),
		};
	}

	if (type === "image") {
		const mimeType = nonEmptyString(record.mime_type ?? record.mimeType ?? record.media_type);
		const data = nonEmptyString(record.data ?? record.b64_json);
		if (data) {
			return {
				type: "image",
				source: "data",
				data,
				mimeType,
			};
		}
		const url = nonEmptyString(record.uri ?? record.url ?? record.image_url?.url ?? record.image_url);
		if (url) {
			return {
				type: "image",
				source: "url",
				data: url,
				mimeType,
			};
		}
		return null;
	}

	if (type === "audio") {
		const mimeType = record.mime_type ?? record.mimeType ?? record.media_type;
		const data = nonEmptyString(record.data ?? record.b64_json);
		if (data) {
			return {
				type: "audio",
				source: "data",
				data,
				format: parseAudioFormatFromMimeType(mimeType),
			};
		}
		const url = nonEmptyString(record.uri ?? record.url ?? record.audio_url?.url ?? record.audio_url);
		if (url) {
			return {
				type: "audio",
				source: "url",
				data: url,
				format: parseAudioFormatFromMimeType(mimeType),
			};
		}
		return null;
	}

	if (type === "video") {
		const url = nonEmptyString(record.uri ?? record.url ?? record.video_url?.url ?? record.video_url);
		if (url) {
			return {
				type: "video",
				source: "url",
				url,
			};
		}
		return null;
	}

	if (record.text != null) return { type: "text", text: String(record.text) };
	return { type: "provider_block", block: { ...record } };
}

function normalizeContent(value: unknown): IRContentPart[] {
	if (typeof value === "string") return [{ type: "text", text: value }];
	if (Array.isArray(value)) {
		return value
			.map(normalizeContentBlock)
			.filter((part): part is IRContentPart => Boolean(part));
	}
	const record = asRecord(value);
	if (!record) return [];
	if (Array.isArray(record.parts)) return normalizeContent(record.parts);
	if (Array.isArray(record.content)) return normalizeContent(record.content);
	const part = normalizeContentBlock(record);
	return part ? [part] : [];
}

function isContentArray(value: unknown[]): boolean {
	if (value.length === 0) return true;
	return value.every((entry) => {
		if (typeof entry === "string") return true;
		const record = asRecord(entry);
		if (!record) return false;
		const type = String(record.type ?? "").toLowerCase();
		return [
			"text",
			"input_text",
			"output_text",
			"image",
			"audio",
			"video",
			"document",
			"thought_summary",
			"reasoning_text",
		].includes(type);
	});
}

function getOrCreateAssistant(messages: IRMessage[]): MutableAssistantMessage {
	const last = messages[messages.length - 1];
	if (last?.role === "assistant") return last;
	const created: MutableAssistantMessage = {
		role: "assistant",
		content: [],
		toolCalls: [],
	};
	messages.push(created);
	return created;
}

function appendAssistantContent(messages: IRMessage[], content: IRContentPart[]): void {
	if (content.length === 0) return;
	const assistant = getOrCreateAssistant(messages);
	assistant.content.push(...content);
}

function appendAssistantToolCall(messages: IRMessage[], toolCall: IRToolCall): void {
	const assistant = getOrCreateAssistant(messages);
	if (!assistant.toolCalls) assistant.toolCalls = [];
	assistant.toolCalls.push(toolCall);
}

function normalizeToolResultContent(value: unknown): string {
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value ?? {});
	} catch {
		return String(value ?? "");
	}
}

function processStep(step: Record<string, any>, messages: IRMessage[]): void {
	const type = String(step.type ?? "").toLowerCase();
	if (type === "user_input") {
		messages.push({
			role: "user",
			content: normalizeContent(step.content ?? step.input ?? step.parts ?? ""),
		});
		return;
	}

	if (type === "model_output") {
		appendAssistantContent(messages, normalizeContent(step.content ?? step.output ?? step.parts ?? ""));
		return;
	}

	if (type === "thought") {
		const text = contentText(step.summary ?? step.content ?? step.text);
		if (!text) return;
		appendAssistantContent(messages, [{
			type: "reasoning_text",
			text,
			summary: text,
			thoughtSignature: nonEmptyString(step.signature ?? step.thought_signature),
		}]);
		return;
	}

	if (type === "function_call") {
		appendAssistantToolCall(messages, {
			id: nonEmptyString(step.id ?? step.call_id) ?? `call_${messages.length}`,
			name: nonEmptyString(step.name) ?? "function",
			arguments: stringifyJson(step.arguments ?? step.args ?? {}),
		});
		return;
	}

	if (type === "function_result") {
		const result: IRToolResult = {
			toolCallId: nonEmptyString(step.call_id ?? step.id) ?? `call_${messages.length}`,
			content: normalizeToolResultContent(step.result ?? step.output ?? step.content),
			isError: typeof step.is_error === "boolean" ? step.is_error : undefined,
		};
		messages.push({ role: "tool", toolResults: [result] });
	}
}

function processInputValue(input: unknown, messages: IRMessage[]): void {
	if (input == null) return;
	if (typeof input === "string") {
		messages.push({ role: "user", content: [{ type: "text", text: input }] });
		return;
	}

	if (Array.isArray(input)) {
		if (isContentArray(input)) {
			messages.push({ role: "user", content: normalizeContent(input) });
			return;
		}
		for (const entry of input) processInputValue(entry, messages);
		return;
	}

	const record = asRecord(input);
	if (!record) return;
	const type = String(record.type ?? "").toLowerCase();
	if (type === "turn" || Array.isArray(record.steps)) {
		const steps = Array.isArray(record.steps) ? record.steps : [];
		for (const step of steps) {
			const stepRecord = asRecord(step);
			if (stepRecord) processStep(stepRecord, messages);
		}
		return;
	}

	if (["user_input", "model_output", "thought", "function_call", "function_result"].includes(type)) {
		processStep(record, messages);
		return;
	}

	if (typeof record.role === "string") {
		const role = record.role.toLowerCase();
		const content = normalizeContent(record.content ?? record.parts ?? record.input ?? "");
		if (role === "system" || role === "developer" || role === "user") {
			messages.push({ role, content } as IRMessage);
			return;
		}
		if (role === "assistant" || role === "model") {
			appendAssistantContent(messages, content);
			return;
		}
	}

	messages.push({ role: "user", content: normalizeContent(record.content ?? record.parts ?? record) });
}

function normalizeGoogleTool(tool: Record<string, any>): IRTool {
	const functionPayload = asRecord(tool.function) ?? tool;
	return {
		name:
			nonEmptyString(functionPayload.name) ??
			nonEmptyString(tool.name) ??
			nonEmptyString(tool.type) ??
			"tool",
		type: nonEmptyString(tool.type),
		description:
			nonEmptyString(functionPayload.description) ??
			nonEmptyString(tool.description),
		parameters:
			asRecord(functionPayload.parameters) ??
			asRecord(functionPayload.input_schema) ??
			asRecord(functionPayload.schema) ??
			{},
		raw: { ...tool },
	};
}

function normalizeToolChoice(value: unknown): IRToolChoice | undefined {
	if (typeof value === "string") {
		const normalized = value.trim();
		if (!normalized) return undefined;
		if (normalized === "auto") return "auto";
		if (normalized === "none") return "none";
		if (normalized === "any" || normalized === "required") return "required";
		return { name: normalized };
	}
	const record = asRecord(value);
	if (!record) return undefined;
	const name = nonEmptyString(record.name ?? record.function?.name);
	if (name) return { name };
	const type = nonEmptyString(record.type);
	if (type === "auto") return "auto";
	if (type === "none") return "none";
	if (type === "any" || type === "required") return "required";
	return undefined;
}

function normalizeResponseFormat(format: unknown): IRChatRequest["responseFormat"] {
	const entries = Array.isArray(format) ? format : [format];
	for (const entry of entries) {
		const record = asRecord(entry);
		if (!record) continue;
		if (String(record.type ?? "").toLowerCase() !== "text") continue;
		const mimeType = String(record.mime_type ?? record.mimeType ?? "").toLowerCase();
		if (mimeType !== "application/json") continue;
		if (record.schema) {
			return {
				type: "json_schema",
				schema: record.schema,
				name: nonEmptyString(record.name),
			};
		}
		return { type: "json_object" };
	}
	return undefined;
}

function normalizeImageConfig(format: unknown): IRChatRequest["imageConfig"] {
	const entries = Array.isArray(format) ? format : [format];
	for (const entry of entries) {
		const record = asRecord(entry);
		if (!record || String(record.type ?? "").toLowerCase() !== "image") continue;
		const imageSize = (() => {
			const raw = String(record.image_size ?? record.imageSize ?? "").trim();
			if (raw === "512") return "0.5K";
			if (raw === "0.5K" || raw === "1K" || raw === "2K" || raw === "4K") return raw;
			return undefined;
		})();
		return {
			aspectRatio: nonEmptyString(record.aspect_ratio ?? record.aspectRatio),
			imageSize,
		};
	}
	return undefined;
}

function normalizeResponseModalities(req: InteractionsRequest): IRChatRequest["modalities"] {
	const explicit = normalizeModalities((req as any).response_modalities);
	if (explicit) return explicit;
	const format = (req as any).response_format;
	const entries = Array.isArray(format) ? format : [format];
	const modes = entries
		.map((entry) => String(asRecord(entry)?.type ?? "").toLowerCase())
		.filter((type) => type === "text" || type === "image" || type === "audio");
	return normalizeModalities(modes);
}

function normalizeReasoning(generationConfig: unknown): IRReasoning | undefined {
	const config = asRecord(generationConfig);
	if (!config) return undefined;
	const level = String(config.thinking_level ?? config.thinkingLevel ?? "").toLowerCase();
	const effort: IRReasoning["effort"] =
		level === "none" ||
		level === "minimal" ||
		level === "low" ||
		level === "medium" ||
		level === "high" ||
		level === "xhigh" ||
		level === "max"
			? level
			: undefined;
	const summaries = String(config.thinking_summaries ?? config.thinkingSummaries ?? "").toLowerCase();
	const includeThoughts =
		summaries === "none"
			? false
			: summaries
				? true
				: undefined;
	if (!effort && includeThoughts === undefined) return undefined;
	return {
		effort,
		enabled: effort ? effort !== "none" : undefined,
		includeThoughts,
	};
}

export function decodeGoogleInteractionsRequest(req: InteractionsRequest): IRChatRequest {
	const generationConfig = asRecord((req as any).generation_config) ?? {};
	const messages: IRMessage[] = [];

	if ((req as any).system_instruction !== undefined) {
		messages.push({
			role: "system",
			content: normalizeContent((req as any).system_instruction),
		});
	}
	processInputValue((req as any).input, messages);

	const metadata = {
		...((req as any).metadata ?? {}),
		...(((req as any).user_metadata && typeof (req as any).user_metadata === "object")
			? Object.fromEntries(
				Object.entries((req as any).user_metadata)
					.filter(([, value]) => typeof value === "string")
					.map(([key, value]) => [key, value as string]),
			)
			: {}),
	};
	const vendorGoogle: Record<string, any> = {
		interactions_surface: true,
	};
	for (const key of [
		"previous_interaction_id",
		"generation_config",
		"response_format",
		"response_modalities",
		"system_instruction",
		"environment",
		"user_metadata",
	]) {
		if ((req as any)[key] !== undefined) vendorGoogle[key] = (req as any)[key];
	}

	return {
		messages,
		model: req.model,
		stream: req.stream ?? false,
		maxTokens: generationConfig.max_output_tokens ?? generationConfig.maxOutputTokens,
		temperature: generationConfig.temperature,
		topP: generationConfig.top_p ?? generationConfig.topP,
		topK: generationConfig.top_k ?? generationConfig.topK,
		seed: generationConfig.seed,
		frequencyPenalty: generationConfig.frequency_penalty ?? generationConfig.frequencyPenalty,
		presencePenalty: generationConfig.presence_penalty ?? generationConfig.presencePenalty,
		stop: generationConfig.stop_sequences ?? generationConfig.stopSequences,
		tools: Array.isArray(req.tools)
			? req.tools.map(normalizeGoogleTool)
			: undefined,
		toolChoice: normalizeToolChoice((req as any).tool_choice ?? generationConfig.tool_choice),
		reasoning: normalizeReasoning(generationConfig),
		responseFormat: normalizeResponseFormat((req as any).response_format),
		modalities: normalizeResponseModalities(req),
		imageConfig: normalizeImageConfig((req as any).response_format),
		store: req.store,
		background: req.background,
		serviceTier: resolveTextServiceTier({ service_tier: (req as any).service_tier }),
		geo: normalizeProviderGeoPreferences(req as any),
		googleCachedContent: (req as any).cached_content,
		previousResponseId: (req as any).previous_interaction_id,
		metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
		vendor: {
			google: vendorGoogle,
		},
		rawRequest: req,
	};
}
