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
export const WEB_SEARCH_SERVER_TOOL_TYPE = "phaseo:web_search";
export const GATEWAY_WEB_SEARCH_SERVER_TOOL_TYPE = "gateway:web_search";
export const WEB_SEARCH_SERVER_TOOL_FUNCTION_NAME = "phaseo_web_search";
export const WEB_FETCH_SERVER_TOOL_TYPE = "phaseo:web_fetch";
export const GATEWAY_WEB_FETCH_SERVER_TOOL_TYPE = "gateway:web_fetch";
export const WEB_FETCH_SERVER_TOOL_FUNCTION_NAME = "phaseo_web_fetch";
export const ADVISOR_SERVER_TOOL_TYPE = "phaseo:advisor";
export const ADVISOR_SERVER_TOOL_FUNCTION_NAME = "phaseo_advisor";
export const IMAGE_GENERATION_SERVER_TOOL_TYPE = "phaseo:image_generation";
export const IMAGE_GENERATION_SERVER_TOOL_FUNCTION_NAME = "phaseo_image_generation";
export const APPLY_PATCH_SERVER_TOOL_TYPE = "phaseo:apply_patch";
export const APPLY_PATCH_SERVER_TOOL_FUNCTION_NAME = "phaseo_apply_patch";
const DEFAULT_TIMEZONE = "UTC";
const DEFAULT_WEB_SEARCH_MAX_RESULTS = 5;
const MAX_WEB_SEARCH_RESULTS = 25;
const DEFAULT_WEB_SEARCH_MAX_TOTAL_RESULTS = 25;
const MAX_WEB_SEARCH_MAX_TOTAL_RESULTS = 100;
const DEFAULT_WEB_FETCH_MAX_CHARS = 12000;
const MAX_WEB_FETCH_MAX_CHARS = 50000;
const SERVER_TOOL_FETCH_TIMEOUT_MS = 15000;
const SERVER_TOOL_DIRECT_FETCH_MAX_REDIRECTS = 5;
const DEFAULT_EXA_BASE_URL = "https://api.exa.ai";
const DEFAULT_PARALLEL_BASE_URL = "https://api.parallel.ai";
const DEFAULT_FIRECRAWL_BASE_URL = "https://api.firecrawl.dev";
const DEFAULT_WEB_SEARCH_ENGINE = "exa";
const DEFAULT_WEB_FETCH_ENGINE = "direct";
const DEFAULT_IMAGE_GENERATION_MODEL = "openai/gpt-image-2";

const WEB_SEARCH_ENGINE_VALUES = ["auto", "native", "exa", "firecrawl", "parallel"] as const;
const WEB_FETCH_ENGINE_VALUES = ["auto", "native", "direct", "exa", "firecrawl", "parallel"] as const;

const DATETIME_TOOL_DESCRIPTION =
	"Get the current date and time. Optionally provide one or more IANA timezones (for example, Europe/London).";
const DATETIME_TOOL_PARAMETERS = {
	type: "object",
	properties: {
		timezones: {
			type: "array",
			items: { type: "string" },
			description:
				"IANA timezone names to return in one call. Use this when comparing local time with UTC or another timezone.",
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
			description: "Maximum number of results per search call. Defaults to 5 and caps at 25.",
		},
		max_total_results: {
			type: "integer",
			description: "Maximum cumulative result count across all search calls in this request.",
		},
		engine: {
			type: "string",
			enum: WEB_SEARCH_ENGINE_VALUES,
			description: "Search engine. auto resolves to managed Exa search; native is converted to a provider-native web search tool.",
		},
		search_context_size: {
			type: "string",
			enum: ["low", "medium", "high"],
			description: "Requested search context budget for returned highlights/text.",
		},
		allowed_domains: {
			type: "array",
			items: { type: "string" },
			description: "Only return results from these domains when supported by the engine.",
		},
		excluded_domains: {
			type: "array",
			items: { type: "string" },
			description: "Exclude results from these domains when supported by the engine.",
		},
		include_text: {
			type: "boolean",
			description: "Include extracted page text for each result. Defaults to false.",
		},
		include_highlights: {
			type: "boolean",
			description: "Include query-relevant highlights for each result. Defaults to true.",
		},
		max_characters: {
			type: "integer",
			description: "Maximum characters of text per result when include_text is true.",
		},
		user_location: {
			type: "object",
			description: "Approximate user location for engines that support localized search.",
			additionalProperties: true,
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
		engine: {
			type: "string",
			enum: WEB_FETCH_ENGINE_VALUES,
			description: "Fetch engine. direct uses gateway HTTP fetch; exa uses Exa contents extraction.",
		},
		max_chars: {
			type: "integer",
			description: "Maximum number of characters to return. Defaults to 12000 and caps at 50000.",
		},
		max_content_tokens: {
			type: "integer",
			description: "Token-style bounded fetch size alias; approximated as max_chars when max_chars is omitted.",
		},
		allowed_domains: {
			type: "array",
			items: { type: "string" },
			description: "Only fetch URLs from these domains.",
		},
		blocked_domains: {
			type: "array",
			items: { type: "string" },
			description: "Reject fetches for these domains.",
		},
	},
	required: ["url"],
	additionalProperties: false,
} as const;

const IMAGE_GENERATION_TOOL_DESCRIPTION =
	"Generate an image from a text prompt using a Phaseo image generation model.";
const IMAGE_GENERATION_TOOL_PARAMETERS = {
	type: "object",
	properties: {
		prompt: {
			type: "string",
			description: "Detailed description of the image to generate.",
		},
		description: {
			type: "string",
			description: "Alias for prompt. Use this when the model describes the image to generate.",
		},
		model: {
			type: "string",
			description: "Optional image generation model override when the tool definition does not pin one.",
		},
		quality: {
			type: "string",
			description: "Model-dependent image quality level such as low, medium, or high.",
		},
		size: {
			type: "string",
			description: "Model-dependent output size such as 1024x1024.",
		},
		aspect_ratio: {
			type: "string",
			description: "Requested aspect ratio such as 1:1, 16:9, or 4:3.",
		},
		background: {
			type: "string",
			description: "Requested background style such as transparent or opaque.",
		},
		output_format: {
			type: "string",
			description: "Requested output format such as png, jpeg, or webp.",
		},
		output_compression: {
			type: "number",
			description: "Compression level from 0 to 100 for lossy output formats.",
		},
		moderation: {
			type: "string",
			description: "Model-dependent moderation setting.",
		},
	},
	additionalProperties: false,
} as const;

const APPLY_PATCH_TOOL_DESCRIPTION =
	"Propose a file create, update, or delete as a V4A-style patch. Phaseo validates the patch but does not apply it.";
const APPLY_PATCH_TOOL_PARAMETERS = {
	type: "object",
	properties: {
		operation: {
			type: "object",
			properties: {
				type: {
					type: "string",
					enum: ["create_file", "update_file", "delete_file"],
					description: "Patch operation type.",
				},
				path: {
					type: "string",
					description: "Target file path for the patch operation.",
				},
				diff: {
					type: "string",
					description: "Patch diff. Required for create_file and update_file.",
				},
			},
			required: ["type", "path"],
			additionalProperties: false,
		},
	},
	required: ["operation"],
	additionalProperties: false,
} as const;

export type ImageGenerationServerToolConfig = {
	model?: string;
	quality?: string;
	size?: string;
	aspectRatio?: string;
	background?: string;
	outputFormat?: string;
	outputCompression?: number;
	moderation?: string;
};

const ADVISOR_MIN_MAX_TOKENS = 1024;
const DEFAULT_ADVISOR_MAX_TOKENS = 1400;
const DEFAULT_ADVISOR_MAX_USES = 1;
const ADVISOR_NAME_PATTERN = /^[A-Za-z0-9 _-]{1,64}$/;

export const ADVISOR_DEFAULT_INSTRUCTIONS =
	"You are an expert advisor model. Provide concise, actionable guidance for the calling model. Do not answer the user directly unless the prompt asks for it; give advice the calling model can use.";

function advisorToolParameters(allowModelOverride: boolean, requirePrompt: boolean) {
	return {
		type: "object",
		properties: {
			prompt: {
				type: "string",
				description: "The specific question, plan, or context to ask the advisor model to review.",
			},
			...(allowModelOverride
				? {
					model: {
						type: "string",
						description: "Advisor model to call when the tool definition does not pin one.",
					},
				}
				: {}),
		},
		...(requirePrompt ? { required: ["prompt"] } : {}),
		additionalProperties: false,
	} as const;
}

export type AdvisorServerToolConfig = {
	functionName: string;
	name?: string;
	model?: string;
	instructions?: string;
	forwardTranscript: boolean;
	maxUses: number;
	maxTokens: number;
	reasoning?: Record<string, unknown>;
	temperature?: number;
};

function advisorInputSchema(config: AdvisorServerToolConfig) {
	return advisorToolParameters(!config.model, !config.forwardTranscript);
}

function advisorToolDescription(config: AdvisorServerToolConfig): string {
	const name = config.name ? ` "${config.name}"` : "";
	return `Consult the${name} advisor model for planning, review, or course correction. Provide a concise prompt describing what advice is needed.`;
}

function sanitizeAdvisorFunctionName(name: string | undefined): string {
	if (!name) return ADVISOR_SERVER_TOOL_FUNCTION_NAME;
	const suffix = name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, "_")
		.replace(/_+/g, "_")
		.replace(/^_+|_+$/g, "");
	return suffix ? `${ADVISOR_SERVER_TOOL_FUNCTION_NAME}_${suffix}` : ADVISOR_SERVER_TOOL_FUNCTION_NAME;
}

type WebSearchEngine = (typeof WEB_SEARCH_ENGINE_VALUES)[number];
type WebSearchContextSize = "low" | "medium" | "high";
type WebFetchEngine = (typeof WEB_FETCH_ENGINE_VALUES)[number];

export type ServerToolConfig = {
	enabled: boolean;
	datetimeDefaultTimezones: string[];
	webSearchEnabled: boolean;
	webSearchEngine?: WebSearchEngine;
	webSearchMaxResults: number;
	webSearchMaxTotalResults?: number;
	webSearchContextSize?: WebSearchContextSize;
	webSearchMaxCharacters?: number;
	webSearchIncludeText: boolean;
	webSearchIncludeHighlights: boolean;
	webSearchAllowedDomains?: string[];
	webSearchExcludedDomains?: string[];
	webFetchEnabled: boolean;
	webFetchEngine?: WebFetchEngine;
	webFetchMaxChars: number;
	webFetchAllowedDomains?: string[];
	webFetchBlockedDomains?: string[];
	advisorEnabled?: boolean;
	advisors?: Record<string, AdvisorServerToolConfig>;
	defaultAdvisorFunctionName?: string;
	defaultAdvisorModel?: string;
	imageGenerationEnabled?: boolean;
	imageGeneration?: ImageGenerationServerToolConfig;
	applyPatchEnabled?: boolean;
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
	webSearchResults: number;
	webSearchExtraResults: number;
	webFetchRequests: number;
	advisorRequests: number;
	imageGenerationRequests: number;
	applyPatchRequests: number;
};

export type ServerToolContinuation = {
	assistantMessage: Extract<IRMessage, { role: "assistant" }>;
	toolResults: IRToolResult[];
	usage: ServerToolExecutionMetrics;
	advisorUsage?: IRUsage;
	imageGenerationUsage?: IRUsage;
};

