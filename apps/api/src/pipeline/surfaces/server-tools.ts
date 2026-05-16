// Purpose: Text surface server-tool helpers.
// Why: Let gateway-managed tools run server-side without client round-trips.
// How: Rewrites request tools into callable function tools and executes supported calls.

import type { IRChatResponse, IRContentPart, IRMessage, IRToolCall, IRToolResult, IRUsage } from "@core/ir";
import type { Protocol } from "@protocols/detect";
import { encodeUnifiedStreamEvent, type StreamProtocol } from "@protocols/stream/encode";
import { extractUnifiedStreamEvents, type UnifiedStreamEvent } from "../after/stream-events";
import { getBindings } from "@/runtime/env";

export const DATETIME_SERVER_TOOL_TYPE = "gateway:datetime";
export const DATETIME_SERVER_TOOL_FUNCTION_NAME = "gateway_datetime";
export const WEB_SEARCH_SERVER_TOOL_TYPE = "gateway:web_search";
export const WEB_SEARCH_SERVER_TOOL_FUNCTION_NAME = "gateway_web_search";
export const WEB_FETCH_SERVER_TOOL_TYPE = "gateway:web_fetch";
export const WEB_FETCH_SERVER_TOOL_FUNCTION_NAME = "gateway_web_fetch";
const DEFAULT_TIMEZONE = "UTC";
const DEFAULT_WEB_SEARCH_MAX_RESULTS = 5;
const MAX_WEB_SEARCH_RESULTS = 10;
const DEFAULT_WEB_FETCH_MAX_CHARS = 12000;
const MAX_WEB_FETCH_MAX_CHARS = 50000;
const DEFAULT_EXA_BASE_URL = "https://api.exa.ai";

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

const WEB_SEARCH_TOOL_DESCRIPTION =
	"Search the web and return fresh sources with titles, URLs, highlights, and optional page text.";
const WEB_SEARCH_TOOL_PARAMETERS = {
	type: "object",
	properties: {
		query: {
			type: "string",
			description: "The search query to run.",
		},
		max_results: {
			type: "integer",
			description: "Maximum number of results to return. Defaults to 5 and caps at 10.",
		},
		include_text: {
			type: "boolean",
			description: "Include extracted page text for each result. Defaults to false.",
		},
		include_highlights: {
			type: "boolean",
			description: "Include query-relevant highlights for each result. Defaults to true.",
		},
	},
	required: ["query"],
	additionalProperties: false,
} as const;

const WEB_FETCH_TOOL_DESCRIPTION =
	"Fetch one HTTP(S) page and return bounded text content for grounding or follow-up extraction.";
const WEB_FETCH_TOOL_PARAMETERS = {
	type: "object",
	properties: {
		url: {
			type: "string",
			description: "HTTP(S) URL to fetch.",
		},
		max_chars: {
			type: "integer",
			description: "Maximum number of characters to return. Defaults to 12000 and caps at 50000.",
		},
	},
	required: ["url"],
	additionalProperties: false,
} as const;

