// Purpose: Text surface server-tool helpers.
// Why: Let gateway-managed tools run server-side without client round-trips.
// How: Rewrites request tools into callable function tools and executes supported calls.

import type { IRChatResponse, IRContentPart, IRMessage, IRToolCall, IRToolResult, IRUsage } from "@core/ir";
import type { Protocol } from "@protocols/detect";
import { encodeUnifiedStreamEvent, type StreamProtocol } from "@protocols/stream/encode";
import { extractUnifiedStreamEvents, type UnifiedStreamEvent } from "../after/stream-events";

export const DATETIME_SERVER_TOOL_TYPE = "gateway:datetime";
export const DATETIME_SERVER_TOOL_FUNCTION_NAME = "gateway_datetime";
const DEFAULT_TIMEZONE = "UTC";
const TEMPORARILY_DISABLED_WEB_SEARCH_TOOL_TYPES = new Set([
	"web_search",
	"web_search_2025_08_26",
	"web_search_preview",
	"web_search_preview_2025_03_11",
]);

const DATETIME_TOOL_DESCRIPTION =
	"Get the current date and time. Optionally provide an IANA timezone (for example, Europe/London).";
const DATETIME_TOOL_PARAMETERS = {
	type: "object",
	properties: {
		timezone: {
			type: "string",
			description: "IANA timezone name (for example America/New_York, Europe/London). Defaults to UTC.",
		},
	},
	additionalProperties: false,
} as const;

export type ServerToolConfig = {
	enabled: boolean;
	datetimeDefaultTimezone: string;
};

type PrepareRequestResult =
	| {
		ok: true;
		body: any;
		config: ServerToolConfig;
	}
	| {
		ok: false;
		message: string;
	};

export type DatetimeToolExecution = {
	toolResults: IRToolResult[];
	datetimeRequests: number;
};

export type ServerToolContinuation = {
	assistantMessage: Extract<IRMessage, { role: "assistant" }>;
	toolResults: IRToolResult[];
	datetimeRequests: number;
};

function cloneBody(body: any): any {
	if (!body || typeof body !== "object") return {};
	try {
		return structuredClone(body);
	} catch {
		return JSON.parse(JSON.stringify(body));
	}
}

function toNonEmptyString(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function parseDatetimeToolTimezone(tool: any): string | null {
	const timezone =
		toNonEmptyString(tool?.parameters?.timezone) ??
		toNonEmptyString(tool?.timezone) ??
		null;
	return timezone;
}

function getDisabledWebSearchToolTypeFromTool(tool: any): string | null {
	if (!tool || typeof tool !== "object") return null;
	const toolType = toNonEmptyString(tool.type);
	if (!toolType) return null;
	return TEMPORARILY_DISABLED_WEB_SEARCH_TOOL_TYPES.has(toolType)
		? toolType
		: null;
}

function getDisabledWebSearchToolTypeFromToolChoice(toolChoice: any): string | null {
	if (toolChoice == null) return null;
	if (typeof toolChoice === "string") {
		const normalized = toNonEmptyString(toolChoice);
		if (!normalized) return null;
		return TEMPORARILY_DISABLED_WEB_SEARCH_TOOL_TYPES.has(normalized)
			? normalized
			: null;
	}
	if (typeof toolChoice !== "object") return null;
	const candidates = [
		toNonEmptyString((toolChoice as any).type),
		toNonEmptyString((toolChoice as any).name),
		toNonEmptyString((toolChoice as any)?.function?.name),
	].filter((value): value is string => Boolean(value));
	for (const candidate of candidates) {
		if (TEMPORARILY_DISABLED_WEB_SEARCH_TOOL_TYPES.has(candidate)) {
			return candidate;
		}
	}
	return null;
}

function isValidTimezone(timezone: string): boolean {
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
		return true;
	} catch {
		return false;
	}
}

function hasOpenAIFunctionToolNamed(tools: any[], name: string): boolean {
	return tools.some((tool) => {
		if (!tool || typeof tool !== "object") return false;
		if (tool.type !== "function") return false;
		const toolName = toNonEmptyString(tool?.function?.name) ?? toNonEmptyString(tool?.name);
		return toolName === name;
	});
}

function hasAnthropicToolNamed(tools: any[], name: string): boolean {
	return tools.some((tool) => {
		if (!tool || typeof tool !== "object") return false;
		const toolName = toNonEmptyString(tool?.name);
		return toolName === name;
	});
}

