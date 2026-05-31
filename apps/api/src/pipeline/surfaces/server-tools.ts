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
export const APPLY_PATCH_SERVER_TOOL_TYPE = "gateway:apply_patch";
export const APPLY_PATCH_SERVER_TOOL_FUNCTION_NAME = "gateway_apply_patch";
export const IMAGE_GENERATION_SERVER_TOOL_TYPE = "gateway:image_generation";
export const IMAGE_GENERATION_SERVER_TOOL_FUNCTION_NAME = "gateway_image_generation";
export const FUSION_SERVER_TOOL_TYPE = "gateway:fusion";
export const FUSION_SERVER_TOOL_FUNCTION_NAME = "gateway_fusion";
export const TOOL_SEARCH_SERVER_TOOL_TYPE = "gateway:tool_search";
export const TOOL_SEARCH_SERVER_TOOL_FUNCTION_NAME = "gateway_tool_search";
const DEFAULT_TIMEZONE = "UTC";
const DEFAULT_WEB_SEARCH_MAX_RESULTS = 5;
const MAX_WEB_SEARCH_RESULTS = 25;
const DEFAULT_WEB_SEARCH_ENGINE = "exa";
const DEFAULT_WEB_SEARCH_CONTEXT_SIZE = "medium";
const MAX_WEB_SEARCH_TOTAL_RESULTS = 100;
const DEFAULT_WEB_FETCH_MAX_CHARS = 12000;
const MAX_WEB_FETCH_MAX_CHARS = 50000;
const DEFAULT_EXA_BASE_URL = "https://api.exa.ai";
const DEFAULT_IMAGE_GENERATION_MODEL = "openai/gpt-image-latest";
const DEFAULT_FUSION_MAX_ANALYSIS_MODELS = 5;
const MAX_TOOL_SEARCH_RESULTS = 20;

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
		engine: {
			type: "string",
			enum: ["auto", "exa"],
			description: "Search engine to use. auto currently resolves to Exa for gateway-managed search.",
		},
		max_results: {
			type: "integer",
			description: "Maximum number of results to return per search call. Defaults to 5 and caps at 25.",
		},
		max_total_results: {
			type: "integer",
			description: "Maximum cumulative results across all gateway web search calls in this request.",
		},
		search_context_size: {
			type: "string",
			enum: ["low", "medium", "high"],
			description: "How much excerpt context to retrieve for each result.",
		},
		include_text: {
			type: "boolean",
			description: "Include extracted page text for each result. Defaults to false.",
		},
		include_highlights: {
			type: "boolean",
			description: "Include query-relevant highlights for each result. Defaults to true.",
		},
		allowed_domains: {
			type: "array",
			items: { type: "string" },
			description: "Only return results from these domains.",
		},
		excluded_domains: {
			type: "array",
			items: { type: "string" },
			description: "Exclude results from these domains.",
		},
		user_location: {
			type: "object",
			description: "Approximate location metadata. Accepted for compatibility; currently ignored by Exa-backed gateway search.",
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
		max_chars: {
			type: "integer",
			description: "Maximum number of characters to return. Defaults to 12000 and caps at 50000.",
		},
		allowed_domains: {
			type: "array",
			items: { type: "string" },
			description: "If provided, only fetch URLs whose hostname matches one of these domains.",
		},
		excluded_domains: {
			type: "array",
			items: { type: "string" },
			description: "If provided, reject URLs whose hostname matches one of these domains.",
		},
	},
	required: ["url"],
	additionalProperties: false,
} as const;

const APPLY_PATCH_TOOL_DESCRIPTION =
	"Capture a proposed file edit as a Codex-style apply_patch block. The gateway validates the patch envelope and returns it as an artifact; it does not apply files.";
const APPLY_PATCH_TOOL_PARAMETERS = {
	type: "object",
	properties: {
		patch: {
			type: "string",
			description: "Complete patch block beginning with *** Begin Patch and ending with *** End Patch.",
		},
		summary: {
			type: "string",
			description: "Optional short human-readable summary of the intended change.",
		},
	},
	required: ["patch"],
	additionalProperties: false,
} as const;

const IMAGE_GENERATION_TOOL_DESCRIPTION =
	"Generate an image from a text prompt using the gateway image generation endpoint. The request is routed, billed, and audited like a normal image generation request.";
const IMAGE_GENERATION_TOOL_PARAMETERS = {
	type: "object",
	properties: {
		prompt: {
			type: "string",
			description: "Image prompt to generate.",
		},
		model: {
			type: "string",
			description: "Optional image model id. Defaults to the configured gateway image model.",
		},
		size: {
			type: "string",
			description: "Optional image size or aspect ratio supported by the selected model.",
		},
		quality: {
			type: "string",
			description: "Optional quality setting supported by the selected model.",
		},
		n: {
			type: "integer",
			description: "Number of images to generate.",
		},
		response_format: {
			type: "string",
			description: "Optional image response format, such as url or b64_json where supported.",
		},
		output_format: {
			type: "string",
			description: "Optional output image format, such as png, jpeg, or webp where supported.",
		},
		background: {
			type: "string",
			description: "Optional background setting where supported.",
		},
	},
	required: ["prompt"],
	additionalProperties: false,
} as const;

const FUSION_TOOL_DESCRIPTION =
	"Run a bounded multi-model analysis panel and return structured synthesis context for the calling model.";
const FUSION_TOOL_PARAMETERS = {
	type: "object",
	properties: {
		input: {
			type: "string",
			description: "Question or task to analyze.",
		},
		analysis_models: {
			type: "array",
			items: { type: "string" },
			description: "Optional analysis model ids. Defaults to the tool configuration or the outer request model.",
		},
		model: {
			type: "string",
			description: "Optional judge/synthesis model id. Defaults to the outer request model.",
		},
		include_web: {
			type: "boolean",
			description: "Enable gateway web search and fetch on analysis calls. Defaults to true.",
		},
	},
	required: ["input"],
	additionalProperties: false,
} as const;