export type AdvisorExecutionResult = {
	ok: true;
	content: string;
	usage?: IRUsage;
} | {
	ok: false;
	message: string;
};

export type AdvisorExecutor = (args: {
	model: string;
	prompt: string;
	maxTokens: number;
	instructions?: string;
	forwardTranscript: boolean;
	reasoning?: Record<string, unknown>;
	temperature?: number;
}) => Promise<AdvisorExecutionResult>;

export type ImageGenerationExecutionResult = {
	ok: true;
	imageUrl?: string;
	b64Json?: string;
	mimeType?: string;
	model: string;
	usage?: IRUsage;
} | {
	ok: false;
	message: string;
};

export type ImageGenerationExecutor = (args: {
	model: string;
	prompt: string;
	quality?: string;
	size?: string;
	aspectRatio?: string;
	background?: string;
	outputFormat?: string;
	outputCompression?: number;
	moderation?: string;
}) => Promise<ImageGenerationExecutionResult>;

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

function appendTimezone(timezones: string[], value: unknown): void {
	const timezone = toNonEmptyString(value);
	if (timezone && !timezones.includes(timezone)) {
		timezones.push(timezone);
	}
}

function appendTimezoneList(timezones: string[], value: unknown): void {
	if (!Array.isArray(value)) return;
	for (const item of value) {
		appendTimezone(timezones, item);
	}
}

function parseDatetimeToolTimezones(tool: any): string[] {
	const timezones: string[] = [];
	appendTimezone(timezones, tool?.parameters?.timezone);
	appendTimezoneList(timezones, tool?.parameters?.timezones);
	return timezones;
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

function readStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((entry) => toNonEmptyString(entry))
		.filter((entry): entry is string => Boolean(entry));
}

function readWebSearchEngine(value: unknown): WebSearchEngine {
	const normalized = toNonEmptyString(value)?.toLowerCase();
	if (WEB_SEARCH_ENGINE_VALUES.includes(normalized as WebSearchEngine)) {
		return normalized as WebSearchEngine;
	}
	return DEFAULT_WEB_SEARCH_ENGINE;
}

function readWebSearchContextSize(value: unknown): WebSearchContextSize {
	const normalized = toNonEmptyString(value)?.toLowerCase();
	if (normalized === "low" || normalized === "medium" || normalized === "high") {
		return normalized;
	}
	return "medium";
}

function readWebFetchEngine(value: unknown): WebFetchEngine {
	const normalized = toNonEmptyString(value)?.toLowerCase();
	if (WEB_FETCH_ENGINE_VALUES.includes(normalized as WebFetchEngine)) {
		return normalized as WebFetchEngine;
	}
	return DEFAULT_WEB_FETCH_ENGINE;
}

function resolveDefaultWebFetchEngine(protocol: Protocol): WebFetchEngine {
	if (protocol === "anthropic.messages") return "native";
	return resolveExaSearchConfig() ? "exa" : "direct";
}

function parseWebSearchToolDefaults(tool: any): {
	engine: WebSearchEngine;
	maxResults: number;
	maxTotalResults: number;
	searchContextSize: WebSearchContextSize;
	maxCharacters: number | null;
	includeText: boolean;
	includeHighlights: boolean;
	allowedDomains: string[];
	excludedDomains: string[];
} {
	const parameters =
		tool?.parameters && typeof tool.parameters === "object"
			? tool.parameters
			: {};
	const maxResultsRaw = parameters?.max_results ?? tool?.max_results;
	const maxResults = readPositiveIntWithFallback(
		maxResultsRaw,
		DEFAULT_WEB_SEARCH_MAX_RESULTS,
		MAX_WEB_SEARCH_RESULTS,
	);
	const maxTotalResults = readPositiveIntWithFallback(
		parameters?.max_total_results ?? tool?.max_total_results,
		Math.max(DEFAULT_WEB_SEARCH_MAX_TOTAL_RESULTS, maxResults),
		MAX_WEB_SEARCH_MAX_TOTAL_RESULTS,
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
		engine: readWebSearchEngine(parameters?.engine ?? tool?.engine),
		maxResults,
		maxTotalResults: Math.max(maxResults, maxTotalResults),
		searchContextSize: readWebSearchContextSize(
			parameters?.search_context_size ?? tool?.search_context_size,
		),
		maxCharacters:
			typeof (parameters?.max_characters ?? tool?.max_characters) === "number"
				? readPositiveIntWithFallback(
					parameters?.max_characters ?? tool?.max_characters,
					0,
					MAX_WEB_FETCH_MAX_CHARS,
				)
				: null,
		includeText,
		includeHighlights,
		allowedDomains: readStringArray(
			parameters?.allowed_domains ?? parameters?.include_domains ?? tool?.allowed_domains ?? tool?.include_domains,
		),
		excludedDomains: readStringArray(
			parameters?.excluded_domains ?? parameters?.exclude_domains ?? tool?.excluded_domains ?? tool?.exclude_domains,
		),
	};
}

function buildNativeWebSearchTool(tool: any, protocol: Protocol): any {
	const parameters = tool?.parameters && typeof tool.parameters === "object" ? tool.parameters : {};
	const searchContextSize =
		parameters?.search_context_size ?? tool?.search_context_size;
	const userLocation = parameters?.user_location ?? tool?.user_location;
	const allowedDomains =
		parameters?.allowed_domains ?? parameters?.include_domains ?? tool?.allowed_domains ?? tool?.include_domains;
	const blockedDomains =
		parameters?.blocked_domains ?? parameters?.excluded_domains ?? parameters?.exclude_domains ??
		tool?.blocked_domains ?? tool?.excluded_domains ?? tool?.exclude_domains;

	if (protocol === "anthropic.messages") {
		return {
			type: "web_search_20250305",
			name: toNonEmptyString(tool?.name) ?? "web_search",
			...(typeof tool?.max_uses === "number" ? { max_uses: tool.max_uses } : {}),
			...(Array.isArray(allowedDomains) ? { allowed_domains: allowedDomains } : {}),
			...(Array.isArray(blockedDomains) ? { blocked_domains: blockedDomains } : {}),
			...(userLocation && typeof userLocation === "object" ? { user_location: userLocation } : {}),
		};
	}

	return {
		type: "web_search_preview",
		...(toNonEmptyString(searchContextSize) ? { search_context_size: searchContextSize } : {}),
		...(userLocation && typeof userLocation === "object" ? { user_location: userLocation } : {}),
		...(Array.isArray(allowedDomains) ? { allowed_domains: allowedDomains } : {}),
		...(Array.isArray(blockedDomains) ? { blocked_domains: blockedDomains } : {}),
	};
}

function nativeWebSearchToolChoice(protocol: Protocol): any {
	if (protocol === "anthropic.messages") {
		return { type: "tool", name: "web_search" };
	}
	return "web_search_preview";
}

function buildNativeWebFetchTool(tool: any, protocol: Protocol): any | null {
	if (protocol !== "anthropic.messages") return null;
	const parameters = tool?.parameters && typeof tool.parameters === "object" ? tool.parameters : {};
	const maxContentTokens =
		parameters?.max_content_tokens ?? parameters?.max_chars ?? tool?.max_content_tokens ?? tool?.max_chars;
	const allowedDomains =
		parameters?.allowed_domains ?? tool?.allowed_domains;
	const blockedDomains =
		parameters?.blocked_domains ?? parameters?.excluded_domains ?? tool?.blocked_domains ?? tool?.excluded_domains;

	return {
		type: "web_fetch_20260209",
		name: toNonEmptyString(tool?.name) ?? "web_fetch",
		...(typeof tool?.max_uses === "number" ? { max_uses: tool.max_uses } : {}),
		...(typeof maxContentTokens === "number" ? {
			max_content_tokens: readPositiveIntWithFallback(
				maxContentTokens,
				DEFAULT_WEB_FETCH_MAX_CHARS,
				MAX_WEB_FETCH_MAX_CHARS,
			),
		} : {}),
		...(Array.isArray(allowedDomains) ? { allowed_domains: allowedDomains } : {}),
		...(Array.isArray(blockedDomains) ? { blocked_domains: blockedDomains } : {}),
	};
}

function nativeWebFetchToolChoice(protocol: Protocol): any {
	if (protocol === "anthropic.messages") {
		return { type: "tool", name: "web_fetch" };
	}
	return null;
}

function parseAdvisorToolDefaults(tool: any): AdvisorServerToolConfig | { error: string } {
	const parameters = tool?.parameters && typeof tool.parameters === "object" ? tool.parameters : {};
	const name = toNonEmptyString(parameters?.name ?? tool?.name) ?? undefined;
	if (name && !ADVISOR_NAME_PATTERN.test(name)) {
		return {
			error: "Advisor name must be 1-64 characters and can contain letters, numbers, spaces, underscores, and dashes.",
		};
	}
	const advisorModel =
		toNonEmptyString(parameters?.model) ??
		toNonEmptyString(tool?.model) ??
		undefined;
	const maxTokens =
		parameters?.max_completion_tokens ??
		tool?.max_completion_tokens ??
		parameters?.max_tokens ??
		tool?.max_tokens;
	const maxUses = parameters?.max_uses ?? tool?.max_uses;
	const instructions = toNonEmptyString(parameters?.instructions ?? tool?.instructions) ?? undefined;
	const forwardTranscript =
		typeof parameters?.forward_transcript === "boolean"
			? parameters.forward_transcript
			: typeof tool?.forward_transcript === "boolean"
				? tool.forward_transcript
				: false;
	const reasoning =
		parameters?.reasoning && typeof parameters.reasoning === "object" && !Array.isArray(parameters.reasoning)
			? parameters.reasoning as Record<string, unknown>
			: tool?.reasoning && typeof tool.reasoning === "object" && !Array.isArray(tool.reasoning)
				? tool.reasoning as Record<string, unknown>
				: undefined;
	const temperature =
		typeof parameters?.temperature === "number"
			? parameters.temperature
			: typeof tool?.temperature === "number"
				? tool.temperature
				: undefined;
	return {
		functionName: sanitizeAdvisorFunctionName(name),
		...(name ? { name } : {}),
		...(advisorModel ? { model: advisorModel } : {}),
		...(instructions ? { instructions } : {}),
		forwardTranscript,
		maxUses: typeof maxUses === "number"
			? Math.max(1, Math.floor(maxUses))
			: DEFAULT_ADVISOR_MAX_USES,
		maxTokens: typeof maxTokens === "number"
			? Math.max(ADVISOR_MIN_MAX_TOKENS, Math.floor(maxTokens))
			: DEFAULT_ADVISOR_MAX_TOKENS,
		...(reasoning ? { reasoning } : {}),
		...(typeof temperature === "number" ? { temperature } : {}),
	};
}