function rewriteToolChoice(toolChoice: any, protocol: Protocol): any {
	if (toolChoice == null) return toolChoice;
	if (typeof toolChoice === "string") {
		if (toolChoice === DATETIME_SERVER_TOOL_TYPE) {
			if (protocol === "anthropic.messages") {
				return { type: "tool", name: DATETIME_SERVER_TOOL_FUNCTION_NAME };
			}
			return {
				type: "function",
				function: { name: DATETIME_SERVER_TOOL_FUNCTION_NAME },
			};
		}
		return toolChoice;
	}
	if (!toolChoice || typeof toolChoice !== "object") return toolChoice;

	const choiceName =
		toNonEmptyString((toolChoice as any)?.function?.name) ??
		toNonEmptyString((toolChoice as any)?.name) ??
		null;

	if (choiceName !== DATETIME_SERVER_TOOL_TYPE) return toolChoice;

	if (protocol === "anthropic.messages") {
		return {
			type: "tool",
			name: DATETIME_SERVER_TOOL_FUNCTION_NAME,
		};
	}

	return {
		type: "function",
		function: { name: DATETIME_SERVER_TOOL_FUNCTION_NAME },
	};
}

export function prepareServerToolsForTextRequest(
	body: any,
	protocol: Protocol,
): PrepareRequestResult {
	const nextBody = cloneBody(body);
	const tools = Array.isArray(nextBody?.tools) ? nextBody.tools : [];
	const disabledToolChoiceType = getDisabledWebSearchToolTypeFromToolChoice(
		nextBody?.tool_choice,
	);
	if (disabledToolChoiceType) {
		return {
			ok: false,
			message: `Tool type "${disabledToolChoiceType}" is temporarily disabled.`,
		};
	}

	let datetimeEnabled = false;
	let datetimeDefaultTimezone = DEFAULT_TIMEZONE;
	const filteredTools: any[] = [];

	for (const tool of tools) {
		const disabledToolType = getDisabledWebSearchToolTypeFromTool(tool);
		if (disabledToolType) {
			return {
				ok: false,
				message: `Tool type "${disabledToolType}" is temporarily disabled.`,
			};
		}

		if (!tool || typeof tool !== "object") {
			filteredTools.push(tool);
			continue;
		}

		if (tool.type !== DATETIME_SERVER_TOOL_TYPE) {
			filteredTools.push(tool);
			continue;
		}

		datetimeEnabled = true;
		const requestedTimezone = parseDatetimeToolTimezone(tool);
		if (requestedTimezone) {
			if (!isValidTimezone(requestedTimezone)) {
				return {
					ok: false,
					message: `Invalid datetime tool timezone "${requestedTimezone}". Use a valid IANA timezone name.`,
				};
			}
			datetimeDefaultTimezone = requestedTimezone;
		}
	}

	if (!datetimeEnabled) {
		return {
			ok: true,
			body: nextBody,
			config: {
				enabled: false,
				datetimeDefaultTimezone: DEFAULT_TIMEZONE,
			},
		};
	}

	if (protocol === "anthropic.messages") {
		if (!hasAnthropicToolNamed(filteredTools, DATETIME_SERVER_TOOL_FUNCTION_NAME)) {
			filteredTools.push({
				name: DATETIME_SERVER_TOOL_FUNCTION_NAME,
				description: DATETIME_TOOL_DESCRIPTION,
				input_schema: DATETIME_TOOL_PARAMETERS,
			});
		}
	} else {
		if (!hasOpenAIFunctionToolNamed(filteredTools, DATETIME_SERVER_TOOL_FUNCTION_NAME)) {
			filteredTools.push({
				type: "function",
				function: {
					name: DATETIME_SERVER_TOOL_FUNCTION_NAME,
					description: DATETIME_TOOL_DESCRIPTION,
					parameters: DATETIME_TOOL_PARAMETERS,
				},
			});
		}
	}

	nextBody.tools = filteredTools;
	nextBody.tool_choice = rewriteToolChoice(nextBody.tool_choice, protocol);

	return {
		ok: true,
		body: nextBody,
		config: {
			enabled: true,
			datetimeDefaultTimezone,
		},
	};
}

function parseJsonObject(value: string | undefined): Record<string, unknown> {
	if (typeof value !== "string" || value.trim().length === 0) return {};
	try {
		const parsed = JSON.parse(value);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
	} catch {
		// Ignore invalid arguments and treat as empty object.
	}
	return {};
}

function readDatetimeTimezone(args: Record<string, unknown>, fallback: string): string {
	const candidate = toNonEmptyString(args.timezone);
	return candidate ?? fallback;
}

function extractOffsetString(date: Date, timezone: string): string {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: timezone,
		timeZoneName: "shortOffset",
		hour: "2-digit",
	}).formatToParts(date);
	const rawOffset =
		parts.find((part) => part.type === "timeZoneName")?.value ??
		"GMT+00:00";
	if (rawOffset === "UTC" || rawOffset === "GMT") {
		return "+00:00";
	}
	const match = rawOffset.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/i);
	if (!match) return "+00:00";
	const sign = match[1];
	const hours = String(Number(match[2])).padStart(2, "0");
	const minutes = String(Number(match[3] ?? "0")).padStart(2, "0");
	return `${sign}${hours}:${minutes}`;
}