const TOOL_SEARCH_TOOL_DESCRIPTION =
	"Search the AI Stats gateway server-tool catalog and return matching tool definitions.";
const TOOL_SEARCH_TOOL_PARAMETERS = {
	type: "object",
	properties: {
		query: {
			type: "string",
			description: "Tool capability to search for, such as web, image, datetime, patch, fusion, or model search.",
		},
		max_results: {
			type: "integer",
			description: "Maximum number of matching tools to return. Defaults to 8 and caps at 20.",
		},
	},
	required: ["query"],
	additionalProperties: false,
} as const;

export type ServerToolConfig = {
	enabled: boolean;
	datetimeDefaultTimezone: string;
	webSearchEnabled: boolean;
	webSearchEngine: "auto" | "exa";
	webSearchMaxResults: number;
	webSearchMaxTotalResults: number | null;
	webSearchResultsUsed: number;
	webSearchContextSize: "low" | "medium" | "high" | null;
	webSearchIncludeText: boolean;
	webSearchIncludeHighlights: boolean;
	webSearchAllowedDomains: string[];
	webSearchExcludedDomains: string[];
	webFetchEnabled: boolean;
	webFetchMaxChars: number;
	webFetchAllowedDomains: string[];
	webFetchExcludedDomains: string[];
	applyPatchEnabled: boolean;
	imageGenerationEnabled: boolean;
	imageGenerationModel: string;
	fusionEnabled: boolean;
	fusionAnalysisModels: string[];
	fusionModel: string | null;
	fusionIncludeWeb: boolean;
	toolSearchEnabled: boolean;
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
	applyPatchRequests: number;
	imageGenerationRequests: number;
	fusionRequests: number;
	toolSearchRequests: number;
};

type ServerToolRuntime = {
	sourceRequest?: Request;
	outerModel?: string;
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

function readOptionalPositiveInt(value: unknown, maximum: number): number | null {
	if (typeof value !== "number" || !Number.isFinite(value)) return null;
	const next = Math.floor(value);
	if (next <= 0) return null;
	return Math.min(maximum, next);
}

function readStringArray(value: unknown, maximum = 50): string[] {
	if (!Array.isArray(value)) return [];
	const seen = new Set<string>();
	const output: string[] = [];
	for (const entry of value) {
		const normalized = toNonEmptyString(entry);
		if (!normalized) continue;
		const lower = normalized.toLowerCase();
		if (seen.has(lower)) continue;
		seen.add(lower);
		output.push(normalized);
		if (output.length >= maximum) break;
	}
	return output;
}

function readDomainArray(value: unknown): string[] {
	return readStringArray(value, 100).map((domain) =>
		domain
			.replace(/^https?:\/\//i, "")
			.replace(/\/.*$/, "")
			.replace(/^\.+/, "")
			.toLowerCase(),
	).filter((domain) => /^[a-z0-9*.-]+$/i.test(domain));
}

function readSearchEngine(value: unknown): "auto" | "exa" {
	const normalized = toNonEmptyString(value)?.toLowerCase();
	return normalized === "auto" || normalized === "exa"
		? normalized
		: DEFAULT_WEB_SEARCH_ENGINE;
}

function readSearchContextSize(value: unknown): "low" | "medium" | "high" | null {
	const normalized = toNonEmptyString(value)?.toLowerCase();
	if (normalized === "low" || normalized === "medium" || normalized === "high") {
		return normalized;
	}
	return null;
}

function parseWebSearchToolDefaults(tool: any): {
	engine: "auto" | "exa";
	maxResults: number;
	maxTotalResults: number | null;
	searchContextSize: "low" | "medium" | "high" | null;
	includeText: boolean;
	includeHighlights: boolean;
	allowedDomains: string[];
	excludedDomains: string[];
} {
	const parameters =
		tool?.parameters && typeof tool.parameters === "object"
			? tool.parameters
			: {};
	const maxTotalResults = readOptionalPositiveInt(
		parameters?.max_total_results ?? tool?.max_total_results,
		MAX_WEB_SEARCH_TOTAL_RESULTS,
	);
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
		engine: readSearchEngine(parameters?.engine ?? tool?.engine),
		maxResults,
		maxTotalResults,
		searchContextSize:
			readSearchContextSize(parameters?.search_context_size ?? tool?.search_context_size) ??
			DEFAULT_WEB_SEARCH_CONTEXT_SIZE,
		includeText,
		includeHighlights,
		allowedDomains: readDomainArray(parameters?.allowed_domains ?? tool?.allowed_domains),
		excludedDomains: readDomainArray(parameters?.excluded_domains ?? tool?.excluded_domains),
	};
}

function parseWebFetchToolDefaults(tool: any): {
	maxChars: number;
	allowedDomains: string[];
	excludedDomains: string[];
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
		allowedDomains: readDomainArray(parameters?.allowed_domains ?? tool?.allowed_domains),
		excludedDomains: readDomainArray(parameters?.excluded_domains ?? tool?.excluded_domains),
	};
}

function parseImageGenerationToolDefaults(tool: any): {
	model: string;
} {
	const parameters =
		tool?.parameters && typeof tool.parameters === "object"
			? tool.parameters
			: {};
	return {
		model:
			toNonEmptyString(parameters?.model) ??
			toNonEmptyString(tool?.model) ??
			DEFAULT_IMAGE_GENERATION_MODEL,
	};
}

