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

import {
	buildSyntheticServerToolStream,
	consumeTextProtocolStreamToIR,
} from "./server-tools.stream";

export {
	buildSyntheticServerToolStream,
	consumeTextProtocolStreamToIR,
};