function formatIsoInTimezone(date: Date, timezone: string): string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: timezone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hourCycle: "h23",
	}).formatToParts(date);

	const partMap = new Map(parts.map((part) => [part.type, part.value]));
	const year = partMap.get("year") ?? "0000";
	const month = partMap.get("month") ?? "01";
	const day = partMap.get("day") ?? "01";
	const hour = partMap.get("hour") ?? "00";
	const minute = partMap.get("minute") ?? "00";
	const second = partMap.get("second") ?? "00";
	const milliseconds = String(date.getUTCMilliseconds()).padStart(3, "0");
	const offset = extractOffsetString(date, timezone);
	return `${year}-${month}-${day}T${hour}:${minute}:${second}.${milliseconds}${offset}`;
}

function executeDatetimeToolCall(
	call: { id: string; arguments: string },
	defaultTimezone: string,
): IRToolResult {
	const args = parseJsonObject(call.arguments);
	const timezone = readDatetimeTimezone(args, defaultTimezone);
	if (!isValidTimezone(timezone)) {
		return {
			toolCallId: call.id,
			isError: true,
			content: JSON.stringify({
				error: "invalid_timezone",
				timezone,
				message: "timezone must be a valid IANA timezone name",
			}),
		};
	}

	const now = new Date();
	return {
		toolCallId: call.id,
		content: JSON.stringify({
			datetime: formatIsoInTimezone(now, timezone),
			timezone,
		}),
	};
}

export function buildServerToolContinuation(
	irResponse: IRChatResponse,
	config: ServerToolConfig,
): ServerToolContinuation | null {
	if (!config.enabled) return null;
	const firstChoice = Array.isArray(irResponse.choices) ? irResponse.choices[0] : null;
	if (!firstChoice) return null;
	const toolCalls = Array.isArray(firstChoice.message?.toolCalls)
		? firstChoice.message.toolCalls
		: [];
	if (toolCalls.length === 0) return null;

	const datetimeCalls = toolCalls.filter(
		(call) => call?.name === DATETIME_SERVER_TOOL_FUNCTION_NAME,
	);
	if (datetimeCalls.length === 0) return null;

	// If mixed with client-managed function calls, skip server execution for this turn.
	if (datetimeCalls.length !== toolCalls.length) return null;

	const toolResults = datetimeCalls.map((call) =>
		executeDatetimeToolCall(
			{ id: call.id, arguments: call.arguments },
			config.datetimeDefaultTimezone,
		),
	);

	return {
		assistantMessage: {
			role: "assistant",
			content: Array.isArray(firstChoice.message.content)
				? firstChoice.message.content
				: [],
			toolCalls: toolCalls.map((call) => ({
				id: call.id,
				name: call.name,
				arguments: call.arguments,
			})),
			...(firstChoice.message.phase !== undefined
				? { phase: firstChoice.message.phase }
				: {}),
		},
		toolResults,
		datetimeRequests: datetimeCalls.length,
	};
}

function sumMaybe(left?: number, right?: number): number | undefined {
	if (left == null && right == null) return undefined;
	return (left ?? 0) + (right ?? 0);
}

export function mergeIRUsageTotals(base?: IRUsage, incoming?: IRUsage): IRUsage | undefined {
	if (!base && !incoming) return undefined;
	if (!base) return incoming ? { ...incoming } : undefined;
	if (!incoming) return { ...base };

	const mergedExt = {
		inputImageTokens: sumMaybe(base._ext?.inputImageTokens, incoming._ext?.inputImageTokens),
		inputAudioTokens: sumMaybe(base._ext?.inputAudioTokens, incoming._ext?.inputAudioTokens),
		inputVideoTokens: sumMaybe(base._ext?.inputVideoTokens, incoming._ext?.inputVideoTokens),
		outputImageTokens: sumMaybe(base._ext?.outputImageTokens, incoming._ext?.outputImageTokens),
		outputAudioTokens: sumMaybe(base._ext?.outputAudioTokens, incoming._ext?.outputAudioTokens),
		outputVideoTokens: sumMaybe(base._ext?.outputVideoTokens, incoming._ext?.outputVideoTokens),
		cachedWriteTokens: sumMaybe(base._ext?.cachedWriteTokens, incoming._ext?.cachedWriteTokens),
	};

	return {
		inputTokens: (base.inputTokens ?? 0) + (incoming.inputTokens ?? 0),
		outputTokens: (base.outputTokens ?? 0) + (incoming.outputTokens ?? 0),
		totalTokens: (base.totalTokens ?? 0) + (incoming.totalTokens ?? 0),
		cachedInputTokens: sumMaybe(base.cachedInputTokens, incoming.cachedInputTokens),
		cachedReadTokensAreSubsetOfInput:
			base.cachedReadTokensAreSubsetOfInput === true &&
			incoming.cachedReadTokensAreSubsetOfInput === true
				? true
				: undefined,
		reasoningTokens: sumMaybe(base.reasoningTokens, incoming.reasoningTokens),
		_ext: Object.values(mergedExt).some((value) => value != null)
			? {
				...mergedExt,
				serverToolUse: {
					datetime_requests:
						(base._ext?.serverToolUse?.datetime_requests ?? 0) +
						(incoming._ext?.serverToolUse?.datetime_requests ?? 0),
				},
			}
			: {
				serverToolUse: {
					datetime_requests:
						(base._ext?.serverToolUse?.datetime_requests ?? 0) +
						(incoming._ext?.serverToolUse?.datetime_requests ?? 0),
				},
			},
	};
}