function parseFusionToolDefaults(tool: any): {
	analysisModels: string[];
	model: string | null;
	includeWeb: boolean;
} {
	const parameters =
		tool?.parameters && typeof tool.parameters === "object"
			? tool.parameters
			: {};
	return {
		analysisModels: readStringArray(
			parameters?.analysis_models ?? tool?.analysis_models,
			DEFAULT_FUSION_MAX_ANALYSIS_MODELS,
		),
		model: toNonEmptyString(parameters?.model) ?? toNonEmptyString(tool?.model),
		includeWeb: readBooleanWithFallback(
			parameters?.include_web ?? tool?.include_web,
			true,
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
		if (toolChoice === APPLY_PATCH_SERVER_TOOL_TYPE) {
			if (protocol === "anthropic.messages") {
				return { type: "tool", name: APPLY_PATCH_SERVER_TOOL_FUNCTION_NAME };
			}
			return {
				type: "function",
				function: { name: APPLY_PATCH_SERVER_TOOL_FUNCTION_NAME },
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
		if (toolChoice === FUSION_SERVER_TOOL_TYPE) {
			if (protocol === "anthropic.messages") {
				return { type: "tool", name: FUSION_SERVER_TOOL_FUNCTION_NAME };
			}
			return {
				type: "function",
				function: { name: FUSION_SERVER_TOOL_FUNCTION_NAME },
			};
		}
		if (toolChoice === TOOL_SEARCH_SERVER_TOOL_TYPE) {
			if (protocol === "anthropic.messages") {
				return { type: "tool", name: TOOL_SEARCH_SERVER_TOOL_FUNCTION_NAME };
			}
			return {
				type: "function",
				function: { name: TOOL_SEARCH_SERVER_TOOL_FUNCTION_NAME },
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

	if (choiceName === APPLY_PATCH_SERVER_TOOL_TYPE) {
		if (protocol === "anthropic.messages") {
			return {
				type: "tool",
				name: APPLY_PATCH_SERVER_TOOL_FUNCTION_NAME,
			};
		}

		return {
			type: "function",
			function: { name: APPLY_PATCH_SERVER_TOOL_FUNCTION_NAME },
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

	if (choiceName === FUSION_SERVER_TOOL_TYPE) {
		if (protocol === "anthropic.messages") {
			return {
				type: "tool",
				name: FUSION_SERVER_TOOL_FUNCTION_NAME,
			};
		}

		return {
			type: "function",
			function: { name: FUSION_SERVER_TOOL_FUNCTION_NAME },
		};
	}

	if (choiceName === TOOL_SEARCH_SERVER_TOOL_TYPE) {
		if (protocol === "anthropic.messages") {
			return {
				type: "tool",
				name: TOOL_SEARCH_SERVER_TOOL_FUNCTION_NAME,
			};
		}

		return {
			type: "function",
			function: { name: TOOL_SEARCH_SERVER_TOOL_FUNCTION_NAME },
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
	let webSearchEngine: "auto" | "exa" = DEFAULT_WEB_SEARCH_ENGINE;
	let webSearchMaxResults = DEFAULT_WEB_SEARCH_MAX_RESULTS;
	let webSearchMaxTotalResults: number | null = null;
	let webSearchContextSize: "low" | "medium" | "high" | null = DEFAULT_WEB_SEARCH_CONTEXT_SIZE;
	let webSearchIncludeText = false;
	let webSearchIncludeHighlights = true;
	let webSearchAllowedDomains: string[] = [];
	let webSearchExcludedDomains: string[] = [];
	let webFetchEnabled = false;
	let webFetchMaxChars = DEFAULT_WEB_FETCH_MAX_CHARS;
	let webFetchAllowedDomains: string[] = [];
	let webFetchExcludedDomains: string[] = [];
	let applyPatchEnabled = false;
	let imageGenerationEnabled = false;
	let imageGenerationModel = DEFAULT_IMAGE_GENERATION_MODEL;
	let fusionEnabled = false;
	let fusionAnalysisModels: string[] = [];
	let fusionModel: string | null = null;
	let fusionIncludeWeb = true;
	let toolSearchEnabled = false;
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
			webSearchEngine = defaults.engine;
			webSearchMaxResults = defaults.maxResults;
			webSearchMaxTotalResults = defaults.maxTotalResults;
			webSearchContextSize = defaults.searchContextSize;
			webSearchIncludeText = defaults.includeText;
			webSearchIncludeHighlights = defaults.includeHighlights;
			webSearchAllowedDomains = defaults.allowedDomains;
			webSearchExcludedDomains = defaults.excludedDomains;
			continue;
		}

		if (tool.type === WEB_FETCH_SERVER_TOOL_TYPE) {
			webFetchEnabled = true;
			const defaults = parseWebFetchToolDefaults(tool);
			webFetchMaxChars = defaults.maxChars;
			webFetchAllowedDomains = defaults.allowedDomains;
			webFetchExcludedDomains = defaults.excludedDomains;
			continue;
		}

		if (tool.type === APPLY_PATCH_SERVER_TOOL_TYPE) {
			applyPatchEnabled = true;
			continue;
		}

		if (tool.type === IMAGE_GENERATION_SERVER_TOOL_TYPE) {
			imageGenerationEnabled = true;
			const defaults = parseImageGenerationToolDefaults(tool);
			imageGenerationModel = defaults.model;
			continue;
		}

		if (tool.type === FUSION_SERVER_TOOL_TYPE) {
			fusionEnabled = true;
			const defaults = parseFusionToolDefaults(tool);
			fusionAnalysisModels = defaults.analysisModels;
			fusionModel = defaults.model;
			fusionIncludeWeb = defaults.includeWeb;
			continue;
		}

		if (tool.type === TOOL_SEARCH_SERVER_TOOL_TYPE) {
			toolSearchEnabled = true;
			continue;
		}

		filteredTools.push(tool);
	}

	if (
		!datetimeEnabled &&
		!webSearchEnabled &&
		!webFetchEnabled &&
		!applyPatchEnabled &&
		!imageGenerationEnabled &&
		!fusionEnabled &&
		!toolSearchEnabled
	) {
		return {
			ok: true,
			body: nextBody,
			config: {
				enabled: false,
				datetimeDefaultTimezone: DEFAULT_TIMEZONE,
				webSearchEnabled: false,
				webSearchEngine: DEFAULT_WEB_SEARCH_ENGINE,
				webSearchMaxResults: DEFAULT_WEB_SEARCH_MAX_RESULTS,
				webSearchMaxTotalResults: null,
				webSearchResultsUsed: 0,
				webSearchContextSize: DEFAULT_WEB_SEARCH_CONTEXT_SIZE,
				webSearchIncludeText: false,
				webSearchIncludeHighlights: true,
				webSearchAllowedDomains: [],
				webSearchExcludedDomains: [],
				webFetchEnabled: false,
				webFetchMaxChars: DEFAULT_WEB_FETCH_MAX_CHARS,
				webFetchAllowedDomains: [],
				webFetchExcludedDomains: [],
				applyPatchEnabled: false,
				imageGenerationEnabled: false,
				imageGenerationModel: DEFAULT_IMAGE_GENERATION_MODEL,
				fusionEnabled: false,
				fusionAnalysisModels: [],
				fusionModel: null,
				fusionIncludeWeb: true,
				toolSearchEnabled: false,
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
		if (applyPatchEnabled && !hasAnthropicToolNamed(filteredTools, APPLY_PATCH_SERVER_TOOL_FUNCTION_NAME)) {
			filteredTools.push({
				name: APPLY_PATCH_SERVER_TOOL_FUNCTION_NAME,
				description: APPLY_PATCH_TOOL_DESCRIPTION,
				input_schema: APPLY_PATCH_TOOL_PARAMETERS,
			});
		}
		if (imageGenerationEnabled && !hasAnthropicToolNamed(filteredTools, IMAGE_GENERATION_SERVER_TOOL_FUNCTION_NAME)) {
			filteredTools.push({
				name: IMAGE_GENERATION_SERVER_TOOL_FUNCTION_NAME,
				description: IMAGE_GENERATION_TOOL_DESCRIPTION,
				input_schema: IMAGE_GENERATION_TOOL_PARAMETERS,
			});
		}
		if (fusionEnabled && !hasAnthropicToolNamed(filteredTools, FUSION_SERVER_TOOL_FUNCTION_NAME)) {
			filteredTools.push({
				name: FUSION_SERVER_TOOL_FUNCTION_NAME,
				description: FUSION_TOOL_DESCRIPTION,
				input_schema: FUSION_TOOL_PARAMETERS,
			});
		}
		if (toolSearchEnabled && !hasAnthropicToolNamed(filteredTools, TOOL_SEARCH_SERVER_TOOL_FUNCTION_NAME)) {
			filteredTools.push({
				name: TOOL_SEARCH_SERVER_TOOL_FUNCTION_NAME,
				description: TOOL_SEARCH_TOOL_DESCRIPTION,
				input_schema: TOOL_SEARCH_TOOL_PARAMETERS,
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
		if (fusionEnabled && !hasOpenAIFunctionToolNamed(filteredTools, FUSION_SERVER_TOOL_FUNCTION_NAME)) {
			filteredTools.push({
				type: "function",
				function: {
					name: FUSION_SERVER_TOOL_FUNCTION_NAME,
					description: FUSION_TOOL_DESCRIPTION,
					parameters: FUSION_TOOL_PARAMETERS,
				},
			});
		}
		if (toolSearchEnabled && !hasOpenAIFunctionToolNamed(filteredTools, TOOL_SEARCH_SERVER_TOOL_FUNCTION_NAME)) {
			filteredTools.push({
				type: "function",
				function: {
					name: TOOL_SEARCH_SERVER_TOOL_FUNCTION_NAME,
					description: TOOL_SEARCH_TOOL_DESCRIPTION,
					parameters: TOOL_SEARCH_TOOL_PARAMETERS,
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
			enabled:
				datetimeEnabled ||
				webSearchEnabled ||
				webFetchEnabled ||
				applyPatchEnabled ||
				imageGenerationEnabled ||
				fusionEnabled ||
				toolSearchEnabled,
			datetimeDefaultTimezone,
			webSearchEnabled,
			webSearchEngine,
			webSearchMaxResults,
			webSearchMaxTotalResults,
			webSearchResultsUsed: 0,
			webSearchContextSize,
			webSearchIncludeText,
			webSearchIncludeHighlights,
			webSearchAllowedDomains,
			webSearchExcludedDomains,
			webFetchEnabled,
			webFetchMaxChars,
			webFetchAllowedDomains,
			webFetchExcludedDomains,
			applyPatchEnabled,
			imageGenerationEnabled,
			imageGenerationModel,
			fusionEnabled,
			fusionAnalysisModels,
			fusionModel,
			fusionIncludeWeb,
			toolSearchEnabled,
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

function hostnameMatchesDomain(hostname: string, domain: string): boolean {
	const normalizedHost = hostname.toLowerCase();
	const normalizedDomain = domain.toLowerCase().replace(/^\*\./, "");
	if (!normalizedDomain) return false;
	return normalizedHost === normalizedDomain || normalizedHost.endsWith(`.${normalizedDomain}`);
}

function validateUrlAgainstDomainFilters(
	url: string,
	allowedDomains: string[],
	excludedDomains: string[],
): { ok: true } | { ok: false; error: string; message: string } {
	let hostname = "";
	try {
		hostname = new URL(url).hostname.toLowerCase();
	} catch {
		return {
			ok: false,
			error: "invalid_url",
			message: "url must be a valid HTTP(S) URL",
		};
	}
	if (
		allowedDomains.length > 0 &&
		!allowedDomains.some((domain) => hostnameMatchesDomain(hostname, domain))
	) {
		return {
			ok: false,
			error: "domain_not_allowed",
			message: "url hostname is not included in allowed_domains",
		};
	}
	if (excludedDomains.some((domain) => hostnameMatchesDomain(hostname, domain))) {
		return {
			ok: false,
			error: "domain_excluded",
			message: "url hostname is excluded by excluded_domains",
		};
	}
	return { ok: true };
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
	const allowedDomains = readDomainArray(args.allowed_domains);
	const excludedDomains = readDomainArray(args.excluded_domains);
	const domainValidation = validateUrlAgainstDomainFilters(
		url,
		allowedDomains.length > 0 ? allowedDomains : config.webFetchAllowedDomains,
		excludedDomains.length > 0 ? excludedDomains : config.webFetchExcludedDomains,
	);
	if (domainValidation.ok === false) {
		return {
			toolResult: {
				toolCallId: call.id,
				isError: true,
				content: JSON.stringify({
					error: domainValidation.error,
					message: domainValidation.message,
				}),
			},
			webFetchRequests: 0,
		};
	}

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
	const maxTotalResults =
		readOptionalPositiveInt(args.max_total_results, MAX_WEB_SEARCH_TOTAL_RESULTS) ??
		config.webSearchMaxTotalResults;
	if (
		typeof maxTotalResults === "number" &&
		config.webSearchResultsUsed >= maxTotalResults
	) {
		return {
			toolResult: {
				toolCallId: call.id,
				isError: true,
				content: JSON.stringify({
					error: "search_result_limit_reached",
					message: "gateway web search max_total_results has already been reached",
					max_total_results: maxTotalResults,
				}),
			},
			webFetchRequests: 0,
		};
	}
	const remainingResults =
		typeof maxTotalResults === "number"
			? Math.max(0, maxTotalResults - config.webSearchResultsUsed)
			: maxResults;
	const cappedMaxResults = Math.max(1, Math.min(maxResults, remainingResults));
	const includeText = readBooleanWithFallback(
		args.include_text,
		config.webSearchIncludeText,
	);
	const includeHighlights = readBooleanWithFallback(
		args.include_highlights,
		config.webSearchIncludeHighlights,
	);
	const engine = readSearchEngine(args.engine ?? config.webSearchEngine);
	if (engine !== "auto" && engine !== "exa") {
		return {
			toolResult: {
				toolCallId: call.id,
				isError: true,
				content: JSON.stringify({
					error: "unsupported_search_engine",
					message: "gateway web search currently supports auto and exa engines",
				}),
			},
			webFetchRequests: 0,
		};
	}
	const allowedDomains = readDomainArray(args.allowed_domains);
	const excludedDomains = readDomainArray(args.excluded_domains);
	const searchContextSize =
		readSearchContextSize(args.search_context_size) ??
		config.webSearchContextSize;

	const contents: Record<string, unknown> = {};
	if (includeText) {
		contents.text = true;
	}
	if (includeHighlights || !includeText) {
		const highlights: Record<string, unknown> = {};
		if (searchContextSize) {
			highlights.maxCharacters =
				searchContextSize === "low"
					? 5000
					: searchContextSize === "high"
						? 30000
						: 15000;
		}
		contents.highlights = Object.keys(highlights).length > 0 ? highlights : true;
	}

	try {
		const searchBody: Record<string, unknown> = {
			query,
			type: "auto",
			numResults: cappedMaxResults,
			contents,
		};
		const includeDomains =
			allowedDomains.length > 0 ? allowedDomains : config.webSearchAllowedDomains;
		const excludeDomains =
			excludedDomains.length > 0 ? excludedDomains : config.webSearchExcludedDomains;
		if (includeDomains.length > 0) {
			searchBody.includeDomains = includeDomains;
		}
		if (excludeDomains.length > 0) {
			searchBody.excludeDomains = excludeDomains;
		}

		const response = await fetch(`${searchConfig.baseUrl}/search`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": searchConfig.apiKey,
			},
			body: JSON.stringify(searchBody),
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
		const normalizedResults = results.slice(0, cappedMaxResults).map((result) => ({
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
		config.webSearchResultsUsed += normalizedResults.length;
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
					engine,
					query,
					results: normalizedResults,
					max_total_results: maxTotalResults,
					results_used: config.webSearchResultsUsed,
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

function validateApplyPatchBlock(patch: string): { ok: true; patch: string } | { ok: false; message: string } {
	const normalized = patch.replace(/\r\n/g, "\n").trim();
	if (!normalized.startsWith("*** Begin Patch")) {
		return {
			ok: false,
			message: "patch must begin with *** Begin Patch",
		};
	}
	if (!normalized.endsWith("*** End Patch")) {
		return {
			ok: false,
			message: "patch must end with *** End Patch",
		};
	}
	if (
		!normalized.includes("\n*** Add File: ") &&
		!normalized.includes("\n*** Update File: ") &&
		!normalized.includes("\n*** Delete File: ")
	) {
		return {
			ok: false,
			message: "patch must contain at least one Add File, Update File, or Delete File section",
		};
	}
	return { ok: true, patch: normalized };
}

function executeApplyPatchToolCall(
	call: { id: string; arguments: string },
): IRToolResult {
	const args = parseJsonObject(call.arguments);
	const patch = toNonEmptyString(args.patch);
	if (!patch) {
		return {
			toolCallId: call.id,
			isError: true,
			content: JSON.stringify({
				error: "invalid_patch",
				message: "patch is required for gateway apply patch",
			}),
		};
	}

	const validation = validateApplyPatchBlock(patch);
	if (validation.ok === false) {
		return {
			toolCallId: call.id,
			isError: true,
			content: JSON.stringify({
				error: "invalid_patch",
				message: validation.message,
			}),
		};
	}

	return {
		toolCallId: call.id,
		content: JSON.stringify({
			type: "apply_patch",
			format: "codex_v4a",
			applied: false,
			summary: toNonEmptyString(args.summary),
			patch: validation.patch,
		}),
	};
}

const TOOL_SEARCH_REGISTRY = [
	{
		type: DATETIME_SERVER_TOOL_TYPE,
		function_name: DATETIME_SERVER_TOOL_FUNCTION_NAME,
		category: "utility",
		description: DATETIME_TOOL_DESCRIPTION,
		status: "available",
		parameters: DATETIME_TOOL_PARAMETERS,
	},
	{
		type: WEB_SEARCH_SERVER_TOOL_TYPE,
		function_name: WEB_SEARCH_SERVER_TOOL_FUNCTION_NAME,
		category: "web",
		description: WEB_SEARCH_TOOL_DESCRIPTION,
		status: "available",
		parameters: WEB_SEARCH_TOOL_PARAMETERS,
	},
	{
		type: WEB_FETCH_SERVER_TOOL_TYPE,
		function_name: WEB_FETCH_SERVER_TOOL_FUNCTION_NAME,
		category: "web",
		description: WEB_FETCH_TOOL_DESCRIPTION,
		status: "available",
		parameters: WEB_FETCH_TOOL_PARAMETERS,
	},
	{
		type: APPLY_PATCH_SERVER_TOOL_TYPE,
		function_name: APPLY_PATCH_SERVER_TOOL_FUNCTION_NAME,
		category: "coding",
		description: APPLY_PATCH_TOOL_DESCRIPTION,
		status: "available",
		parameters: APPLY_PATCH_TOOL_PARAMETERS,
	},
	{
		type: IMAGE_GENERATION_SERVER_TOOL_TYPE,
		function_name: IMAGE_GENERATION_SERVER_TOOL_FUNCTION_NAME,
		category: "media",
		description: IMAGE_GENERATION_TOOL_DESCRIPTION,
		status: "beta",
		parameters: IMAGE_GENERATION_TOOL_PARAMETERS,
	},
	{
		type: FUSION_SERVER_TOOL_TYPE,
		function_name: FUSION_SERVER_TOOL_FUNCTION_NAME,
		category: "orchestration",
		description: FUSION_TOOL_DESCRIPTION,
		status: "beta",
		parameters: FUSION_TOOL_PARAMETERS,
	},
	{
		type: TOOL_SEARCH_SERVER_TOOL_TYPE,
		function_name: TOOL_SEARCH_SERVER_TOOL_FUNCTION_NAME,
		category: "discovery",
		description: TOOL_SEARCH_TOOL_DESCRIPTION,
		status: "available",
		parameters: TOOL_SEARCH_TOOL_PARAMETERS,
	},
] as const;

function scoreToolSearchResult(entry: typeof TOOL_SEARCH_REGISTRY[number], query: string): number {
	const haystack = [
		entry.type,
		entry.function_name,
		entry.category,
		entry.description,
		entry.status,
	].join(" ").toLowerCase();
	const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
	if (terms.length === 0) return 0;
	return terms.reduce((score, term) => {
		if (entry.type.toLowerCase().includes(term)) return score + 8;
		if (entry.function_name.toLowerCase().includes(term)) return score + 6;
		if (entry.category.toLowerCase().includes(term)) return score + 4;
		if (haystack.includes(term)) return score + 2;
		return score;
	}, 0);
}

function executeToolSearchToolCall(call: { id: string; arguments: string }): IRToolResult {
	const args = parseJsonObject(call.arguments);
	const query = toNonEmptyString(args.query);
	if (!query) {
		return {
			toolCallId: call.id,
			isError: true,
			content: JSON.stringify({
				error: "invalid_query",
				message: "query is required for gateway tool search",
			}),
		};
	}
	const maxResults = readPositiveIntWithFallback(
		args.max_results,
		8,
		MAX_TOOL_SEARCH_RESULTS,
	);
	const results = TOOL_SEARCH_REGISTRY
		.map((entry) => ({
			...entry,
			score: scoreToolSearchResult(entry, query),
		}))
		.filter((entry) => entry.score > 0)
		.sort((left, right) => right.score - left.score || left.type.localeCompare(right.type))
		.slice(0, maxResults)
		.map(({ score: _score, ...entry }) => entry);

	return {
		toolCallId: call.id,
		content: JSON.stringify({
			query,
			results,
		}),
	};
}

function buildInternalJsonRequest(
	sourceRequest: Request,
	pathname: string,
	body: Record<string, unknown>,
): Request {
	const sourceUrl = new URL(sourceRequest.url);
	sourceUrl.pathname = pathname;
	sourceUrl.search = "";
	const headers = new Headers(sourceRequest.headers);
	headers.set("Content-Type", "application/json");
	headers.set("Accept", "application/json");
	headers.set("X-AI-Stats-Server-Tool", "true");
	return new Request(sourceUrl.toString(), {
		method: "POST",
		headers,
		body: JSON.stringify(body),
	});
}

async function runInternalJsonEndpoint(args: {
	sourceRequest: Request;
	endpoint: "chat.completions" | "images.generations";
	pathname: string;
	body: Record<string, unknown>;
}): Promise<{ ok: true; json: Record<string, any> } | { ok: false; status: number; json: Record<string, any> | null; text: string }> {
	const [{ makeEndpointHandler }, { schemaFor }] = await Promise.all([
		import("@pipeline/index"),
		import("@core/schemas"),
	]);
	const handler = makeEndpointHandler({
		endpoint: args.endpoint,
		schema: schemaFor(args.endpoint),
	});
	const response = await handler(
		buildInternalJsonRequest(args.sourceRequest, args.pathname, args.body),
	);
	const text = await response.text();
	let json: Record<string, any> | null = null;
	try {
		const parsed = JSON.parse(text);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			json = parsed as Record<string, any>;
		}
	} catch {
		json = null;
	}
	if (!response.ok) {
		return {
			ok: false,
			status: response.status,
			json,
			text: text.slice(0, 1000),
		};
	}
	return {
		ok: true,
		json: json ?? {},
	};
}

async function executeImageGenerationToolCall(
	call: { id: string; arguments: string },
	config: ServerToolConfig,
	runtime: ServerToolRuntime,
): Promise<IRToolResult> {
	const args = parseJsonObject(call.arguments);
	const prompt = toNonEmptyString(args.prompt);
	if (!prompt) {
		return {
			toolCallId: call.id,
			isError: true,
			content: JSON.stringify({
				error: "invalid_prompt",
				message: "prompt is required for gateway image generation",
			}),
		};
	}
	if (!runtime.sourceRequest) {
		return {
			toolCallId: call.id,
			isError: true,
			content: JSON.stringify({
				error: "server_tool_context_missing",
				message: "gateway image generation requires request context",
			}),
		};
	}

	const requestBody: Record<string, unknown> = {
		model: toNonEmptyString(args.model) ?? config.imageGenerationModel,
		prompt,
	};
	for (const key of ["size", "quality", "n", "response_format", "output_format", "background", "style"]) {
		if (args[key] !== undefined) requestBody[key] = args[key];
	}

	const result = await runInternalJsonEndpoint({
		sourceRequest: runtime.sourceRequest,
		endpoint: "images.generations",
		pathname: "/v1/images/generations",
		body: requestBody,
	});
	if (result.ok === false) {
		return {
			toolCallId: call.id,
			isError: true,
			content: JSON.stringify({
				error: "image_generation_failed",
				status: result.status,
				response: result.json ?? result.text,
			}),
		};
	}

	return {
		toolCallId: call.id,
		content: JSON.stringify({
			type: "image_generation",
			model: result.json.model ?? requestBody.model,
			data: Array.isArray(result.json.data) ? result.json.data : [],
			usage: result.json.usage ?? null,
		}),
	};
}

function extractChatCompletionContent(payload: Record<string, any>): string {
	const content = payload?.choices?.[0]?.message?.content;
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.map((part) => {
				if (typeof part === "string") return part;
				if (typeof part?.text === "string") return part.text;
				if (typeof part?.content === "string") return part.content;
				return "";
			})
			.filter(Boolean)
			.join("\n");
	}
	return "";
}

async function runFusionChatCall(args: {
	sourceRequest: Request;
	model: string;
	messages: Array<Record<string, unknown>>;
	tools?: Array<Record<string, unknown>>;
}): Promise<{ ok: true; content: string; raw: Record<string, any> } | { ok: false; error: Record<string, unknown> }> {
	const body: Record<string, unknown> = {
		model: args.model,
		messages: args.messages,
		stream: false,
		...(args.tools && args.tools.length > 0 ? { tools: args.tools } : {}),
	};
	const result = await runInternalJsonEndpoint({
		sourceRequest: args.sourceRequest,
		endpoint: "chat.completions",
		pathname: "/v1/chat/completions",
		body,
	});
	if (result.ok === false) {
		return {
			ok: false,
			error: {
				status: result.status,
				response: result.json ?? result.text,
			},
		};
	}
	return {
		ok: true,
		content: extractChatCompletionContent(result.json),
		raw: result.json,
	};
}

async function executeFusionToolCall(
	call: { id: string; arguments: string },
	config: ServerToolConfig,
	runtime: ServerToolRuntime,
): Promise<IRToolResult> {
	const args = parseJsonObject(call.arguments);
	const input = toNonEmptyString(args.input);
	if (!input) {
		return {
			toolCallId: call.id,
			isError: true,
			content: JSON.stringify({
				error: "invalid_input",
				message: "input is required for gateway fusion",
			}),
		};
	}
	if (!runtime.sourceRequest) {
		return {
			toolCallId: call.id,
			isError: true,
			content: JSON.stringify({
				error: "server_tool_context_missing",
				message: "gateway fusion requires request context",
			}),
		};
	}
	const outerModel = runtime.outerModel ?? "auto";
	const analysisModels = (
		readStringArray(args.analysis_models, DEFAULT_FUSION_MAX_ANALYSIS_MODELS).length > 0
			? readStringArray(args.analysis_models, DEFAULT_FUSION_MAX_ANALYSIS_MODELS)
			: config.fusionAnalysisModels
	).slice(0, DEFAULT_FUSION_MAX_ANALYSIS_MODELS);
	const panelModels = analysisModels.length > 0 ? analysisModels : [outerModel];
	const judgeModel =
		toNonEmptyString(args.model) ??
		config.fusionModel ??
		outerModel;
	const includeWeb = readBooleanWithFallback(args.include_web, config.fusionIncludeWeb);
	const analysisTools = includeWeb
		? [
			{ type: WEB_SEARCH_SERVER_TOOL_TYPE, parameters: { max_results: 5, max_total_results: 10 } },
			{ type: WEB_FETCH_SERVER_TOOL_TYPE, parameters: { max_chars: 12000 } },
		]
		: [];

	const analysisResults = await Promise.allSettled(
		panelModels.map((model) =>
			runFusionChatCall({
				sourceRequest: runtime.sourceRequest as Request,
				model,
				tools: analysisTools,
				messages: [
					{
						role: "system",
						content: "You are one member of a bounded expert analysis panel. Provide concise evidence, caveats, and conclusions. Do not write the final answer.",
					},
					{ role: "user", content: input },
				],
			}),
		),
	);
	const responses = analysisResults.map((result, index) => {
		const model = panelModels[index];
		if (result.status === "fulfilled" && result.value.ok) {
			return {
				model,
				status: "ok",
				content: result.value.content,
			};
		}
		return {
			model,
			status: "error",
			error: result.status === "fulfilled" && result.value.ok === false
				? result.value.error
				: result.status === "rejected"
					? String(result.reason)
					: "unknown_fusion_error",
		};
	});
	const successfulResponses = responses.filter((response) => response.status === "ok");
	if (successfulResponses.length === 0) {
		return {
			toolCallId: call.id,
			isError: true,
			content: JSON.stringify({
				status: "error",
				error: "fusion_analysis_failed",
				responses,
			}),
		};
	}

	const judge = await runFusionChatCall({
		sourceRequest: runtime.sourceRequest,
		model: judgeModel,
		messages: [
			{
				role: "system",
				content: "Return concise JSON with keys consensus, contradictions, partial_coverage, unique_insights, and blind_spots. Base it only on the supplied panel responses.",
			},
			{
				role: "user",
				content: JSON.stringify({
					task: input,
					responses: successfulResponses,
				}),
			},
		],
	});

	let analysis: Record<string, unknown> = {};
	if (judge.ok) {
		try {
			const parsed = JSON.parse(judge.content);
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
				analysis = parsed as Record<string, unknown>;
			} else {
				analysis = { summary: judge.content };
			}
		} catch {
			analysis = { summary: judge.content };
		}
	} else if (judge.ok === false) {
		analysis = {
			summary: successfulResponses.map((response) => response.content).join("\n\n"),
			judge_error: judge.error,
		};
	}

	return {
		toolCallId: call.id,
		content: JSON.stringify({
			status: "ok",
			model: judgeModel,
			analysis,
			responses,
		}),
	};
}

export async function buildServerToolContinuation(
	irResponse: IRChatResponse,
	config: ServerToolConfig,
	runtime: ServerToolRuntime = {},
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
			call?.name === APPLY_PATCH_SERVER_TOOL_FUNCTION_NAME ||
			call?.name === IMAGE_GENERATION_SERVER_TOOL_FUNCTION_NAME ||
			call?.name === FUSION_SERVER_TOOL_FUNCTION_NAME ||
			call?.name === TOOL_SEARCH_SERVER_TOOL_FUNCTION_NAME,
	);
	if (serverToolCalls.length === 0) return null;

	// If mixed with client-managed function calls, skip server execution for this turn.
	if (serverToolCalls.length !== toolCalls.length) return null;

	const toolResults: IRToolResult[] = [];
	const usage: ServerToolExecutionMetrics = {
		datetimeRequests: 0,
		webSearchRequests: 0,
		webFetchRequests: 0,
		applyPatchRequests: 0,
		imageGenerationRequests: 0,
		fusionRequests: 0,
		toolSearchRequests: 0,
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
			continue;
		}

		if (call.name === APPLY_PATCH_SERVER_TOOL_FUNCTION_NAME) {
			toolResults.push(
				executeApplyPatchToolCall({
					id: call.id,
					arguments: call.arguments,
				}),
			);
			usage.applyPatchRequests += 1;
			continue;
		}

		if (call.name === IMAGE_GENERATION_SERVER_TOOL_FUNCTION_NAME) {
			toolResults.push(
				await executeImageGenerationToolCall(
					{ id: call.id, arguments: call.arguments },
					config,
					runtime,
				),
			);
			usage.imageGenerationRequests += 1;
			continue;
		}

		if (call.name === FUSION_SERVER_TOOL_FUNCTION_NAME) {
			toolResults.push(
				await executeFusionToolCall(
					{ id: call.id, arguments: call.arguments },
					config,
					runtime,
				),
			);
			usage.fusionRequests += 1;
			continue;
		}

		if (call.name === TOOL_SEARCH_SERVER_TOOL_FUNCTION_NAME) {
			toolResults.push(
				executeToolSearchToolCall({
					id: call.id,
					arguments: call.arguments,
				}),
			);
			usage.toolSearchRequests += 1;
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
					apply_patch_requests:
						(base._ext?.serverToolUse?.apply_patch_requests ?? 0) +
						(incoming._ext?.serverToolUse?.apply_patch_requests ?? 0),
					image_generation_requests:
						(base._ext?.serverToolUse?.image_generation_requests ?? 0) +
						(incoming._ext?.serverToolUse?.image_generation_requests ?? 0),
					fusion_requests:
						(base._ext?.serverToolUse?.fusion_requests ?? 0) +
						(incoming._ext?.serverToolUse?.fusion_requests ?? 0),
					tool_search_requests:
						(base._ext?.serverToolUse?.tool_search_requests ?? 0) +
						(incoming._ext?.serverToolUse?.tool_search_requests ?? 0),
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
					apply_patch_requests:
						(base._ext?.serverToolUse?.apply_patch_requests ?? 0) +
						(incoming._ext?.serverToolUse?.apply_patch_requests ?? 0),
					image_generation_requests:
						(base._ext?.serverToolUse?.image_generation_requests ?? 0) +
						(incoming._ext?.serverToolUse?.image_generation_requests ?? 0),
					fusion_requests:
						(base._ext?.serverToolUse?.fusion_requests ?? 0) +
						(incoming._ext?.serverToolUse?.fusion_requests ?? 0),
					tool_search_requests:
						(base._ext?.serverToolUse?.tool_search_requests ?? 0) +
						(incoming._ext?.serverToolUse?.tool_search_requests ?? 0),
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
		args.webFetchRequests <= 0 &&
		args.applyPatchRequests <= 0 &&
		args.imageGenerationRequests <= 0 &&
		args.fusionRequests <= 0 &&
		args.toolSearchRequests <= 0
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
			apply_patch_requests: (existing?.apply_patch_requests ?? 0) + Math.max(0, args.applyPatchRequests),
			image_generation_requests:
				(existing?.image_generation_requests ?? 0) + Math.max(0, args.imageGenerationRequests),
			fusion_requests: (existing?.fusion_requests ?? 0) + Math.max(0, args.fusionRequests),
			tool_search_requests:
				(existing?.tool_search_requests ?? 0) + Math.max(0, args.toolSearchRequests),
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
		args.webFetchRequests <= 0 &&
		args.applyPatchRequests <= 0 &&
		args.imageGenerationRequests <= 0 &&
		args.fusionRequests <= 0 &&
		args.toolSearchRequests <= 0
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
	apply_patch_requests:
		(Number(existing?.apply_patch_requests ?? 0) || 0) + Math.max(0, args.applyPatchRequests),
	image_generation_requests:
		(Number(existing?.image_generation_requests ?? 0) || 0) + Math.max(0, args.imageGenerationRequests),
	fusion_requests:
		(Number(existing?.fusion_requests ?? 0) || 0) + Math.max(0, args.fusionRequests),
	tool_search_requests:
		(Number(existing?.tool_search_requests ?? 0) || 0) + Math.max(0, args.toolSearchRequests),
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