function parseImageGenerationToolDefaults(tool: any): ImageGenerationServerToolConfig {
	const parameters = tool?.parameters && typeof tool.parameters === "object" ? tool.parameters : {};
	const outputCompression = parameters?.output_compression ?? tool?.output_compression;
	return {
		...(toNonEmptyString(parameters?.model ?? tool?.model) ? { model: toNonEmptyString(parameters?.model ?? tool?.model)! } : {}),
		...(toNonEmptyString(parameters?.quality ?? tool?.quality) ? { quality: toNonEmptyString(parameters?.quality ?? tool?.quality)! } : {}),
		...(toNonEmptyString(parameters?.size ?? tool?.size) ? { size: toNonEmptyString(parameters?.size ?? tool?.size)! } : {}),
		...(toNonEmptyString(parameters?.aspect_ratio ?? tool?.aspect_ratio) ? { aspectRatio: toNonEmptyString(parameters?.aspect_ratio ?? tool?.aspect_ratio)! } : {}),
		...(toNonEmptyString(parameters?.background ?? tool?.background) ? { background: toNonEmptyString(parameters?.background ?? tool?.background)! } : {}),
		...(toNonEmptyString(parameters?.output_format ?? tool?.output_format) ? { outputFormat: toNonEmptyString(parameters?.output_format ?? tool?.output_format)! } : {}),
		...(typeof outputCompression === "number" && Number.isFinite(outputCompression)
			? { outputCompression: Math.max(0, Math.min(100, outputCompression)) }
			: {}),
		...(toNonEmptyString(parameters?.moderation ?? tool?.moderation) ? { moderation: toNonEmptyString(parameters?.moderation ?? tool?.moderation)! } : {}),
	};
}

type ApplyPatchOperation = {
	type: "create_file" | "update_file" | "delete_file";
	path: string;
	diff?: string;
};

function normalizeApplyPatchOperation(args: Record<string, unknown>): ApplyPatchOperation | { error: string } {
	const rawOperation =
		args.operation && typeof args.operation === "object" && !Array.isArray(args.operation)
			? args.operation as Record<string, unknown>
			: args;
	const type = toNonEmptyString(rawOperation.type);
	const path = toNonEmptyString(rawOperation.path);
	const diff = toNonEmptyString(rawOperation.diff) ?? undefined;
	if (type !== "create_file" && type !== "update_file" && type !== "delete_file") {
		return { error: "operation.type must be create_file, update_file, or delete_file." };
	}
	if (!path) {
		return { error: "operation.path is required." };
	}
	if (path.includes("\0")) {
		return { error: "operation.path cannot contain null bytes." };
	}
	if ((type === "create_file" || type === "update_file") && !diff) {
		return { error: `operation.diff is required for ${type}.` };
	}
	if (type === "create_file" && diff) {
		const invalidLine = diff.split(/\r?\n/).find((line) => line.length > 0 && !line.startsWith("+"));
		if (invalidLine != null) {
			return { error: "create_file diff lines must start with +." };
		}
	}
	if (type === "update_file" && diff) {
		const invalidLine = diff
			.split(/\r?\n/)
			.find((line) =>
				line.length > 0 &&
				!line.startsWith("@@") &&
				!line.startsWith("+") &&
				!line.startsWith("-") &&
				!line.startsWith(" "),
			);
		if (invalidLine != null) {
			return { error: "update_file diff lines must start with @@, space, +, or -." };
		}
	}
	return {
		type,
		path,
		...(diff ? { diff } : {}),
	};
}

function isWebSearchAliasToolChoice(toolChoice: any): boolean {
	if (typeof toolChoice === "string") {
		return toolChoice === WEB_SEARCH_SERVER_TOOL_TYPE || toolChoice === GATEWAY_WEB_SEARCH_SERVER_TOOL_TYPE;
	}
	if (!toolChoice || typeof toolChoice !== "object") return false;
	const choiceName =
		toNonEmptyString(toolChoice?.function?.name) ??
		toNonEmptyString(toolChoice?.name) ??
		null;
	return choiceName === WEB_SEARCH_SERVER_TOOL_TYPE || choiceName === GATEWAY_WEB_SEARCH_SERVER_TOOL_TYPE;
}

function isWebFetchAliasToolChoice(toolChoice: any): boolean {
	if (typeof toolChoice === "string") {
		return toolChoice === WEB_FETCH_SERVER_TOOL_TYPE || toolChoice === GATEWAY_WEB_FETCH_SERVER_TOOL_TYPE;
	}
	if (!toolChoice || typeof toolChoice !== "object") return false;
	const choiceName =
		toNonEmptyString(toolChoice?.function?.name) ??
		toNonEmptyString(toolChoice?.name) ??
		null;
	return choiceName === WEB_FETCH_SERVER_TOOL_TYPE || choiceName === GATEWAY_WEB_FETCH_SERVER_TOOL_TYPE;
}

function isAdvisorAliasToolChoice(toolChoice: any): boolean {
	if (typeof toolChoice === "string") {
		return toolChoice === ADVISOR_SERVER_TOOL_TYPE;
	}
	if (!toolChoice || typeof toolChoice !== "object") return false;
	const choiceName =
		toNonEmptyString(toolChoice?.function?.name) ??
		toNonEmptyString(toolChoice?.name) ??
		null;
	return choiceName === ADVISOR_SERVER_TOOL_TYPE;
}

function isImageGenerationAliasToolChoice(toolChoice: any): boolean {
	if (typeof toolChoice === "string") {
		return toolChoice === IMAGE_GENERATION_SERVER_TOOL_TYPE;
	}
	if (!toolChoice || typeof toolChoice !== "object") return false;
	const choiceName =
		toNonEmptyString(toolChoice?.function?.name) ??
		toNonEmptyString(toolChoice?.name) ??
		null;
	return choiceName === IMAGE_GENERATION_SERVER_TOOL_TYPE;
}

function isApplyPatchAliasToolChoice(toolChoice: any): boolean {
	if (typeof toolChoice === "string") {
		return toolChoice === APPLY_PATCH_SERVER_TOOL_TYPE;
	}
	if (!toolChoice || typeof toolChoice !== "object") return false;
	const choiceName =
		toNonEmptyString(toolChoice?.function?.name) ??
		toNonEmptyString(toolChoice?.name) ??
		null;
	return choiceName === APPLY_PATCH_SERVER_TOOL_TYPE;
}