export function attachServerToolUsage(
	usage: IRUsage | undefined,
	args: { datetimeRequests: number },
): IRUsage | undefined {
	if (!usage && args.datetimeRequests <= 0) return usage;
	const baseUsage: IRUsage = usage
		? { ...usage, _ext: usage._ext ? { ...usage._ext } : undefined }
		: {
			inputTokens: 0,
			outputTokens: 0,
			totalTokens: 0,
		};
	const existing = baseUsage._ext?.serverToolUse?.datetime_requests ?? 0;
	baseUsage._ext = {
		...(baseUsage._ext ?? {}),
		serverToolUse: {
			datetime_requests: existing + Math.max(0, args.datetimeRequests),
		},
	};
	return baseUsage;
}

export function attachServerToolUsageToRawUsage(
	usage: Record<string, any> | undefined,
	args: { datetimeRequests: number },
): Record<string, any> | undefined {
	if (!usage && args.datetimeRequests <= 0) return usage;
	const base = { ...(usage ?? {}) };
	const existing = Number(base?.server_tool_use?.datetime_requests ?? 0) || 0;
	base.server_tool_use = {
		...(base.server_tool_use ?? {}),
		datetime_requests: existing + Math.max(0, args.datetimeRequests),
	};
	return base;
}

function toStreamProtocol(protocol: Protocol): StreamProtocol | null {
	switch (protocol) {
		case "openai.chat.completions":
		case "openai.responses":
		case "anthropic.messages":
			return protocol;
		default:
			return null;
	}
}

function buildUnifiedEventsFromChatCompletionsPayload(payload: any): UnifiedStreamEvent[] {
	const events: UnifiedStreamEvent[] = [
		{ type: "start", protocol: "openai.chat.completions", payload },
	];
	const choices = Array.isArray(payload?.choices) ? payload.choices : [];
	for (let choiceIndex = 0; choiceIndex < choices.length; choiceIndex += 1) {
		const choice = choices[choiceIndex] ?? {};
		const message = choice?.message ?? {};
		const reasoningDetails = Array.isArray(message?.reasoning_details) ? message.reasoning_details : [];
		for (const detail of reasoningDetails) {
			if (typeof detail?.text === "string" && detail.text.length > 0) {
				events.push({
					type: "delta_text",
					channel: "reasoning_text",
					text: detail.text,
					choiceIndex,
				});
			}
		}
		if (reasoningDetails.length === 0 && typeof message?.reasoning_content === "string" && message.reasoning_content.length > 0) {
			events.push({
				type: "delta_text",
				channel: "reasoning_text",
				text: message.reasoning_content,
				choiceIndex,
			});
		}
		if (typeof message?.content === "string" && message.content.length > 0) {
			events.push({
				type: "delta_text",
				channel: "output_text",
				text: message.content,
				choiceIndex,
			});
		}
		const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
		for (let toolIndex = 0; toolIndex < toolCalls.length; toolIndex += 1) {
			const toolCall = toolCalls[toolIndex] ?? {};
			events.push({
				type: "delta_tool",
				toolCallId: typeof toolCall?.id === "string" ? toolCall.id : undefined,
				toolName: typeof toolCall?.function?.name === "string" ? toolCall.function.name : undefined,
				arguments:
					typeof toolCall?.function?.arguments === "string"
						? toolCall.function.arguments
						: undefined,
				choiceIndex,
				toolIndex,
			});
		}
	}
	if (payload?.usage && typeof payload.usage === "object") {
		events.push({ type: "usage", usage: payload.usage, payload });
	}
	events.push({
		type: "stop",
		finishReason: String(choices?.[0]?.finish_reason ?? "stop"),
		payload,
	});
	return events;
}