export type ServerToolConfig = {
	enabled: boolean;
	datetimeDefaultTimezone: string;
	webSearchEnabled: boolean;
	webSearchMaxResults: number;
	webSearchIncludeText: boolean;
	webSearchIncludeHighlights: boolean;
	webFetchEnabled: boolean;
	webFetchMaxChars: number;
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

export type ServerToolExecutionMetrics = {
	datetimeRequests: number;
	webSearchRequests: number;
	webFetchRequests: number;
};

export type ServerToolContinuation = {
	assistantMessage: Extract<IRMessage, { role: "assistant" }>;
	toolResults: IRToolResult[];
	usage: ServerToolExecutionMetrics;
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

function readBooleanWithFallback(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

function readPositiveIntWithFallback(
	value: unknown,
	fallback: number,
	maximum: number,
): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
	const next = Math.floor(value);
	if (next <= 0) return fallback;
	return Math.min(maximum, next);
}

function parseWebSearchToolDefaults(tool: any): {
	maxResults: number;
	includeText: boolean;
	includeHighlights: boolean;
} {
	const parameters =
		tool?.parameters && typeof tool.parameters === "object"
			? tool.parameters
			: {};
	const maxResults = readPositiveIntWithFallback(
		parameters?.max_results ?? tool?.max_results,
		DEFAULT_WEB_SEARCH_MAX_RESULTS,
		MAX_WEB_SEARCH_RESULTS,
	);
	const includeText = readBooleanWithFallback(
		parameters?.include_text ?? tool?.include_text,
		false,
	);
	const includeHighlights = readBooleanWithFallback(
		parameters?.include_highlights ?? tool?.include_highlights,
		true,
	);
	return {
		maxResults,
		includeText,
		includeHighlights,
	};
}

function parseWebFetchToolDefaults(tool: any): {
	maxChars: number;
} {
	const parameters =
		tool?.parameters && typeof tool.parameters === "object"
			? tool.parameters
			: {};
	return {
		maxChars: readPositiveIntWithFallback(
			parameters?.max_chars ?? tool?.max_chars,
			DEFAULT_WEB_FETCH_MAX_CHARS,
			MAX_WEB_FETCH_MAX_CHARS,
		),
	};
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
		if (toolChoice === WEB_SEARCH_SERVER_TOOL_TYPE) {
			if (protocol === "anthropic.messages") {
				return { type: "tool", name: WEB_SEARCH_SERVER_TOOL_FUNCTION_NAME };
			}
			return {
				type: "function",
				function: { name: WEB_SEARCH_SERVER_TOOL_FUNCTION_NAME },
			};
		}
		if (toolChoice === WEB_FETCH_SERVER_TOOL_TYPE) {
			if (protocol === "anthropic.messages") {
				return { type: "tool", name: WEB_FETCH_SERVER_TOOL_FUNCTION_NAME };
			}
			return {
				type: "function",
				function: { name: WEB_FETCH_SERVER_TOOL_FUNCTION_NAME },
			};
		}
		return toolChoice;
	}
	if (!toolChoice || typeof toolChoice !== "object") return toolChoice;

	const choiceName =
		toNonEmptyString((toolChoice as any)?.function?.name) ??
		toNonEmptyString((toolChoice as any)?.name) ??
		null;

	if (choiceName === DATETIME_SERVER_TOOL_TYPE) {
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

	if (choiceName === WEB_SEARCH_SERVER_TOOL_TYPE) {
		if (protocol === "anthropic.messages") {
			return {
				type: "tool",
				name: WEB_SEARCH_SERVER_TOOL_FUNCTION_NAME,
			};
		}

		return {
			type: "function",
			function: { name: WEB_SEARCH_SERVER_TOOL_FUNCTION_NAME },
		};
	}

	if (choiceName === WEB_FETCH_SERVER_TOOL_TYPE) {
		if (protocol === "anthropic.messages") {
			return {
				type: "tool",
				name: WEB_FETCH_SERVER_TOOL_FUNCTION_NAME,
			};
		}

		return {
			type: "function",
			function: { name: WEB_FETCH_SERVER_TOOL_FUNCTION_NAME },
		};
	}

	return toolChoice;
}

export function prepareServerToolsForTextRequest(
	body: any,
	protocol: Protocol,
): PrepareRequestResult {
	const nextBody = cloneBody(body);
	const tools = Array.isArray(nextBody?.tools) ? nextBody.tools : [];

	let datetimeEnabled = false;
	let datetimeDefaultTimezone = DEFAULT_TIMEZONE;
	let webSearchEnabled = false;
	let webSearchMaxResults = DEFAULT_WEB_SEARCH_MAX_RESULTS;
	let webSearchIncludeText = false;
	let webSearchIncludeHighlights = true;
	let webFetchEnabled = false;
	let webFetchMaxChars = DEFAULT_WEB_FETCH_MAX_CHARS;
	const filteredTools: any[] = [];

	for (const tool of tools) {
		if (!tool || typeof tool !== "object") {
			filteredTools.push(tool);
			continue;
		}

		if (tool.type === DATETIME_SERVER_TOOL_TYPE) {
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
			continue;
		}

		if (tool.type === WEB_SEARCH_SERVER_TOOL_TYPE) {
			webSearchEnabled = true;
			const defaults = parseWebSearchToolDefaults(tool);
			webSearchMaxResults = defaults.maxResults;
			webSearchIncludeText = defaults.includeText;
			webSearchIncludeHighlights = defaults.includeHighlights;
			continue;
		}

		if (tool.type === WEB_FETCH_SERVER_TOOL_TYPE) {
			webFetchEnabled = true;
			const defaults = parseWebFetchToolDefaults(tool);
			webFetchMaxChars = defaults.maxChars;
			continue;
		}

		if (tool.type !== DATETIME_SERVER_TOOL_TYPE) {
			filteredTools.push(tool);
		}
	}

	if (!datetimeEnabled && !webSearchEnabled && !webFetchEnabled) {
		return {
			ok: true,
			body: nextBody,
			config: {
				enabled: false,
				datetimeDefaultTimezone: DEFAULT_TIMEZONE,
				webSearchEnabled: false,
				webSearchMaxResults: DEFAULT_WEB_SEARCH_MAX_RESULTS,
				webSearchIncludeText: false,
				webSearchIncludeHighlights: true,
				webFetchEnabled: false,
				webFetchMaxChars: DEFAULT_WEB_FETCH_MAX_CHARS,
			},
		};
	}

	if (protocol === "anthropic.messages") {
		if (datetimeEnabled && !hasAnthropicToolNamed(filteredTools, DATETIME_SERVER_TOOL_FUNCTION_NAME)) {
			filteredTools.push({
				name: DATETIME_SERVER_TOOL_FUNCTION_NAME,
				description: DATETIME_TOOL_DESCRIPTION,
				input_schema: DATETIME_TOOL_PARAMETERS,
			});
		}
		if (webSearchEnabled && !hasAnthropicToolNamed(filteredTools, WEB_SEARCH_SERVER_TOOL_FUNCTION_NAME)) {
			filteredTools.push({
				name: WEB_SEARCH_SERVER_TOOL_FUNCTION_NAME,
				description: WEB_SEARCH_TOOL_DESCRIPTION,
				input_schema: WEB_SEARCH_TOOL_PARAMETERS,
			});
		}
		if (webFetchEnabled && !hasAnthropicToolNamed(filteredTools, WEB_FETCH_SERVER_TOOL_FUNCTION_NAME)) {
			filteredTools.push({
				name: WEB_FETCH_SERVER_TOOL_FUNCTION_NAME,
				description: WEB_FETCH_TOOL_DESCRIPTION,
				input_schema: WEB_FETCH_TOOL_PARAMETERS,
			});
		}
	} else {
		if (datetimeEnabled && !hasOpenAIFunctionToolNamed(filteredTools, DATETIME_SERVER_TOOL_FUNCTION_NAME)) {
			filteredTools.push({
				type: "function",
				function: {
					name: DATETIME_SERVER_TOOL_FUNCTION_NAME,
					description: DATETIME_TOOL_DESCRIPTION,
					parameters: DATETIME_TOOL_PARAMETERS,
				},
			});
		}
		if (webSearchEnabled && !hasOpenAIFunctionToolNamed(filteredTools, WEB_SEARCH_SERVER_TOOL_FUNCTION_NAME)) {
			filteredTools.push({
				type: "function",
				function: {
					name: WEB_SEARCH_SERVER_TOOL_FUNCTION_NAME,
					description: WEB_SEARCH_TOOL_DESCRIPTION,
					parameters: WEB_SEARCH_TOOL_PARAMETERS,
				},
			});
		}
		if (webFetchEnabled && !hasOpenAIFunctionToolNamed(filteredTools, WEB_FETCH_SERVER_TOOL_FUNCTION_NAME)) {
			filteredTools.push({
				type: "function",
				function: {
					name: WEB_FETCH_SERVER_TOOL_FUNCTION_NAME,
					description: WEB_FETCH_TOOL_DESCRIPTION,
					parameters: WEB_FETCH_TOOL_PARAMETERS,
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
			enabled: datetimeEnabled || webSearchEnabled || webFetchEnabled,
			datetimeDefaultTimezone,
			webSearchEnabled,
			webSearchMaxResults,
			webSearchIncludeText,
			webSearchIncludeHighlights,
			webFetchEnabled,
			webFetchMaxChars,
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

function resolveExaSearchConfig(): { apiKey: string; baseUrl: string } | null {
	try {
		const bindings = getBindings();
		const apiKey = String(bindings.EXA_API_KEY ?? "").trim();
		if (!apiKey) return null;
		const baseUrl = String(bindings.EXA_BASE_URL ?? DEFAULT_EXA_BASE_URL).trim() || DEFAULT_EXA_BASE_URL;
		return {
			apiKey,
			baseUrl: baseUrl.replace(/\/+$/, ""),
		};
	} catch {
		return null;
	}
}

function parseWebSearchQuery(args: Record<string, unknown>): string | null {
	return toNonEmptyString(args.query);
}

function parseWebFetchUrl(args: Record<string, unknown>): string | null {
	const rawUrl = toNonEmptyString(args.url);
	if (!rawUrl) return null;
	try {
		const parsed = new URL(rawUrl);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			return null;
		}
		return parsed.toString();
	} catch {
		return null;
	}
}

function parseWebFetchMaxChars(
	args: Record<string, unknown>,
	fallback: number,
): number {
	return readPositiveIntWithFallback(
		args.max_chars,
		fallback,
		MAX_WEB_FETCH_MAX_CHARS,
	);
}

function decodeHtmlEntities(value: string): string {
	return value
		.replace(/&nbsp;/gi, " ")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"')
		.replace(/&#39;/gi, "'")
		.replace(/&amp;/gi, "&");
}

function collapseWhitespace(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function extractHtmlTitle(value: string): string | null {
	const match = value.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
	if (!match) return null;
	return collapseWhitespace(decodeHtmlEntities(match[1] ?? ""));
}

function htmlToText(value: string): string {
	const stripped = value
		.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
		.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
		.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, " ")
		.replace(/<svg\b[^>]*>[\s\S]*?<\/svg\s*>/gi, " ")
		.replace(/<[^>]+>/g, " ");
	return collapseWhitespace(decodeHtmlEntities(stripped));
}

function isSupportedFetchedContentType(contentType: string | null): boolean {
	if (!contentType) return true;
	const normalized = contentType.toLowerCase();
	return (
		normalized.startsWith("text/") ||
		normalized.includes("json") ||
		normalized.includes("xml") ||
		normalized.includes("javascript")
	);
}

async function executeWebFetchToolCall(
	call: { id: string; arguments: string },
	config: ServerToolConfig,
): Promise<{ toolResult: IRToolResult; webFetchRequests: number }> {
	const args = parseJsonObject(call.arguments);
	const url = parseWebFetchUrl(args);
	if (!url) {
		return {
			toolResult: {
				toolCallId: call.id,
				isError: true,
				content: JSON.stringify({
					error: "invalid_url",
					message: "url must be a valid HTTP(S) URL for gateway web fetch",
				}),
			},
			webFetchRequests: 0,
		};
	}

	const maxChars = parseWebFetchMaxChars(args, config.webFetchMaxChars);

	try {
		const response = await fetch(url, {
			method: "GET",
			headers: {
				Accept: "text/html,text/plain,application/json;q=0.9,*/*;q=0.8",
				"User-Agent": "AI-Stats-Gateway/1.0 (+https://ai-stats.phaseo.app)",
			},
			redirect: "follow",
		});

		if (!response.ok) {
			const failureText = await response.text();
			return {
				toolResult: {
					toolCallId: call.id,
					isError: true,
					content: JSON.stringify({
						error: "fetch_request_failed",
						status: response.status,
						message: failureText.slice(0, 1000),
					}),
				},
				webFetchRequests: 0,
			};
		}

		const contentType = toNonEmptyString(response.headers.get("content-type"));
		if (!isSupportedFetchedContentType(contentType)) {
			return {
				toolResult: {
					toolCallId: call.id,
					isError: true,
					content: JSON.stringify({
						error: "unsupported_content_type",
						content_type: contentType,
						message: "gateway web fetch only supports text-like content types",
					}),
				},
				webFetchRequests: 0,
			};
		}

		const rawText = await response.text();
		const normalizedText =
			contentType?.toLowerCase().includes("html")
				? htmlToText(rawText)
				: rawText.trim();
		const title =
			contentType?.toLowerCase().includes("html")
				? extractHtmlTitle(rawText)
				: null;
		const text = normalizedText.slice(0, maxChars);
		const truncated = normalizedText.length > text.length;

		return {
			toolResult: {
				toolCallId: call.id,
				content: JSON.stringify({
					provider: "fetch",
					url,
					final_url: toNonEmptyString(response.url) ?? url,
					status: response.status,
					content_type: contentType,
					title,
					text,
					truncated,
					returned_chars: text.length,
				}),
			},
			webFetchRequests: 1,
		};
	} catch (error) {
		return {
			toolResult: {
				toolCallId: call.id,
				isError: true,
				content: JSON.stringify({
					error: "fetch_request_error",
					message: error instanceof Error ? error.message : String(error),
				}),
			},
			webFetchRequests: 0,
		};
	}
}

async function executeWebSearchToolCall(
	call: { id: string; arguments: string },
	config: ServerToolConfig,
): Promise<{ toolResult: IRToolResult; webFetchRequests: number }> {
	const args = parseJsonObject(call.arguments);
	const query = parseWebSearchQuery(args);
	if (!query) {
		return {
			toolResult: {
				toolCallId: call.id,
				isError: true,
				content: JSON.stringify({
					error: "invalid_query",
					message: "query is required for gateway web search",
				}),
			},
			webFetchRequests: 0,
		};
	}

	const searchConfig = resolveExaSearchConfig();
	if (!searchConfig) {
		return {
			toolResult: {
				toolCallId: call.id,
				isError: true,
				content: JSON.stringify({
					error: "search_not_configured",
					message: "server-managed web search is not configured",
				}),
			},
			webFetchRequests: 0,
		};
	}

	const maxResults = readPositiveIntWithFallback(
		args.max_results,
		config.webSearchMaxResults,
		MAX_WEB_SEARCH_RESULTS,
	);
	const includeText = readBooleanWithFallback(
		args.include_text,
		config.webSearchIncludeText,
	);
	const includeHighlights = readBooleanWithFallback(
		args.include_highlights,
		config.webSearchIncludeHighlights,
	);

	const contents: Record<string, unknown> = {};
	if (includeText) {
		contents.text = true;
	}
	if (includeHighlights || !includeText) {
		contents.highlights = true;
	}

	try {
		const response = await fetch(`${searchConfig.baseUrl}/search`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": searchConfig.apiKey,
			},
			body: JSON.stringify({
				query,
				type: "auto",
				numResults: maxResults,
				contents,
			}),
		});

		if (!response.ok) {
			const failureText = await response.text();
			return {
				toolResult: {
					toolCallId: call.id,
					isError: true,
					content: JSON.stringify({
						error: "search_request_failed",
						status: response.status,
						message: failureText.slice(0, 1000),
					}),
				},
				webFetchRequests: 0,
			};
		}

		const json = await response.json() as Record<string, any>;
		const results = Array.isArray(json.results) ? json.results : [];
		const normalizedResults = results.slice(0, maxResults).map((result) => ({
			title: toNonEmptyString(result?.title) ?? null,
			url: toNonEmptyString(result?.url) ?? null,
			published_date: toNonEmptyString(result?.publishedDate) ?? null,
			author: toNonEmptyString(result?.author) ?? null,
			highlights: Array.isArray(result?.highlights)
				? result.highlights.filter((entry: unknown) => typeof entry === "string")
				: [],
			text: includeText ? (toNonEmptyString(result?.text) ?? null) : null,
			summary: toNonEmptyString(result?.summary) ?? null,
		}));
		const webFetchRequests = normalizedResults.filter((result) =>
			(includeText && typeof result.text === "string" && result.text.length > 0) ||
			(Array.isArray(result.highlights) && result.highlights.length > 0)
		).length;

		return {
			toolResult: {
				toolCallId: call.id,
				content: JSON.stringify({
					provider: "exa",
					request_id: toNonEmptyString(json.requestId) ?? null,
					search_type: toNonEmptyString(json.searchType) ?? null,
					query,
					results: normalizedResults,
				}),
			},
			webFetchRequests,
		};
	} catch (error) {
		return {
			toolResult: {
				toolCallId: call.id,
				isError: true,
				content: JSON.stringify({
					error: "search_request_error",
					message: error instanceof Error ? error.message : String(error),
				}),
			},
			webFetchRequests: 0,
		};
	}
}

export async function buildServerToolContinuation(
	irResponse: IRChatResponse,
	config: ServerToolConfig,
) : Promise<ServerToolContinuation | null> {
	if (!config.enabled) return null;
	const firstChoice = Array.isArray(irResponse.choices) ? irResponse.choices[0] : null;
	if (!firstChoice) return null;
	const toolCalls = Array.isArray(firstChoice.message?.toolCalls)
		? firstChoice.message.toolCalls
		: [];
	if (toolCalls.length === 0) return null;

	const serverToolCalls = toolCalls.filter(
		(call) =>
			call?.name === DATETIME_SERVER_TOOL_FUNCTION_NAME ||
			call?.name === WEB_SEARCH_SERVER_TOOL_FUNCTION_NAME ||
			call?.name === WEB_FETCH_SERVER_TOOL_FUNCTION_NAME,
	);
	if (serverToolCalls.length === 0) return null;

	// If mixed with client-managed function calls, skip server execution for this turn.
	if (serverToolCalls.length !== toolCalls.length) return null;

	const toolResults: IRToolResult[] = [];
	const usage: ServerToolExecutionMetrics = {
		datetimeRequests: 0,
		webSearchRequests: 0,
		webFetchRequests: 0,
	};
	for (const call of serverToolCalls) {
		if (call.name === DATETIME_SERVER_TOOL_FUNCTION_NAME) {
			toolResults.push(
				executeDatetimeToolCall(
					{ id: call.id, arguments: call.arguments },
					config.datetimeDefaultTimezone,
				),
			);
			usage.datetimeRequests += 1;
			continue;
		}

		if (call.name === WEB_SEARCH_SERVER_TOOL_FUNCTION_NAME) {
			const executed = await executeWebSearchToolCall(
				{ id: call.id, arguments: call.arguments },
				config,
			);
			toolResults.push(executed.toolResult);
			usage.webSearchRequests += 1;
			usage.webFetchRequests += Math.max(0, executed.webFetchRequests);
			continue;
		}

		if (call.name === WEB_FETCH_SERVER_TOOL_FUNCTION_NAME) {
			const executed = await executeWebFetchToolCall(
				{ id: call.id, arguments: call.arguments },
				config,
			);
			toolResults.push(executed.toolResult);
			usage.webFetchRequests += Math.max(0, executed.webFetchRequests);
		}
	}

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
		usage,
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
					web_search_requests:
						(base._ext?.serverToolUse?.web_search_requests ?? 0) +
						(incoming._ext?.serverToolUse?.web_search_requests ?? 0),
					web_fetch_requests:
						(base._ext?.serverToolUse?.web_fetch_requests ?? 0) +
						(incoming._ext?.serverToolUse?.web_fetch_requests ?? 0),
				},
			}
			: {
				serverToolUse: {
					datetime_requests:
						(base._ext?.serverToolUse?.datetime_requests ?? 0) +
						(incoming._ext?.serverToolUse?.datetime_requests ?? 0),
					web_search_requests:
						(base._ext?.serverToolUse?.web_search_requests ?? 0) +
						(incoming._ext?.serverToolUse?.web_search_requests ?? 0),
					web_fetch_requests:
						(base._ext?.serverToolUse?.web_fetch_requests ?? 0) +
						(incoming._ext?.serverToolUse?.web_fetch_requests ?? 0),
				},
			},
	};
}

export function attachServerToolUsage(
	usage: IRUsage | undefined,
	args: ServerToolExecutionMetrics,
): IRUsage | undefined {
	if (
		!usage &&
		args.datetimeRequests <= 0 &&
		args.webSearchRequests <= 0 &&
		args.webFetchRequests <= 0
	) return usage;
	const baseUsage: IRUsage = usage
		? { ...usage, _ext: usage._ext ? { ...usage._ext } : undefined }
		: {
			inputTokens: 0,
			outputTokens: 0,
			totalTokens: 0,
		};
	const existing = baseUsage._ext?.serverToolUse;
	baseUsage._ext = {
		...(baseUsage._ext ?? {}),
		serverToolUse: {
			...(existing ?? {}),
			datetime_requests: (existing?.datetime_requests ?? 0) + Math.max(0, args.datetimeRequests),
			web_search_requests: (existing?.web_search_requests ?? 0) + Math.max(0, args.webSearchRequests),
			web_fetch_requests: (existing?.web_fetch_requests ?? 0) + Math.max(0, args.webFetchRequests),
		},
	};
	return baseUsage;
}

export function attachServerToolUsageToRawUsage(
	usage: Record<string, any> | undefined,
	args: ServerToolExecutionMetrics,
): Record<string, any> | undefined {
	if (
		!usage &&
		args.datetimeRequests <= 0 &&
		args.webSearchRequests <= 0 &&
		args.webFetchRequests <= 0
	) return usage;
	const base = { ...(usage ?? {}) };
	const existing = base?.server_tool_use ?? {};
	base.server_tool_use = {
		...existing,
		datetime_requests:
			(Number(existing?.datetime_requests ?? 0) || 0) + Math.max(0, args.datetimeRequests),
		web_search_requests:
			(Number(existing?.web_search_requests ?? 0) || 0) + Math.max(0, args.webSearchRequests),
		web_fetch_requests:
			(Number(existing?.web_fetch_requests ?? 0) || 0) + Math.max(0, args.webFetchRequests),
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