function parseWebFetchToolDefaults(tool: any): {
	engine: WebFetchEngine;
	maxChars: number;
	allowedDomains: string[];
	blockedDomains: string[];
} {
	const parameters =
		tool?.parameters && typeof tool.parameters === "object"
			? tool.parameters
			: {};
	const maxContentTokens = parameters?.max_content_tokens ?? tool?.max_content_tokens;
	return {
		engine: readWebFetchEngine(parameters?.engine ?? tool?.engine),
		maxChars: readPositiveIntWithFallback(
			parameters?.max_chars ?? tool?.max_chars ?? maxContentTokens,
			DEFAULT_WEB_FETCH_MAX_CHARS,
			MAX_WEB_FETCH_MAX_CHARS,
		),
		allowedDomains: readStringArray(
			parameters?.allowed_domains ?? tool?.allowed_domains,
		),
		blockedDomains: readStringArray(
			parameters?.blocked_domains ?? parameters?.excluded_domains ?? tool?.blocked_domains ?? tool?.excluded_domains,
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

function rewriteToolChoice(toolChoice: any, protocol: Protocol, advisorFunctionName = ADVISOR_SERVER_TOOL_FUNCTION_NAME): any {
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
		if (toolChoice === WEB_SEARCH_SERVER_TOOL_TYPE || toolChoice === GATEWAY_WEB_SEARCH_SERVER_TOOL_TYPE) {
			if (protocol === "anthropic.messages") {
				return { type: "tool", name: WEB_SEARCH_SERVER_TOOL_FUNCTION_NAME };
			}
			return {
				type: "function",
				function: { name: WEB_SEARCH_SERVER_TOOL_FUNCTION_NAME },
			};
		}
		if (toolChoice === WEB_FETCH_SERVER_TOOL_TYPE || toolChoice === GATEWAY_WEB_FETCH_SERVER_TOOL_TYPE) {
			if (protocol === "anthropic.messages") {
				return { type: "tool", name: WEB_FETCH_SERVER_TOOL_FUNCTION_NAME };
			}
			return {
				type: "function",
				function: { name: WEB_FETCH_SERVER_TOOL_FUNCTION_NAME },
			};
		}
		if (toolChoice === ADVISOR_SERVER_TOOL_TYPE) {
			if (protocol === "anthropic.messages") {
				return { type: "tool", name: advisorFunctionName };
			}
			return {
				type: "function",
				function: { name: advisorFunctionName },
			};
		}
		if (toolChoice === IMAGE_GENERATION_SERVER_TOOL_TYPE) {
			if (protocol === "anthropic.messages") {
				return { type: "tool", name: IMAGE_GENERATION_SERVER_TOOL_FUNCTION_NAME };
			}
			return {
				type: "function",
				function: { name: IMAGE_GENERATION_SERVER_TOOL_FUNCTION_NAME },
			};
		}
		if (toolChoice === APPLY_PATCH_SERVER_TOOL_TYPE) {
			return {
				type: "function",
				function: { name: APPLY_PATCH_SERVER_TOOL_FUNCTION_NAME },
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

	if (choiceName === WEB_SEARCH_SERVER_TOOL_TYPE || choiceName === GATEWAY_WEB_SEARCH_SERVER_TOOL_TYPE) {
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

	if (choiceName === WEB_FETCH_SERVER_TOOL_TYPE || choiceName === GATEWAY_WEB_FETCH_SERVER_TOOL_TYPE) {
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

	if (choiceName === ADVISOR_SERVER_TOOL_TYPE) {
		if (protocol === "anthropic.messages") {
			return {
				type: "tool",
				name: advisorFunctionName,
			};
		}

		return {
			type: "function",
			function: { name: advisorFunctionName },
		};
	}

	if (choiceName === IMAGE_GENERATION_SERVER_TOOL_TYPE) {
		if (protocol === "anthropic.messages") {
			return {
				type: "tool",
				name: IMAGE_GENERATION_SERVER_TOOL_FUNCTION_NAME,
			};
		}

		return {
			type: "function",
			function: { name: IMAGE_GENERATION_SERVER_TOOL_FUNCTION_NAME },
		};
	}

	if (choiceName === APPLY_PATCH_SERVER_TOOL_TYPE) {
		return {
			type: "function",
			function: { name: APPLY_PATCH_SERVER_TOOL_FUNCTION_NAME },
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
	const defaultAdvisorModel = toNonEmptyString(nextBody?.model) ?? undefined;

	let datetimeEnabled = false;
	let datetimeDefaultTimezones = [DEFAULT_TIMEZONE];
	let webSearchEnabled = false;
	let webSearchEngine: WebSearchEngine = DEFAULT_WEB_SEARCH_ENGINE;
	let webSearchMaxResults = DEFAULT_WEB_SEARCH_MAX_RESULTS;
	let webSearchMaxTotalResults = DEFAULT_WEB_SEARCH_MAX_TOTAL_RESULTS;
	let webSearchContextSize: WebSearchContextSize = "medium";
	let webSearchMaxCharacters: number | undefined;
	let webSearchIncludeText = false;
	let webSearchIncludeHighlights = true;
	let webSearchAllowedDomains: string[] = [];
	let webSearchExcludedDomains: string[] = [];
	let nativeWebSearchRequested = false;
	let nativeWebFetchRequested = false;
	let advisorEnabled = false;
	const advisors: Record<string, AdvisorServerToolConfig> = {};
	const advisorNames = new Set<string>();
	let defaultAdvisorFunctionName: string | undefined;
	let unnamedAdvisorSeen = false;
	let imageGenerationEnabled = false;
	let imageGeneration: ImageGenerationServerToolConfig = {};
	let applyPatchEnabled = false;
	let webFetchEnabled = false;
	let webFetchEngine: WebFetchEngine = DEFAULT_WEB_FETCH_ENGINE;
	let webFetchMaxChars = DEFAULT_WEB_FETCH_MAX_CHARS;
	let webFetchAllowedDomains: string[] = [];
	let webFetchBlockedDomains: string[] = [];
	const filteredTools: any[] = [];

	for (const tool of tools) {
		if (!tool || typeof tool !== "object") {
			filteredTools.push(tool);
			continue;
		}

		if (tool.type === DATETIME_SERVER_TOOL_TYPE) {
			datetimeEnabled = true;
			const requestedTimezones = parseDatetimeToolTimezones(tool);
			if (requestedTimezones.length > 0) {
				const invalidTimezone = requestedTimezones.find(
					(timezone) => !isValidTimezone(timezone),
				);
				if (invalidTimezone) {
					return {
						ok: false,
						message: `Invalid datetime tool timezone "${invalidTimezone}". Use valid IANA timezone names.`,
					};
				}
				datetimeDefaultTimezones = requestedTimezones;
			}
			continue;
		}

		if (tool.type === WEB_SEARCH_SERVER_TOOL_TYPE || tool.type === GATEWAY_WEB_SEARCH_SERVER_TOOL_TYPE) {
			const defaults = parseWebSearchToolDefaults(tool);
			if (defaults.engine === "native") {
				nativeWebSearchRequested = true;
				filteredTools.push(buildNativeWebSearchTool(tool, protocol));
				continue;
			}
			webSearchEnabled = true;
			webSearchEngine = defaults.engine;
			webSearchMaxResults = defaults.maxResults;
			webSearchMaxTotalResults = defaults.maxTotalResults;
			webSearchContextSize = defaults.searchContextSize;
			webSearchMaxCharacters = defaults.maxCharacters ?? undefined;
			webSearchIncludeText = defaults.includeText;
			webSearchIncludeHighlights = defaults.includeHighlights;
			webSearchAllowedDomains = defaults.allowedDomains;
			webSearchExcludedDomains = defaults.excludedDomains;
			continue;
		}

		if (tool.type === WEB_FETCH_SERVER_TOOL_TYPE || tool.type === GATEWAY_WEB_FETCH_SERVER_TOOL_TYPE) {
			const defaults = parseWebFetchToolDefaults(tool);
			const resolvedEngine =
				defaults.engine === "auto" ? resolveDefaultWebFetchEngine(protocol) : defaults.engine;
			if (resolvedEngine === "native") {
				const nativeTool = buildNativeWebFetchTool(tool, protocol);
				if (!nativeTool) {
					return {
						ok: false,
						message: "Native web fetch is currently available through the Anthropic Messages surface. Use engine \"direct\" for gateway-managed fetch on this request surface.",
					};
				}
				nativeWebFetchRequested = true;
				filteredTools.push(nativeTool);
				continue;
			}
			webFetchEnabled = true;
			webFetchEngine = resolvedEngine;
			webFetchMaxChars = defaults.maxChars;
			webFetchAllowedDomains = defaults.allowedDomains;
			webFetchBlockedDomains = defaults.blockedDomains;
			continue;
		}

		if (tool.type === ADVISOR_SERVER_TOOL_TYPE) {
			const defaults = parseAdvisorToolDefaults(tool);
			if ("error" in defaults) {
				return {
					ok: false,
					message: defaults.error,
				};
			}
			const normalizedName = defaults.name?.trim().toLowerCase();
			if (!normalizedName) {
				if (unnamedAdvisorSeen) {
					return {
						ok: false,
						message: "Only one unnamed Advisor tool can be configured. Add parameters.name to use multiple advisors.",
					};
				}
				unnamedAdvisorSeen = true;
			} else if (advisorNames.has(normalizedName)) {
				return {
					ok: false,
					message: `Duplicate Advisor name "${defaults.name}". Advisor names must be unique after trimming.`,
				};
			} else {
				advisorNames.add(normalizedName);
			}
			if (advisors[defaults.functionName]) {
				return {
					ok: false,
					message: `Advisor function name collision for "${defaults.name ?? "default"}". Choose a different Advisor name.`,
				};
			}
			advisorEnabled = true;
			advisors[defaults.functionName] = defaults;
			defaultAdvisorFunctionName ??= defaults.functionName;
			continue;
		}

		if (tool.type === IMAGE_GENERATION_SERVER_TOOL_TYPE) {
			imageGenerationEnabled = true;
			imageGeneration = parseImageGenerationToolDefaults(tool);
			continue;
		}

		if (tool.type === APPLY_PATCH_SERVER_TOOL_TYPE) {
			if (protocol !== "openai.responses") {
				return {
					ok: false,
					message: "phaseo:apply_patch is only supported on the Responses API.",
				};
			}
			applyPatchEnabled = true;
			continue;
		}

		if (tool.type !== DATETIME_SERVER_TOOL_TYPE) {
			filteredTools.push(tool);
		}
	}

	if (
		!datetimeEnabled &&
		!webSearchEnabled &&
		!webFetchEnabled &&
		!advisorEnabled &&
		!imageGenerationEnabled &&
		!applyPatchEnabled &&
		!nativeWebSearchRequested &&
		!nativeWebFetchRequested
	) {
		return {
			ok: true,
			body: nextBody,
			config: {
				enabled: false,
				datetimeDefaultTimezones: [DEFAULT_TIMEZONE],
				webSearchEnabled: false,
				webSearchEngine: DEFAULT_WEB_SEARCH_ENGINE,
				webSearchMaxResults: DEFAULT_WEB_SEARCH_MAX_RESULTS,
				webSearchMaxTotalResults: DEFAULT_WEB_SEARCH_MAX_TOTAL_RESULTS,
				webSearchContextSize: "medium",
				webSearchMaxCharacters: undefined,
				webSearchIncludeText: false,
				webSearchIncludeHighlights: true,
				webSearchAllowedDomains: [],
				webSearchExcludedDomains: [],
				webFetchEnabled: false,
				webFetchEngine: DEFAULT_WEB_FETCH_ENGINE,
				webFetchMaxChars: DEFAULT_WEB_FETCH_MAX_CHARS,
				webFetchAllowedDomains: [],
				webFetchBlockedDomains: [],
				advisorEnabled: false,
				advisors: {},
				defaultAdvisorFunctionName: undefined,
				defaultAdvisorModel,
				imageGenerationEnabled: false,
				imageGeneration: {},
				applyPatchEnabled: false,
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
		for (const advisor of Object.values(advisors)) {
			if (!hasAnthropicToolNamed(filteredTools, advisor.functionName)) {
				filteredTools.push({
					name: advisor.functionName,
					description: advisorToolDescription(advisor),
				input_schema: advisorInputSchema(advisor),
				});
			}
		}
		if (imageGenerationEnabled && !hasAnthropicToolNamed(filteredTools, IMAGE_GENERATION_SERVER_TOOL_FUNCTION_NAME)) {
			filteredTools.push({
				name: IMAGE_GENERATION_SERVER_TOOL_FUNCTION_NAME,
				description: IMAGE_GENERATION_TOOL_DESCRIPTION,
				input_schema: IMAGE_GENERATION_TOOL_PARAMETERS,
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
		for (const advisor of Object.values(advisors)) {
			if (!hasOpenAIFunctionToolNamed(filteredTools, advisor.functionName)) {
				filteredTools.push({
					type: "function",
					function: {
						name: advisor.functionName,
						description: advisorToolDescription(advisor),
						parameters: advisorInputSchema(advisor),
					},
				});
			}
		}
		if (imageGenerationEnabled && !hasOpenAIFunctionToolNamed(filteredTools, IMAGE_GENERATION_SERVER_TOOL_FUNCTION_NAME)) {
			filteredTools.push({
				type: "function",
				function: {
					name: IMAGE_GENERATION_SERVER_TOOL_FUNCTION_NAME,
					description: IMAGE_GENERATION_TOOL_DESCRIPTION,
					parameters: IMAGE_GENERATION_TOOL_PARAMETERS,
				},
			});
		}
		if (applyPatchEnabled && !hasOpenAIFunctionToolNamed(filteredTools, APPLY_PATCH_SERVER_TOOL_FUNCTION_NAME)) {
			filteredTools.push({
				type: "function",
				function: {
					name: APPLY_PATCH_SERVER_TOOL_FUNCTION_NAME,
					description: APPLY_PATCH_TOOL_DESCRIPTION,
					parameters: APPLY_PATCH_TOOL_PARAMETERS,
				},
			});
		}
	}

	nextBody.tools = filteredTools;
	if (nativeWebSearchRequested && isWebSearchAliasToolChoice(nextBody.tool_choice)) {
		nextBody.tool_choice = nativeWebSearchToolChoice(protocol);
	} else if (nativeWebFetchRequested && isWebFetchAliasToolChoice(nextBody.tool_choice)) {
		nextBody.tool_choice = nativeWebFetchToolChoice(protocol);
	} else {
		nextBody.tool_choice = rewriteToolChoice(nextBody.tool_choice, protocol, defaultAdvisorFunctionName);
	}

	return {
		ok: true,
		body: nextBody,
		config: {
			enabled: datetimeEnabled || webSearchEnabled || webFetchEnabled || advisorEnabled || imageGenerationEnabled || applyPatchEnabled,
			datetimeDefaultTimezones,
			webSearchEnabled,
			webSearchEngine,
			webSearchMaxResults,
			webSearchMaxTotalResults,
			webSearchContextSize,
			webSearchMaxCharacters,
			webSearchIncludeText,
			webSearchIncludeHighlights,
			webSearchAllowedDomains,
			webSearchExcludedDomains,
			webFetchEnabled,
			webFetchEngine,
			webFetchMaxChars,
			webFetchAllowedDomains,
			webFetchBlockedDomains,
			advisorEnabled,
			advisors,
			defaultAdvisorFunctionName,
			defaultAdvisorModel,
			imageGenerationEnabled,
			imageGeneration,
			applyPatchEnabled,
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

function readDatetimeTimezones(
	args: Record<string, unknown>,
	fallback: string[],
): string[] {
	const timezones: string[] = [];
	appendTimezoneList(timezones, args.timezones);
	return timezones.length > 0
		? timezones
		: fallback.length > 0
			? fallback
			: [DEFAULT_TIMEZONE];
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
	defaultTimezones: string[],
): IRToolResult {
	const args = parseJsonObject(call.arguments);
	const timezones = readDatetimeTimezones(args, defaultTimezones);
	const invalidTimezone = timezones.find((timezone) => !isValidTimezone(timezone));
	if (invalidTimezone) {
		return {
			toolCallId: call.id,
			isError: true,
			content: JSON.stringify({
				error: "invalid_timezone",
				timezone: invalidTimezone,
				timezones,
				message: "timezones must contain valid IANA timezone names",
			}),
		};
	}

	const now = new Date();
	const results = timezones.map((timezone) => ({
		timezone,
		datetime: formatIsoInTimezone(now, timezone),
	}));
	return {
		toolCallId: call.id,
		content: JSON.stringify({
			timezones: results,
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

function resolveParallelSearchConfig(): { apiKey: string; baseUrl: string } | null {
	try {
		const bindings = getBindings();
		const apiKey = String(bindings.PARALLEL_API_KEY ?? "").trim();
		if (!apiKey) return null;
		const baseUrl = String(bindings.PARALLEL_BASE_URL ?? DEFAULT_PARALLEL_BASE_URL).trim() || DEFAULT_PARALLEL_BASE_URL;
		return {
			apiKey,
			baseUrl: baseUrl.replace(/\/+$/, ""),
		};
	} catch {
		return null;
	}
}

function resolveFirecrawlSearchConfig(): { apiKey: string; baseUrl: string } | null {
	try {
		const bindings = getBindings();
		const apiKey = String(bindings.FIRECRAWL_API_KEY ?? "").trim();
		if (!apiKey) return null;
		const baseUrl = String(bindings.FIRECRAWL_BASE_URL ?? DEFAULT_FIRECRAWL_BASE_URL).trim() || DEFAULT_FIRECRAWL_BASE_URL;
		return {
			apiKey,
			baseUrl: baseUrl.replace(/\/+$/, ""),
		};
	} catch {
		return null;
	}
}

function hostnameMatchesDomain(hostname: string, domain: string): boolean {
	const normalizedHost = hostname.toLowerCase();
	const normalizedDomain = domain.trim().toLowerCase().replace(/^\*\./, "");
	if (!normalizedDomain) return false;
	return normalizedHost === normalizedDomain || normalizedHost.endsWith(`.${normalizedDomain}`);
}

function parseIPv4Address(hostname: string): number[] | null {
	const parts = hostname.split(".");
	if (parts.length !== 4) return null;
	const bytes = parts.map((part) => {
		if (!/^\d{1,3}$/.test(part)) return Number.NaN;
		const value = Number(part);
		return Number.isInteger(value) && value >= 0 && value <= 255 ? value : Number.NaN;
	});
	return bytes.every((value) => Number.isFinite(value)) ? bytes : null;
}

function isPrivateOrLocalHostname(hostname: string): boolean {
	const normalized = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
	if (!normalized) return true;
	if (
		normalized === "localhost" ||
		normalized.endsWith(".localhost") ||
		normalized.endsWith(".local") ||
		normalized.endsWith(".internal")
	) {
		return true;
	}
	const ipv4 = parseIPv4Address(normalized);
	if (ipv4) {
		const [a, b] = ipv4;
		return (
			a === 0 ||
			a === 10 ||
			a === 127 ||
			(a === 100 && b >= 64 && b <= 127) ||
			(a === 169 && b === 254) ||
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && b === 168)
		);
	}
	return (
		normalized === "::1" ||
		normalized.startsWith("fc") ||
		normalized.startsWith("fd") ||
		normalized.startsWith("fe80:")
	);
}

function isUrlAllowedByDomainPolicy(
	url: string,
	allowedDomains: string[],
	blockedDomains: string[],
): boolean {
	let hostname: string;
	try {
		hostname = new URL(url).hostname;
	} catch {
		return false;
	}
	if (isPrivateOrLocalHostname(hostname)) {
		return false;
	}
	if (allowedDomains.length === 0 && blockedDomains.length === 0) return true;
	if (blockedDomains.some((domain) => hostnameMatchesDomain(hostname, domain))) {
		return false;
	}
	if (allowedDomains.length > 0) {
		return allowedDomains.some((domain) => hostnameMatchesDomain(hostname, domain));
	}
	return true;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), SERVER_TOOL_FETCH_TIMEOUT_MS);
	try {
		return await fetch(input, {
			...init,
			signal: controller.signal,
		});
	} finally {
		clearTimeout(timeout);
	}
}

function parseWebFetchMaxChars(
	args: Record<string, unknown>,
	fallback: number,
): number {
	return readPositiveIntWithFallback(
		args.max_chars ?? args.max_content_tokens,
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
		.replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, " ")
		.replace(/<style\b[^>]*>[\s\S]*?<\/style\b[^>]*>/gi, " ")
		.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\b[^>]*>/gi, " ")
		.replace(/<svg\b[^>]*>[\s\S]*?<\/svg\b[^>]*>/gi, " ")
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

function parseWebSearchMaxResults(
	args: Record<string, unknown>,
	config: ServerToolConfig,
	remainingResults: number,
): number {
	const requested = readPositiveIntWithFallback(
		args.max_results,
		config.webSearchMaxResults,
		MAX_WEB_SEARCH_RESULTS,
	);
	return Math.max(0, Math.min(requested, remainingResults));
}

function parseWebSearchMaxCharacters(
	args: Record<string, unknown>,
	config: ServerToolConfig,
): number | undefined {
	const raw = args.max_characters ?? config.webSearchMaxCharacters;
	if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
	return readPositiveIntWithFallback(raw, DEFAULT_WEB_FETCH_MAX_CHARS, MAX_WEB_FETCH_MAX_CHARS);
}

function resolveSearchDomains(args: Record<string, unknown>, config: ServerToolConfig): {
	allowedDomains: string[];
	excludedDomains: string[];
} {
	const allowedDomains = readStringArray(args.allowed_domains ?? args.include_domains);
	const excludedDomains = readStringArray(args.excluded_domains ?? args.exclude_domains);
	return {
		allowedDomains: allowedDomains.length > 0 ? allowedDomains : (config.webSearchAllowedDomains ?? []),
		excludedDomains: excludedDomains.length > 0 ? excludedDomains : (config.webSearchExcludedDomains ?? []),
	};
}

function resolveFetchDomains(args: Record<string, unknown>, config: ServerToolConfig): {
	allowedDomains: string[];
	blockedDomains: string[];
} {
	const allowedDomains = readStringArray(args.allowed_domains);
	const blockedDomains = readStringArray(args.blocked_domains ?? args.excluded_domains);
	return {
		allowedDomains: allowedDomains.length > 0 ? allowedDomains : (config.webFetchAllowedDomains ?? []),
		blockedDomains: blockedDomains.length > 0 ? blockedDomains : (config.webFetchBlockedDomains ?? []),
	};
}

function buildExaContentsForSearch(args: {
	includeText: boolean;
	includeHighlights: boolean;
	searchContextSize: WebSearchContextSize;
	maxCharacters?: number;
}): Record<string, unknown> {
	const contents: Record<string, unknown> = {};
	const highlightCount =
		args.searchContextSize === "high" ? 5 : args.searchContextSize === "low" ? 2 : 3;
	if (args.includeText) {
		contents.text =
			typeof args.maxCharacters === "number" && args.maxCharacters > 0
				? { maxCharacters: args.maxCharacters }
				: true;
	}
	if (args.includeHighlights || !args.includeText) {
		contents.highlights = {
			numSentences: highlightCount,
			highlightsPerUrl: highlightCount,
		};
	}
	return contents;
}

async function executeExaFetchToolCall(args: {
	call: { id: string; arguments: string };
	url: string;
	maxChars: number;
	searchConfig: { apiKey: string; baseUrl: string };
}): Promise<{ toolResult: IRToolResult; webFetchRequests: number }> {
	try {
		const response = await fetchWithTimeout(`${args.searchConfig.baseUrl}/contents`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": args.searchConfig.apiKey,
			},
			body: JSON.stringify({
				urls: [args.url],
				text: true,
			}),
		});

		if (!response.ok) {
			const failureText = await response.text();
			return {
				toolResult: {
					toolCallId: args.call.id,
					isError: true,
					content: JSON.stringify({
						error: "fetch_request_failed",
						engine: "exa",
						status: response.status,
						message: failureText.slice(0, 1000),
					}),
				},
				webFetchRequests: 0,
			};
		}

		const json = await response.json() as Record<string, any>;
		const result = Array.isArray(json.results) ? json.results[0] : null;
		const normalizedText = toNonEmptyString(result?.text) ?? "";
		const text = normalizedText.slice(0, args.maxChars);
		return {
			toolResult: {
				toolCallId: args.call.id,
				content: JSON.stringify({
					provider: "exa",
					url: args.url,
					final_url: toNonEmptyString(result?.url) ?? args.url,
					title: toNonEmptyString(result?.title) ?? null,
					text,
					truncated: normalizedText.length > text.length,
					returned_chars: text.length,
				}),
			},
			webFetchRequests: 1,
		};
	} catch (error) {
		return {
			toolResult: {
				toolCallId: args.call.id,
				isError: true,
				content: JSON.stringify({
					error: "fetch_request_error",
					engine: "exa",
					message: error instanceof Error ? error.message : String(error),
				}),
			},
			webFetchRequests: 0,
		};
	}
}

function extractCountryFromUserLocation(value: unknown): string | null {
	if (!value || typeof value !== "object") return null;
	const location = value as Record<string, unknown>;
	return (
		toNonEmptyString(location.country) ??
		toNonEmptyString(location.country_code) ??
		null
	);
}

function extractLocationStringFromUserLocation(value: unknown): string | null {
	if (!value || typeof value !== "object") return null;
	const location = value as Record<string, unknown>;
	const direct = toNonEmptyString(location.location);
	if (direct) return direct;
	const parts = [
		toNonEmptyString(location.city),
		toNonEmptyString(location.region),
		toNonEmptyString(location.country),
	].filter(Boolean);
	return parts.length > 0 ? parts.join(", ") : null;
}

async function executeParallelSearchToolCall(args: {
	call: { id: string; arguments: string };
	query: string;
	maxResults: number;
	searchContextSize: WebSearchContextSize;
	maxCharacters?: number;
	allowedDomains: string[];
	excludedDomains: string[];
	userLocation?: unknown;
	searchConfig: { apiKey: string; baseUrl: string };
}): Promise<{ toolResult: IRToolResult; webSearchResults: number; webSearchExtraResults: number }> {
	const advancedSettings: Record<string, unknown> = {
		max_results: args.maxResults,
	};
	const sourcePolicy: Record<string, unknown> = {};
	if (args.allowedDomains.length > 0) sourcePolicy.include_domains = args.allowedDomains;
	if (args.excludedDomains.length > 0) sourcePolicy.exclude_domains = args.excludedDomains;
	if (Object.keys(sourcePolicy).length > 0) advancedSettings.source_policy = sourcePolicy;
	if (typeof args.maxCharacters === "number" && args.maxCharacters > 0) {
		advancedSettings.excerpt_settings = { max_chars_per_result: args.maxCharacters };
	}
	const country = extractCountryFromUserLocation(args.userLocation);
	if (country) advancedSettings.location = country.toLowerCase();

	try {
		const response = await fetchWithTimeout(`${args.searchConfig.baseUrl}/v1/search`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": args.searchConfig.apiKey,
			},
			body: JSON.stringify({
				objective: args.query,
				search_queries: [args.query],
				advanced_settings: advancedSettings,
			}),
		});

		if (!response.ok) {
			const failureText = await response.text();
			return {
				toolResult: {
					toolCallId: args.call.id,
					isError: true,
					content: JSON.stringify({
						error: "search_request_failed",
						engine: "parallel",
						status: response.status,
						message: failureText.slice(0, 1000),
					}),
				},
				webSearchResults: 0,
				webSearchExtraResults: 0,
			};
		}

		const json = await response.json() as Record<string, any>;
		const rawResults = Array.isArray(json.results) ? json.results : [];
		const normalizedResults = rawResults.slice(0, args.maxResults).map((result) => ({
			title: toNonEmptyString(result?.title) ?? null,
			url: toNonEmptyString(result?.url) ?? null,
			published_date: toNonEmptyString(result?.publish_date) ?? toNonEmptyString(result?.published_date) ?? null,
			author: null,
			highlights: Array.isArray(result?.excerpts)
				? result.excerpts.filter((entry: unknown) => typeof entry === "string")
				: [],
			text: null,
			summary: null,
		}));
		const webSearchResults = normalizedResults.length;

		return {
			toolResult: {
				toolCallId: args.call.id,
				content: JSON.stringify({
					provider: "parallel",
					engine: "parallel",
					request_id: toNonEmptyString(json.search_id) ?? null,
					query: args.query,
					search_context_size: args.searchContextSize,
					allowed_domains: args.allowedDomains,
					excluded_domains: args.excludedDomains,
					results: normalizedResults,
				}),
			},
			webSearchResults,
			webSearchExtraResults: Math.max(0, webSearchResults - 10),
		};
	} catch (error) {
		return {
			toolResult: {
				toolCallId: args.call.id,
				isError: true,
				content: JSON.stringify({
					error: "search_request_error",
					engine: "parallel",
					message: error instanceof Error ? error.message : String(error),
				}),
			},
			webSearchResults: 0,
			webSearchExtraResults: 0,
		};
	}
}

async function executeFirecrawlSearchToolCall(args: {
	call: { id: string; arguments: string };
	query: string;
	maxResults: number;
	includeText: boolean;
	maxCharacters?: number;
	allowedDomains: string[];
	excludedDomains: string[];
	userLocation?: unknown;
	searchConfig: { apiKey: string; baseUrl: string };
}): Promise<{ toolResult: IRToolResult; webSearchResults: number; webSearchExtraResults: number }> {
	if (args.allowedDomains.length > 0 && args.excludedDomains.length > 0) {
		return {
			toolResult: {
				toolCallId: args.call.id,
				isError: true,
				content: JSON.stringify({
					error: "invalid_domain_policy",
					engine: "firecrawl",
					message: "Firecrawl web search supports allowed_domains or excluded_domains, not both.",
					allowed_domains: args.allowedDomains,
					excluded_domains: args.excludedDomains,
				}),
			},
			webSearchResults: 0,
			webSearchExtraResults: 0,
		};
	}
	const body: Record<string, unknown> = {
		query: args.query,
		limit: args.maxResults,
	};
	if (args.allowedDomains.length > 0) body.includeDomains = args.allowedDomains;
	if (args.excludedDomains.length > 0) body.excludeDomains = args.excludedDomains;
	const country = extractCountryFromUserLocation(args.userLocation);
	if (country) body.country = country.toUpperCase();
	const location = extractLocationStringFromUserLocation(args.userLocation);
	if (location) body.location = location;
	if (args.includeText) {
		body.scrapeOptions = {
			formats: [{ type: "markdown" }],
			...(typeof args.maxCharacters === "number" && args.maxCharacters > 0
				? { maxAge: 0, onlyMainContent: true }
				: {}),
		};
	}

	try {
		const response = await fetchWithTimeout(`${args.searchConfig.baseUrl}/v2/search`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${args.searchConfig.apiKey}`,
			},
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			const failureText = await response.text();
			return {
				toolResult: {
					toolCallId: args.call.id,
					isError: true,
					content: JSON.stringify({
						error: "search_request_failed",
						engine: "firecrawl",
						status: response.status,
						message: failureText.slice(0, 1000),
					}),
				},
				webSearchResults: 0,
				webSearchExtraResults: 0,
			};
		}

		const json = await response.json() as Record<string, any>;
		const webResults = Array.isArray(json?.data?.web) ? json.data.web : [];
		const normalizedResults = webResults.slice(0, args.maxResults).map((result) => {
			const text = toNonEmptyString(result?.markdown);
			const boundedText =
				text && typeof args.maxCharacters === "number" && args.maxCharacters > 0
					? text.slice(0, args.maxCharacters).trim()
					: text;
			return {
				title: toNonEmptyString(result?.title) ?? toNonEmptyString(result?.metadata?.title) ?? null,
				url: toNonEmptyString(result?.url) ?? toNonEmptyString(result?.metadata?.sourceURL) ?? null,
				published_date: null,
				author: null,
				highlights: toNonEmptyString(result?.description) ? [String(result.description)] : [],
				text: args.includeText ? (boundedText ?? null) : null,
				summary: toNonEmptyString(result?.description) ?? toNonEmptyString(result?.metadata?.description) ?? null,
			};
		});
		const webSearchResults = normalizedResults.length;

		return {
			toolResult: {
				toolCallId: args.call.id,
				content: JSON.stringify({
					provider: "firecrawl",
					engine: "firecrawl",
					request_id: toNonEmptyString(json.id) ?? null,
					query: args.query,
					credits_used: typeof json.creditsUsed === "number" ? json.creditsUsed : null,
					allowed_domains: args.allowedDomains,
					excluded_domains: args.excludedDomains,
					results: normalizedResults,
				}),
			},
			webSearchResults,
			webSearchExtraResults: Math.max(0, webSearchResults - 10),
		};
	} catch (error) {
		return {
			toolResult: {
				toolCallId: args.call.id,
				isError: true,
				content: JSON.stringify({
					error: "search_request_error",
					engine: "firecrawl",
					message: error instanceof Error ? error.message : String(error),
				}),
			},
			webSearchResults: 0,
			webSearchExtraResults: 0,
		};
	}
}

async function executeParallelFetchToolCall(args: {
	call: { id: string; arguments: string };
	url: string;
	maxChars: number;
	searchConfig: { apiKey: string; baseUrl: string };
}): Promise<{ toolResult: IRToolResult; webFetchRequests: number }> {
	try {
		const response = await fetchWithTimeout(`${args.searchConfig.baseUrl}/v1/extract`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": args.searchConfig.apiKey,
			},
			body: JSON.stringify({
				urls: [args.url],
				advanced_settings: {
					full_content: {
						max_chars_per_result: args.maxChars,
					},
				},
			}),
		});

		if (!response.ok) {
			const failureText = await response.text();
			return {
				toolResult: {
					toolCallId: args.call.id,
					isError: true,
					content: JSON.stringify({
						error: "fetch_request_failed",
						engine: "parallel",
						status: response.status,
						message: failureText.slice(0, 1000),
					}),
				},
				webFetchRequests: 0,
			};
		}

		const json = await response.json() as Record<string, any>;
		const result = Array.isArray(json.results) ? json.results[0] : null;
		const rawText =
			toNonEmptyString(result?.full_content) ??
			(Array.isArray(result?.excerpts)
				? result.excerpts.filter((entry: unknown) => typeof entry === "string").join("\n\n")
				: "");
		const text = rawText.slice(0, args.maxChars).trim();
		return {
			toolResult: {
				toolCallId: args.call.id,
				content: JSON.stringify({
					provider: "parallel",
					engine: "parallel",
					request_id: toNonEmptyString(json.extract_id) ?? null,
					url: args.url,
					final_url: toNonEmptyString(result?.url) ?? args.url,
					title: toNonEmptyString(result?.title) ?? null,
					published_date: toNonEmptyString(result?.publish_date) ?? null,
					text,
					truncated: rawText.length > text.length,
					returned_chars: text.length,
				}),
			},
			webFetchRequests: 1,
		};
	} catch (error) {
		return {
			toolResult: {
				toolCallId: args.call.id,
				isError: true,
				content: JSON.stringify({
					error: "fetch_request_error",
					engine: "parallel",
					message: error instanceof Error ? error.message : String(error),
				}),
			},
			webFetchRequests: 0,
		};
	}
}

async function executeFirecrawlFetchToolCall(args: {
	call: { id: string; arguments: string };
	url: string;
	maxChars: number;
	searchConfig: { apiKey: string; baseUrl: string };
}): Promise<{ toolResult: IRToolResult; webFetchRequests: number }> {
	try {
		const response = await fetchWithTimeout(`${args.searchConfig.baseUrl}/v2/scrape`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${args.searchConfig.apiKey}`,
			},
			body: JSON.stringify({
				url: args.url,
				formats: ["markdown"],
				onlyMainContent: true,
			}),
		});

		if (!response.ok) {
			const failureText = await response.text();
			return {
				toolResult: {
					toolCallId: args.call.id,
					isError: true,
					content: JSON.stringify({
						error: "fetch_request_failed",
						engine: "firecrawl",
						status: response.status,
						message: failureText.slice(0, 1000),
					}),
				},
				webFetchRequests: 0,
			};
		}

		const json = await response.json() as Record<string, any>;
		const data = json?.data && typeof json.data === "object" ? json.data : {};
		const metadata = data?.metadata && typeof data.metadata === "object" ? data.metadata : {};
		const rawText = toNonEmptyString(data?.markdown) ?? "";
		const text = rawText.slice(0, args.maxChars).trim();
		return {
			toolResult: {
				toolCallId: args.call.id,
				content: JSON.stringify({
					provider: "firecrawl",
					engine: "firecrawl",
					request_id: toNonEmptyString(json.id) ?? null,
					url: args.url,
					final_url: toNonEmptyString(metadata?.sourceURL) ?? toNonEmptyString(metadata?.url) ?? args.url,
					title: toNonEmptyString(metadata?.title) ?? null,
					content_type: toNonEmptyString(metadata?.contentType) ?? null,
					status: typeof metadata?.statusCode === "number" ? metadata.statusCode : null,
					text,
					truncated: rawText.length > text.length,
					returned_chars: text.length,
				}),
			},
			webFetchRequests: 1,
		};
	} catch (error) {
		return {
			toolResult: {
				toolCallId: args.call.id,
				isError: true,
				content: JSON.stringify({
					error: "fetch_request_error",
					engine: "firecrawl",
					message: error instanceof Error ? error.message : String(error),
				}),
			},
			webFetchRequests: 0,
		};
	}
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
	const { allowedDomains, blockedDomains } = resolveFetchDomains(args, config);
	if (!isUrlAllowedByDomainPolicy(url, allowedDomains, blockedDomains)) {
		return {
			toolResult: {
				toolCallId: call.id,
				isError: true,
				content: JSON.stringify({
					error: "url_blocked_by_domain_policy",
					message: "url is not allowed by this gateway web fetch domain policy",
				}),
			},
			webFetchRequests: 0,
		};
	}

	const requestedEngine = toNonEmptyString(args.engine) ? readWebFetchEngine(args.engine) : "auto";
	const engine = requestedEngine === "auto" ? (config.webFetchEngine ?? DEFAULT_WEB_FETCH_ENGINE) : requestedEngine;
	if (engine === "native") {
		return {
			toolResult: {
				toolCallId: call.id,
				isError: true,
				content: JSON.stringify({
					error: "unsupported_fetch_engine",
					engine,
					message: "Native web fetch is provider-specific. Use the Anthropic Messages surface for native web fetch, or engine \"direct\" for gateway-managed fetch.",
				}),
			},
			webFetchRequests: 0,
		};
	}
	if (engine === "exa") {
		const searchConfig = resolveExaSearchConfig();
		if (!searchConfig) {
			return {
				toolResult: {
					toolCallId: call.id,
					isError: true,
					content: JSON.stringify({
						error: "fetch_not_configured",
						engine: "exa",
						message: "Exa web fetch is not configured",
					}),
				},
				webFetchRequests: 0,
			};
		}
		return executeExaFetchToolCall({ call, url, maxChars, searchConfig });
	}
	if (engine === "parallel") {
		const searchConfig = resolveParallelSearchConfig();
		if (!searchConfig) {
			return {
				toolResult: {
					toolCallId: call.id,
					isError: true,
					content: JSON.stringify({
						error: "fetch_not_configured",
						engine: "parallel",
						message: "Parallel web fetch is not configured",
					}),
				},
				webFetchRequests: 0,
			};
		}
		return executeParallelFetchToolCall({ call, url, maxChars, searchConfig });
	}
	if (engine === "firecrawl") {
		const searchConfig = resolveFirecrawlSearchConfig();
		if (!searchConfig) {
			return {
				toolResult: {
					toolCallId: call.id,
					isError: true,
					content: JSON.stringify({
						error: "fetch_not_configured",
						engine: "firecrawl",
						message: "Firecrawl web fetch is not configured",
					}),
				},
				webFetchRequests: 0,
			};
		}
		return executeFirecrawlFetchToolCall({ call, url, maxChars, searchConfig });
	}

	try {
		let currentUrl = url;
		let response: Response | null = null;
		for (let redirectCount = 0; redirectCount <= SERVER_TOOL_DIRECT_FETCH_MAX_REDIRECTS; redirectCount += 1) {
			response = await fetchWithTimeout(currentUrl, {
				method: "GET",
				headers: {
					Accept: "text/html,text/plain,application/json;q=0.9,*/*;q=0.8",
					"User-Agent": "Phaseo-Gateway/1.0 (+https://phaseo.app)",
				},
				redirect: "manual",
			});
			if (response.status < 300 || response.status >= 400) break;
			const location = response.headers.get("location");
			if (!location) break;
			const nextUrl = new URL(location, currentUrl).toString();
			if (!isUrlAllowedByDomainPolicy(nextUrl, allowedDomains, blockedDomains)) {
				return {
					toolResult: {
						toolCallId: call.id,
						isError: true,
						content: JSON.stringify({
							error: "redirect_blocked_by_domain_policy",
							message: "redirect target is not allowed by this gateway web fetch domain policy",
						}),
					},
					webFetchRequests: 0,
				};
			}
			currentUrl = nextUrl;
		}
		if (!response) {
			throw new Error("web fetch did not return a response");
		}
		if (response.status >= 300 && response.status < 400) {
			return {
				toolResult: {
					toolCallId: call.id,
					isError: true,
					content: JSON.stringify({
						error: "too_many_redirects",
						message: "gateway web fetch exceeded the redirect limit",
					}),
				},
				webFetchRequests: 0,
			};
		}

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
					engine: "direct",
					url,
					final_url: toNonEmptyString(response.url) ?? currentUrl,
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
	remainingResults: number,
): Promise<{ toolResult: IRToolResult; webFetchRequests: number; webSearchResults: number; webSearchExtraResults: number }> {
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
			webSearchResults: 0,
			webSearchExtraResults: 0,
		};
	}

	if (remainingResults <= 0) {
		return {
			toolResult: {
				toolCallId: call.id,
				isError: true,
				content: JSON.stringify({
					error: "max_total_results_reached",
					message: "gateway web search max_total_results has already been reached for this request",
				}),
			},
			webFetchRequests: 0,
			webSearchResults: 0,
			webSearchExtraResults: 0,
		};
	}

	const requestedEngine = toNonEmptyString(args.engine) ? readWebSearchEngine(args.engine) : "auto";
	const engine = requestedEngine === "auto" ? (config.webSearchEngine ?? DEFAULT_WEB_SEARCH_ENGINE) : requestedEngine;
	if (engine === "native") {
		return {
			toolResult: {
				toolCallId: call.id,
				isError: true,
				content: JSON.stringify({
					error: "unsupported_search_engine",
					engine,
					message: "Use engine native in the tool declaration so the gateway can route a provider-native web search tool upstream.",
				}),
			},
			webFetchRequests: 0,
			webSearchResults: 0,
			webSearchExtraResults: 0,
		};
	}

	const maxResults = parseWebSearchMaxResults(args, config, remainingResults);
	const includeText = readBooleanWithFallback(
		args.include_text,
		config.webSearchIncludeText,
	);
	const includeHighlights = readBooleanWithFallback(
		args.include_highlights,
		config.webSearchIncludeHighlights,
	);
	const searchContextSize = readWebSearchContextSize(args.search_context_size ?? config.webSearchContextSize ?? "medium");
	const maxCharacters = parseWebSearchMaxCharacters(args, config);
	const { allowedDomains, excludedDomains } = resolveSearchDomains(args, config);

	if (engine === "parallel") {
		const parallelConfig = resolveParallelSearchConfig();
		if (!parallelConfig) {
			return {
				toolResult: {
					toolCallId: call.id,
					isError: true,
					content: JSON.stringify({
						error: "search_not_configured",
						engine: "parallel",
						message: "Parallel web search is not configured",
					}),
				},
				webFetchRequests: 0,
				webSearchResults: 0,
				webSearchExtraResults: 0,
			};
		}
		const executed = await executeParallelSearchToolCall({
			call,
			query,
			maxResults,
			searchContextSize,
			maxCharacters,
			allowedDomains,
			excludedDomains,
			userLocation: args.user_location,
			searchConfig: parallelConfig,
		});
		return {
			...executed,
			webFetchRequests: 0,
		};
	}

	if (engine === "firecrawl") {
		const firecrawlConfig = resolveFirecrawlSearchConfig();
		if (!firecrawlConfig) {
			return {
				toolResult: {
					toolCallId: call.id,
					isError: true,
					content: JSON.stringify({
						error: "search_not_configured",
						engine: "firecrawl",
						message: "Firecrawl web search is not configured",
					}),
				},
				webFetchRequests: 0,
				webSearchResults: 0,
				webSearchExtraResults: 0,
			};
		}
		const executed = await executeFirecrawlSearchToolCall({
			call,
			query,
			maxResults,
			includeText,
			maxCharacters,
			allowedDomains,
			excludedDomains,
			userLocation: args.user_location,
			searchConfig: firecrawlConfig,
		});
		return {
			...executed,
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
					engine: "exa",
					message: "server-managed Exa web search is not configured",
				}),
			},
			webFetchRequests: 0,
			webSearchResults: 0,
			webSearchExtraResults: 0,
		};
	}
	const contents = buildExaContentsForSearch({ includeText, includeHighlights, searchContextSize, maxCharacters });
	const exaBody: Record<string, unknown> = {
		query,
		type: "auto",
		numResults: maxResults,
		contents,
	};
	if (allowedDomains.length > 0) exaBody.includeDomains = allowedDomains;
	if (excludedDomains.length > 0) exaBody.excludeDomains = excludedDomains;

	try {
		const response = await fetchWithTimeout(`${searchConfig.baseUrl}/search`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": searchConfig.apiKey,
			},
			body: JSON.stringify(exaBody),
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
				webSearchResults: 0,
				webSearchExtraResults: 0,
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
		const webSearchResults = normalizedResults.length;

		return {
			toolResult: {
				toolCallId: call.id,
				content: JSON.stringify({
					provider: engine === "auto" ? "exa" : engine,
					engine: "exa",
					request_id: toNonEmptyString(json.requestId) ?? null,
					search_type: toNonEmptyString(json.searchType) ?? null,
					query,
					search_context_size: searchContextSize,
					allowed_domains: allowedDomains,
					excluded_domains: excludedDomains,
					results: normalizedResults,
				}),
			},
			webFetchRequests: 0,
			webSearchResults,
			webSearchExtraResults: Math.max(0, webSearchResults - 10),
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
			webSearchResults: 0,
			webSearchExtraResults: 0,
		};
	}
}

export async function buildServerToolContinuation(
	irResponse: IRChatResponse,
	config: ServerToolConfig,
	options?: {
		executeAdvisor?: AdvisorExecutor;
		executeImageGeneration?: ImageGenerationExecutor;
	},
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
			call?.name === WEB_FETCH_SERVER_TOOL_FUNCTION_NAME ||
			call?.name === IMAGE_GENERATION_SERVER_TOOL_FUNCTION_NAME ||
			call?.name === APPLY_PATCH_SERVER_TOOL_FUNCTION_NAME ||
			Boolean(config.advisors?.[call?.name]),
	);
	if (serverToolCalls.length === 0) return null;

	// If mixed with client-managed function calls, skip server execution for this turn.
	if (serverToolCalls.length !== toolCalls.length) return null;

	const toolResults: IRToolResult[] = [];
	let advisorUsage: IRUsage | undefined;
	let imageGenerationUsage: IRUsage | undefined;
	const usage: ServerToolExecutionMetrics = {
		datetimeRequests: 0,
		webSearchRequests: 0,
		webSearchResults: 0,
		webSearchExtraResults: 0,
		webFetchRequests: 0,
		advisorRequests: 0,
		imageGenerationRequests: 0,
		applyPatchRequests: 0,
	};
	const advisorCallsUsed = new Map<string, number>();
	let remainingSearchResults = config.webSearchMaxTotalResults ?? DEFAULT_WEB_SEARCH_MAX_TOTAL_RESULTS;
	for (const call of serverToolCalls) {
		if (call.name === DATETIME_SERVER_TOOL_FUNCTION_NAME) {
			toolResults.push(
				executeDatetimeToolCall(
					{ id: call.id, arguments: call.arguments },
					config.datetimeDefaultTimezones,
				),
			);
			usage.datetimeRequests += 1;
			continue;
		}

		if (call.name === WEB_SEARCH_SERVER_TOOL_FUNCTION_NAME) {
			const executed = await executeWebSearchToolCall(
				{ id: call.id, arguments: call.arguments },
				config,
				remainingSearchResults,
			);
			toolResults.push(executed.toolResult);
			usage.webSearchRequests += 1;
			usage.webSearchResults += Math.max(0, executed.webSearchResults);
			usage.webSearchExtraResults += Math.max(0, executed.webSearchExtraResults);
			usage.webFetchRequests += Math.max(0, executed.webFetchRequests);
			remainingSearchResults = Math.max(0, remainingSearchResults - Math.max(0, executed.webSearchResults));
			continue;
		}

		if (call.name === WEB_FETCH_SERVER_TOOL_FUNCTION_NAME) {
			const executed = await executeWebFetchToolCall(
				{ id: call.id, arguments: call.arguments },
				config,
			);
			toolResults.push(executed.toolResult);
			usage.webFetchRequests += Math.max(0, executed.webFetchRequests);
			continue;
		}

		if (call.name === IMAGE_GENERATION_SERVER_TOOL_FUNCTION_NAME) {
			const args = parseJsonObject(call.arguments);
			const prompt = toNonEmptyString(args.prompt) ?? toNonEmptyString(args.description);
			const model =
				toNonEmptyString(config.imageGeneration?.model) ??
				toNonEmptyString(args.model) ??
				DEFAULT_IMAGE_GENERATION_MODEL;
			if (!prompt) {
				toolResults.push({
					toolCallId: call.id,
					isError: true,
					content: JSON.stringify({
						error: "image_generation_invalid_request",
						message: "Image generation requires a prompt.",
					}),
				});
				continue;
			}
			if (!options?.executeImageGeneration) {
				toolResults.push({
					toolCallId: call.id,
					isError: true,
					content: JSON.stringify({
						error: "image_generation_executor_unavailable",
						message: "Image generation execution is not available in this runtime.",
					}),
				});
				continue;
			}
			const imageResult = await options.executeImageGeneration({
				model,
				prompt,
				quality: toNonEmptyString(args.quality) ?? config.imageGeneration?.quality,
				size: toNonEmptyString(args.size) ?? config.imageGeneration?.size,
				aspectRatio: toNonEmptyString(args.aspect_ratio) ?? config.imageGeneration?.aspectRatio,
				background: toNonEmptyString(args.background) ?? config.imageGeneration?.background,
				outputFormat: toNonEmptyString(args.output_format) ?? config.imageGeneration?.outputFormat,
				outputCompression:
					typeof args.output_compression === "number" && Number.isFinite(args.output_compression)
						? Math.max(0, Math.min(100, args.output_compression))
						: config.imageGeneration?.outputCompression,
				moderation: toNonEmptyString(args.moderation) ?? config.imageGeneration?.moderation,
			});
			if (imageResult.ok === false) {
				toolResults.push({
					toolCallId: call.id,
					isError: true,
					content: JSON.stringify({
						status: "error",
						error: "image_generation_failed",
						message: imageResult.message,
					}),
				});
				continue;
			}
			usage.imageGenerationRequests += 1;
			toolResults.push({
				toolCallId: call.id,
				content: JSON.stringify({
					status: "ok",
					model: imageResult.model,
					...(imageResult.imageUrl ? { imageUrl: imageResult.imageUrl } : {}),
					...(imageResult.b64Json ? { b64_json: imageResult.b64Json } : {}),
					...(imageResult.mimeType ? { mime_type: imageResult.mimeType } : {}),
				}),
			});
			if (imageResult.usage) {
				imageGenerationUsage = mergeIRUsageTotals(imageGenerationUsage, imageResult.usage);
			}
			continue;
		}

		if (call.name === APPLY_PATCH_SERVER_TOOL_FUNCTION_NAME) {
			const operation = normalizeApplyPatchOperation(parseJsonObject(call.arguments));
			usage.applyPatchRequests += 1;
			if ("error" in operation) {
				toolResults.push({
					toolCallId: call.id,
					isError: true,
					content: JSON.stringify({
						status: "error",
						error: "apply_patch_invalid_operation",
						message: operation.error,
					}),
				});
				continue;
			}
			toolResults.push({
				toolCallId: call.id,
				content: JSON.stringify({
					status: "completed",
					operation,
					message: "Patch operation validated. The client must apply or reject this patch and report the result.",
				}),
			});
			continue;
		}

		const advisorConfig = config.advisors?.[call.name];
		if (advisorConfig) {
			const used = (advisorCallsUsed.get(advisorConfig.functionName) ?? 0) + 1;
			advisorCallsUsed.set(advisorConfig.functionName, used);
			if (used > advisorConfig.maxUses) {
				toolResults.push({
					toolCallId: call.id,
					isError: true,
					content: JSON.stringify({
						error: "advisor_max_uses_exceeded",
						message: `Advisor max_uses exceeded (${advisorConfig.maxUses}).`,
					}),
				});
				continue;
			}
			const args = parseJsonObject(call.arguments);
			const prompt =
				toNonEmptyString(args.prompt) ??
				(advisorConfig.forwardTranscript
					? "Review the forwarded conversation and provide concise advice for the calling model."
					: null);
			const advisorModel =
				toNonEmptyString(advisorConfig.model) ??
				toNonEmptyString(args.model) ??
				toNonEmptyString(config.defaultAdvisorModel);
			if (!prompt || !advisorModel) {
				toolResults.push({
					toolCallId: call.id,
					isError: true,
					content: JSON.stringify({
						error: "advisor_invalid_request",
						message: "Advisor requires a prompt and advisor model.",
					}),
				});
				continue;
			}
			if (!options?.executeAdvisor) {
				toolResults.push({
					toolCallId: call.id,
					isError: true,
					content: JSON.stringify({
						error: "advisor_executor_unavailable",
						message: "Advisor execution is not available in this runtime.",
					}),
				});
				continue;
			}
			usage.advisorRequests += 1;
			const advisorResult = await options.executeAdvisor({
				model: advisorModel,
				prompt,
				maxTokens: advisorConfig.maxTokens,
				instructions: advisorConfig.instructions,
				forwardTranscript: advisorConfig.forwardTranscript,
				reasoning: advisorConfig.reasoning,
				temperature: advisorConfig.temperature,
			});
			if (advisorResult.ok === false) {
				toolResults.push({
					toolCallId: call.id,
					isError: true,
					content: JSON.stringify({
						error: "advisor_request_failed",
						message: advisorResult.message,
					}),
				});
				continue;
			}
			advisorUsage = mergeIRUsageTotals(advisorUsage, advisorResult.usage);
			toolResults.push({
				toolCallId: call.id,
				content: JSON.stringify({
					status: "ok",
					...(advisorConfig.name ? { name: advisorConfig.name } : {}),
					model: advisorModel,
					advice: advisorResult.content,
				}),
			});
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
		advisorUsage,
		imageGenerationUsage,
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
		cachedWriteTokens5m: sumMaybe(base._ext?.cachedWriteTokens5m, incoming._ext?.cachedWriteTokens5m),
		cachedWriteTokens1h: sumMaybe(base._ext?.cachedWriteTokens1h, incoming._ext?.cachedWriteTokens1h),
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
					web_search_results:
						(base._ext?.serverToolUse?.web_search_results ?? 0) +
						(incoming._ext?.serverToolUse?.web_search_results ?? 0),
					web_search_extra_results:
						(base._ext?.serverToolUse?.web_search_extra_results ?? 0) +
						(incoming._ext?.serverToolUse?.web_search_extra_results ?? 0),
					web_fetch_requests:
						(base._ext?.serverToolUse?.web_fetch_requests ?? 0) +
						(incoming._ext?.serverToolUse?.web_fetch_requests ?? 0),
					advisor_requests:
						(base._ext?.serverToolUse?.advisor_requests ?? 0) +
						(incoming._ext?.serverToolUse?.advisor_requests ?? 0),
					image_generation_requests:
						(base._ext?.serverToolUse?.image_generation_requests ?? 0) +
						(incoming._ext?.serverToolUse?.image_generation_requests ?? 0),
					apply_patch_requests:
						(base._ext?.serverToolUse?.apply_patch_requests ?? 0) +
						(incoming._ext?.serverToolUse?.apply_patch_requests ?? 0),
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
					web_search_results:
						(base._ext?.serverToolUse?.web_search_results ?? 0) +
						(incoming._ext?.serverToolUse?.web_search_results ?? 0),
					web_search_extra_results:
						(base._ext?.serverToolUse?.web_search_extra_results ?? 0) +
						(incoming._ext?.serverToolUse?.web_search_extra_results ?? 0),
					web_fetch_requests:
						(base._ext?.serverToolUse?.web_fetch_requests ?? 0) +
						(incoming._ext?.serverToolUse?.web_fetch_requests ?? 0),
					advisor_requests:
						(base._ext?.serverToolUse?.advisor_requests ?? 0) +
						(incoming._ext?.serverToolUse?.advisor_requests ?? 0),
					image_generation_requests:
						(base._ext?.serverToolUse?.image_generation_requests ?? 0) +
						(incoming._ext?.serverToolUse?.image_generation_requests ?? 0),
					apply_patch_requests:
						(base._ext?.serverToolUse?.apply_patch_requests ?? 0) +
						(incoming._ext?.serverToolUse?.apply_patch_requests ?? 0),
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
		args.webSearchResults <= 0 &&
		args.webSearchExtraResults <= 0 &&
		args.webFetchRequests <= 0 &&
		args.advisorRequests <= 0 &&
		args.imageGenerationRequests <= 0 &&
		args.applyPatchRequests <= 0
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
			web_search_results: (existing?.web_search_results ?? 0) + Math.max(0, args.webSearchResults),
			web_search_extra_results:
				(existing?.web_search_extra_results ?? 0) + Math.max(0, args.webSearchExtraResults),
			web_fetch_requests: (existing?.web_fetch_requests ?? 0) + Math.max(0, args.webFetchRequests),
			advisor_requests: (existing?.advisor_requests ?? 0) + Math.max(0, args.advisorRequests),
			image_generation_requests:
				(existing?.image_generation_requests ?? 0) + Math.max(0, args.imageGenerationRequests),
			apply_patch_requests:
				(existing?.apply_patch_requests ?? 0) + Math.max(0, args.applyPatchRequests),
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
		args.webSearchResults <= 0 &&
		args.webSearchExtraResults <= 0 &&
		args.webFetchRequests <= 0 &&
		args.advisorRequests <= 0 &&
		args.imageGenerationRequests <= 0 &&
		args.applyPatchRequests <= 0
	) return usage;
	const base = { ...(usage ?? {}) };
	const existing = base?.server_tool_use ?? {};
	base.server_tool_use = {
		...existing,
		datetime_requests:
			(Number(existing?.datetime_requests ?? 0) || 0) + Math.max(0, args.datetimeRequests),
		web_search_requests:
			(Number(existing?.web_search_requests ?? 0) || 0) + Math.max(0, args.webSearchRequests),
		web_search_results:
			(Number(existing?.web_search_results ?? 0) || 0) + Math.max(0, args.webSearchResults),
		web_search_extra_results:
			(Number(existing?.web_search_extra_results ?? 0) || 0) + Math.max(0, args.webSearchExtraResults),
		web_fetch_requests:
			(Number(existing?.web_fetch_requests ?? 0) || 0) + Math.max(0, args.webFetchRequests),
		advisor_requests:
			(Number(existing?.advisor_requests ?? 0) || 0) + Math.max(0, args.advisorRequests),
		image_generation_requests:
			(Number(existing?.image_generation_requests ?? 0) || 0) + Math.max(0, args.imageGenerationRequests),
		apply_patch_requests:
			(Number(existing?.apply_patch_requests ?? 0) || 0) + Math.max(0, args.applyPatchRequests),
	};
	base.server_tool_web_search_requests =
		(Number(base.server_tool_web_search_requests ?? 0) || 0) + Math.max(0, args.webSearchRequests);
	base.server_tool_web_search_extra_results =
		(Number(base.server_tool_web_search_extra_results ?? 0) || 0) + Math.max(0, args.webSearchExtraResults);
	base.server_tool_web_fetch_requests =
		(Number(base.server_tool_web_fetch_requests ?? 0) || 0) + Math.max(0, args.webFetchRequests);
	base.server_tool_advisor_requests =
		(Number(base.server_tool_advisor_requests ?? 0) || 0) + Math.max(0, args.advisorRequests);
	base.server_tool_image_generation_requests =
		(Number(base.server_tool_image_generation_requests ?? 0) || 0) + Math.max(0, args.imageGenerationRequests);
	base.server_tool_apply_patch_requests =
		(Number(base.server_tool_apply_patch_requests ?? 0) || 0) + Math.max(0, args.applyPatchRequests);
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