function buildUnifiedEventsFromResponsesPayload(payload: any): UnifiedStreamEvent[] {
	const events: UnifiedStreamEvent[] = [
		{ type: "start", protocol: "openai.responses", payload },
	];
	const outputItems = Array.isArray(payload?.output)
		? payload.output
		: (Array.isArray(payload?.output_items) ? payload.output_items : []);
	for (let outputIndex = 0; outputIndex < outputItems.length; outputIndex += 1) {
		const item = outputItems[outputIndex] ?? {};
		const itemType = String(item?.type ?? "").toLowerCase();
		if (itemType === "message") {
			const contentParts = Array.isArray(item?.content) ? item.content : [];
			for (const part of contentParts) {
				if (part?.type === "output_text" && typeof part?.text === "string" && part.text.length > 0) {
					events.push({
						type: "delta_text",
						channel: "output_text",
						text: part.text,
						choiceIndex: outputIndex,
					});
				}
				if (part?.type === "reasoning_text" && typeof part?.text === "string" && part.text.length > 0) {
					events.push({
						type: "delta_text",
						channel: "reasoning_text",
						text: part.text,
						choiceIndex: outputIndex,
					});
				}
			}
		}
		if (itemType === "reasoning") {
			const contentParts = Array.isArray(item?.content) ? item.content : [];
			for (const part of contentParts) {
				if (part?.type === "output_text" && typeof part?.text === "string" && part.text.length > 0) {
					events.push({
						type: "delta_text",
						channel: "reasoning_text",
						text: part.text,
						choiceIndex: outputIndex,
					});
				}
			}
		}
		if (itemType === "function_call" || itemType === "tool_call") {
			events.push({
				type: "delta_tool",
				toolCallId:
					typeof item?.call_id === "string"
						? item.call_id
						: (typeof item?.id === "string" ? item.id : undefined),
				toolName: typeof item?.name === "string" ? item.name : undefined,
				arguments: typeof item?.arguments === "string" ? item.arguments : undefined,
				choiceIndex: outputIndex,
			});
		}
	}
	if (payload?.usage && typeof payload.usage === "object") {
		events.push({ type: "usage", usage: payload.usage, payload });
	} else {
		events.push({
			type: "stop",
			finishReason: String(payload?.status ?? "completed"),
			payload,
		});
	}
	return events;
}

function buildUnifiedEventsFromAnthropicPayload(payload: any): UnifiedStreamEvent[] {
	const events: UnifiedStreamEvent[] = [
		{ type: "start", protocol: "anthropic.messages", payload },
	];
	const contentBlocks = Array.isArray(payload?.content) ? payload.content : [];
	for (let index = 0; index < contentBlocks.length; index += 1) {
		const block = contentBlocks[index] ?? {};
		const blockType = String(block?.type ?? "").toLowerCase();
		if (blockType === "text" && typeof block?.text === "string" && block.text.length > 0) {
			events.push({
				type: "delta_text",
				channel: "output_text",
				text: block.text,
				choiceIndex: index,
			});
		}
		if (blockType === "thinking" && typeof block?.thinking === "string" && block.thinking.length > 0) {
			events.push({
				type: "delta_text",
				channel: "reasoning_text",
				text: block.thinking,
				choiceIndex: index,
			});
		}
		if (blockType === "tool_use") {
			events.push({
				type: "delta_tool",
				toolCallId: typeof block?.id === "string" ? block.id : undefined,
				toolName: typeof block?.name === "string" ? block.name : undefined,
				arguments: block?.input != null ? JSON.stringify(block.input) : "{}",
				choiceIndex: index,
			});
		}
	}
	if (payload?.usage && typeof payload.usage === "object") {
		events.push({ type: "usage", usage: payload.usage, payload });
	}
	events.push({
		type: "stop",
		finishReason: String(payload?.stop_reason ?? "end_turn"),
		payload,
	});
	return events;
}

function buildUnifiedEventsFromPayload(protocol: StreamProtocol, payload: any): UnifiedStreamEvent[] {
	switch (protocol) {
		case "openai.chat.completions":
			return buildUnifiedEventsFromChatCompletionsPayload(payload);
		case "openai.responses":
			return buildUnifiedEventsFromResponsesPayload(payload);
		case "anthropic.messages":
			return buildUnifiedEventsFromAnthropicPayload(payload);
		default:
			return [];
	}
}

export function buildSyntheticServerToolStream(args: {
	protocol: Protocol;
	payload: any;
	requestId: string;
	model?: string | null;
	created?: number | null;
}): ReadableStream<Uint8Array> | null {
	const streamProtocol = toStreamProtocol(args.protocol);
	if (!streamProtocol) return null;
	const events = buildUnifiedEventsFromPayload(streamProtocol, args.payload);
	const encoder = new TextEncoder();
	return new ReadableStream<Uint8Array>({
		start(controller) {
			for (const event of events) {
				const encoded = encodeUnifiedStreamEvent(streamProtocol, event, {
					requestId: args.requestId,
					model: args.model ?? null,
					created: args.created ?? null,
				});
				if (!encoded) continue;
				const prefix = encoded.eventName ? `event: ${encoded.eventName}\n` : "";
				controller.enqueue(encoder.encode(`${prefix}data: ${JSON.stringify(encoded.frame)}\n\n`));
			}
			if (streamProtocol !== "anthropic.messages") {
				controller.enqueue(encoder.encode("data: [DONE]\n\n"));
			}
			controller.close();
		},
	});
}

type StreamChoiceAccumulator = {
	textParts: string[];
	reasoningParts: string[];
	toolCallsByKey: Map<string, IRToolCall>;
	toolCallOrder: string[];
	finishReason?: IRChatResponse["choices"][number]["finishReason"];
};

function parseSseFrame(raw: string): { eventName: string | null; data: string } {
	let eventName: string | null = null;
	let data = "";
	for (const line of raw.split("\n")) {
		const trimmed = line.replace(/\r$/, "");
		if (trimmed.startsWith("event:")) {
			eventName = trimmed.slice(6).trim() || null;
			continue;
		}
		if (trimmed.startsWith("data:")) {
			data += trimmed.slice(5).trimStart();
		}
	}
	return { eventName, data };
}

function mapStopReasonToIr(reason: string | null | undefined): IRChatResponse["choices"][number]["finishReason"] {
	const normalized = String(reason ?? "").trim().toLowerCase();
	if (!normalized) return "stop";
	if (normalized === "stop" || normalized === "end_turn" || normalized === "completed") return "stop";
	if (normalized === "max_tokens" || normalized === "length") return "length";
	if (normalized === "tool_use" || normalized === "tool_calls" || normalized.includes("tool")) return "tool_calls";
	if (normalized.includes("content") || normalized.includes("refusal") || normalized.includes("safety")) return "content_filter";
	if (normalized === "error" || normalized === "failed") return "error";
	return "stop";
}

function parseUsageNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
}

function usageRawToIR(usageRaw: any): IRUsage | undefined {
	if (!usageRaw || typeof usageRaw !== "object") return undefined;

	const inputTokens =
		parseUsageNumber(usageRaw.input_tokens) ??
		parseUsageNumber(usageRaw.prompt_tokens) ??
		parseUsageNumber(usageRaw.inputTokens) ??
		0;
	const outputTokens =
		parseUsageNumber(usageRaw.output_tokens) ??
		parseUsageNumber(usageRaw.completion_tokens) ??
		parseUsageNumber(usageRaw.outputTokens) ??
		0;
	const totalTokens =
		parseUsageNumber(usageRaw.total_tokens) ??
		parseUsageNumber(usageRaw.totalTokens) ??
		(inputTokens + outputTokens);
	const cachedInputTokens =
		parseUsageNumber(usageRaw.cached_read_tokens) ??
		parseUsageNumber(usageRaw.cached_input_tokens) ??
		parseUsageNumber(usageRaw.input_tokens_details?.cached_tokens);
	const reasoningTokens =
		parseUsageNumber(usageRaw.reasoning_tokens) ??
		parseUsageNumber(usageRaw.output_tokens_details?.reasoning_tokens);

	const ext: NonNullable<IRUsage["_ext"]> = {};
	const inputImageTokens =
		parseUsageNumber(usageRaw.input_tokens_details?.input_images) ??
		parseUsageNumber(usageRaw.input_image_tokens);
	if (inputImageTokens != null) ext.inputImageTokens = inputImageTokens;
	const inputAudioTokens =
		parseUsageNumber(usageRaw.input_tokens_details?.input_audio) ??
		parseUsageNumber(usageRaw.input_audio_tokens);
	if (inputAudioTokens != null) ext.inputAudioTokens = inputAudioTokens;
	const inputVideoTokens =
		parseUsageNumber(usageRaw.input_tokens_details?.input_videos) ??
		parseUsageNumber(usageRaw.input_video_tokens);
	if (inputVideoTokens != null) ext.inputVideoTokens = inputVideoTokens;
	const outputImageTokens =
		parseUsageNumber(usageRaw.output_tokens_details?.output_images) ??
		parseUsageNumber(usageRaw.output_image_tokens);
	if (outputImageTokens != null) ext.outputImageTokens = outputImageTokens;
	const outputAudioTokens =
		parseUsageNumber(usageRaw.output_tokens_details?.output_audio) ??
		parseUsageNumber(usageRaw.output_audio_tokens);
	if (outputAudioTokens != null) ext.outputAudioTokens = outputAudioTokens;
	const outputVideoTokens =
		parseUsageNumber(usageRaw.output_tokens_details?.output_videos) ??
		parseUsageNumber(usageRaw.output_video_tokens);
	if (outputVideoTokens != null) ext.outputVideoTokens = outputVideoTokens;
	const cachedWriteTokens =
		parseUsageNumber(usageRaw.output_tokens_details?.cached_tokens) ??
		parseUsageNumber(usageRaw.cached_write_tokens);
	if (cachedWriteTokens != null) ext.cachedWriteTokens = cachedWriteTokens;
	const datetimeRequests =
		parseUsageNumber(usageRaw.server_tool_use?.datetime_requests) ??
		parseUsageNumber(usageRaw.serverToolUse?.datetime_requests);
	if (datetimeRequests != null) {
		ext.serverToolUse = {
			datetime_requests: datetimeRequests,
		};
	}

	return {
		inputTokens,
		outputTokens,
		totalTokens,
		...(cachedInputTokens != null ? { cachedInputTokens } : {}),
		...(reasoningTokens != null ? { reasoningTokens } : {}),
		...(Object.keys(ext).length > 0 ? { _ext: ext } : {}),
	};
}

function resolveRawPayloadForUsage(payload: any): any {
	if (payload?.response && typeof payload.response === "object") return payload.response;
	return payload;
}

function resolveNativeId(payload: any): string | undefined {
	if (typeof payload?.id === "string" && payload.id.length > 0) return payload.id;
	if (typeof payload?.response?.id === "string" && payload.response.id.length > 0) return payload.response.id;
	return undefined;
}

function resolveModelFromPayload(payload: any): string | undefined {
	if (typeof payload?.model === "string" && payload.model.length > 0) return payload.model;
	if (typeof payload?.response?.model === "string" && payload.response.model.length > 0) return payload.response.model;
	return undefined;
}

function getChoiceAccumulator(
	choices: Map<number, StreamChoiceAccumulator>,
	index: number,
): StreamChoiceAccumulator {
	const existing = choices.get(index);
	if (existing) return existing;
	const created: StreamChoiceAccumulator = {
		textParts: [],
		reasoningParts: [],
		toolCallsByKey: new Map(),
		toolCallOrder: [],
	};
	choices.set(index, created);
	return created;
}

function buildIRFromAccumulatedEvents(args: {
	requestId: string;
	model: string;
	provider: string;
	choices: Map<number, StreamChoiceAccumulator>;
	globalFinishReason: IRChatResponse["choices"][number]["finishReason"] | null;
	usageRaw: any;
	nativeId?: string;
	modelFromStream?: string;
}): IRChatResponse {
	const sortedIndices = [...args.choices.keys()].sort((a, b) => a - b);
	if (sortedIndices.length === 0) sortedIndices.push(0);

	const outputChoices: IRChatResponse["choices"] = sortedIndices.map((choiceIndex) => {
		const accumulator = args.choices.get(choiceIndex) ?? {
			textParts: [],
			reasoningParts: [],
			toolCallsByKey: new Map<string, IRToolCall>(),
			toolCallOrder: [],
		};

		const content: IRContentPart[] = [];
		const reasoningText = accumulator.reasoningParts.join("");
		if (reasoningText.length > 0) {
			content.push({
				type: "reasoning_text",
				text: reasoningText,
			});
		}
		const outputText = accumulator.textParts.join("");
		if (outputText.length > 0) {
			content.push({
				type: "text",
				text: outputText,
			});
		}

		const toolCalls = accumulator.toolCallOrder
			.map((key) => accumulator.toolCallsByKey.get(key))
			.filter((value): value is IRToolCall => Boolean(value));
		const finishReason =
			accumulator.finishReason ??
			(toolCalls.length > 0 ? "tool_calls" : null) ??
			args.globalFinishReason ??
			"stop";

		return {
			index: choiceIndex,
			message: {
				role: "assistant",
				content,
				...(toolCalls.length > 0 ? { toolCalls } : {}),
			},
			finishReason,
		};
	});

	return {
		id: args.requestId,
		...(args.nativeId ? { nativeId: args.nativeId } : {}),
		created: Math.floor(Date.now() / 1000),
		model: args.modelFromStream ?? args.model,
		provider: args.provider,
		choices: outputChoices,
		usage: usageRawToIR(args.usageRaw),
	};
}

export async function consumeTextProtocolStreamToIR(args: {
	protocol: Protocol;
	stream: ReadableStream<Uint8Array>;
	requestId: string;
	model: string;
	provider: string;
}): Promise<{
	ir: IRChatResponse;
	rawResponse: any;
	usageRaw: any;
	frameCount: number;
	sawDone: boolean;
}> {
	const reader = args.stream.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let frameCount = 0;
	let sawDone = false;
	let lastPayload: any = null;
	let finalSnapshot: any = null;
	let usageRaw: any = null;
	let nativeId: string | undefined;
	let modelFromStream: string | undefined;
	let globalFinishReason: IRChatResponse["choices"][number]["finishReason"] | null = null;
	const choiceAccumulators = new Map<number, StreamChoiceAccumulator>();

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		const frames = buffer.split(/\n\n/);
		buffer = frames.pop() ?? "";

		for (const raw of frames) {
			const { eventName, data } = parseSseFrame(raw);
			if (!data) continue;
			if (data === "[DONE]") {
				sawDone = true;
				continue;
			}

			let payload: any;
			try {
				payload = JSON.parse(data);
			} catch {
				continue;
			}

			frameCount += 1;
			lastPayload = payload;
			const normalizedPayloadForMeta = resolveRawPayloadForUsage(payload);
			nativeId = nativeId ?? resolveNativeId(normalizedPayloadForMeta);
			modelFromStream = modelFromStream ?? resolveModelFromPayload(normalizedPayloadForMeta);
			const events = extractUnifiedStreamEvents({
				protocol: args.protocol,
				eventName,
				frame: payload,
			});

			for (const event of events) {
				if (event.type === "snapshot" && event.isFinal) {
					finalSnapshot = event.payload;
					nativeId = nativeId ?? resolveNativeId(event.payload);
					modelFromStream = modelFromStream ?? resolveModelFromPayload(event.payload);
					continue;
				}

				if (event.type === "usage") {
					usageRaw = event.usage;
					continue;
				}

				if (event.type === "delta_text") {
					const index = Number.isFinite(event.choiceIndex as number)
						? Number(event.choiceIndex)
						: 0;
					const accumulator = getChoiceAccumulator(choiceAccumulators, index);
					if (event.channel === "reasoning_text") {
						accumulator.reasoningParts.push(event.text);
					} else {
						accumulator.textParts.push(event.text);
					}
					continue;
				}

				if (event.type === "delta_tool") {
					const index = Number.isFinite(event.choiceIndex as number)
						? Number(event.choiceIndex)
						: 0;
					const accumulator = getChoiceAccumulator(choiceAccumulators, index);
					const key =
						event.toolCallId ??
						`tool_${index}_${event.toolIndex ?? accumulator.toolCallOrder.length}`;
					let toolCall = accumulator.toolCallsByKey.get(key);
					if (!toolCall) {
						toolCall = {
							id: event.toolCallId ?? `${args.requestId}_${key}`,
							name: event.toolName ?? "tool_call",
							arguments: "",
						};
						accumulator.toolCallsByKey.set(key, toolCall);
						accumulator.toolCallOrder.push(key);
					}
					if (typeof event.toolName === "string" && event.toolName.length > 0) {
						toolCall.name = event.toolName;
					}
					if (typeof event.argumentsDelta === "string") {
						toolCall.arguments += event.argumentsDelta;
					}
					if (typeof event.arguments === "string") {
						toolCall.arguments = event.arguments;
					}
					continue;
				}

				if (event.type === "stop") {
					const mapped = mapStopReasonToIr(event.finishReason);
					globalFinishReason = mapped;
				}
			}
		}
	}

	const trailing = buffer.trim();
	if (trailing.length > 0) {
		const { eventName, data } = parseSseFrame(trailing);
		if (data === "[DONE]") {
			sawDone = true;
		} else if (data.length > 0) {
			try {
				const payload = JSON.parse(data);
				frameCount += 1;
				lastPayload = payload;
				const events = extractUnifiedStreamEvents({
					protocol: args.protocol,
					eventName,
					frame: payload,
				});
				for (const event of events) {
					if (event.type === "snapshot" && event.isFinal) {
						finalSnapshot = event.payload;
						nativeId = nativeId ?? resolveNativeId(event.payload);
						modelFromStream = modelFromStream ?? resolveModelFromPayload(event.payload);
					}
					if (event.type === "usage") {
						usageRaw = event.usage;
					}
				}
			} catch {
				// ignore trailing invalid data frame
			}
		}
	}

	const rawResponse = finalSnapshot ?? resolveRawPayloadForUsage(lastPayload);
	const effectiveUsageRaw =
		usageRaw ??
		rawResponse?.usage ??
		lastPayload?.usage ??
		lastPayload?.response?.usage ??
		null;

	const ir = buildIRFromAccumulatedEvents({
		requestId: args.requestId,
		model: args.model,
		provider: args.provider,
		choices: choiceAccumulators,
		globalFinishReason,
		usageRaw: effectiveUsageRaw,
		nativeId,
		modelFromStream,
	});

	return {
		ir,
		rawResponse: rawResponse ?? null,
		usageRaw: effectiveUsageRaw,
		frameCount,
		sawDone,
	};
}
