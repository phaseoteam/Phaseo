// Purpose: Shared helpers for provider-native tool definitions.
// Why: Preserve native tool identity across schema validation, decoding, and routing.
// How: Exposes canonical native tool types and small detection helpers.

import { normalizeProviderId } from "@/lib/config/providerAliases";

export const OPENAI_NATIVE_WEB_SEARCH_TOOL_TYPES = [
	"web_search",
	"web_search_2025_08_26",
	"web_search_preview",
	"web_search_preview_2025_03_11",
] as const;

export const ANTHROPIC_NATIVE_WEB_SEARCH_TOOL_TYPES = [
	"web_search_20250305",
	"web_search_20260209",
	"web_search_20260318",
] as const;

export const ANTHROPIC_NATIVE_WEB_FETCH_TOOL_TYPES = [
	"web_fetch_20250910",
	"web_fetch_20260209",
	"web_fetch_20260309",
	"web_fetch_20260318",
] as const;

export const ANTHROPIC_NATIVE_ADVISOR_TOOL_TYPES = [
	"advisor_20260301",
] as const;

export const NATIVE_WEB_SEARCH_TOOL_TYPES = [
	...OPENAI_NATIVE_WEB_SEARCH_TOOL_TYPES,
	...ANTHROPIC_NATIVE_WEB_SEARCH_TOOL_TYPES,
] as const;

export const NATIVE_WEB_FETCH_TOOL_TYPES = [
	...ANTHROPIC_NATIVE_WEB_FETCH_TOOL_TYPES,
] as const;

export const NATIVE_ADVISOR_TOOL_TYPES = [
	...ANTHROPIC_NATIVE_ADVISOR_TOOL_TYPES,
] as const;

export type OpenAINativeWebSearchToolType =
	(typeof OPENAI_NATIVE_WEB_SEARCH_TOOL_TYPES)[number];
export type AnthropicNativeWebSearchToolType =
	(typeof ANTHROPIC_NATIVE_WEB_SEARCH_TOOL_TYPES)[number];
export type AnthropicNativeWebFetchToolType =
	(typeof ANTHROPIC_NATIVE_WEB_FETCH_TOOL_TYPES)[number];
export type AnthropicNativeAdvisorToolType =
	(typeof ANTHROPIC_NATIVE_ADVISOR_TOOL_TYPES)[number];
export type NativeWebSearchToolType =
	(typeof NATIVE_WEB_SEARCH_TOOL_TYPES)[number];
export type NativeWebFetchToolType =
	(typeof NATIVE_WEB_FETCH_TOOL_TYPES)[number];
export type NativeAdvisorToolType =
	(typeof NATIVE_ADVISOR_TOOL_TYPES)[number];

function toNonEmptyString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

export function isOpenAINativeWebSearchToolType(
	value: unknown,
): value is OpenAINativeWebSearchToolType {
	return (
		typeof value === "string" &&
		(OPENAI_NATIVE_WEB_SEARCH_TOOL_TYPES as readonly string[]).includes(value)
	);
}

export function isAnthropicNativeWebSearchToolType(
	value: unknown,
): value is AnthropicNativeWebSearchToolType {
	return (
		typeof value === "string" &&
		(ANTHROPIC_NATIVE_WEB_SEARCH_TOOL_TYPES as readonly string[]).includes(value)
	);
}

export function isNativeWebSearchToolType(
	value: unknown,
): value is NativeWebSearchToolType {
	return (
		isOpenAINativeWebSearchToolType(value) ||
		isAnthropicNativeWebSearchToolType(value)
	);
}

export function isAnthropicNativeWebFetchToolType(
	value: unknown,
): value is AnthropicNativeWebFetchToolType {
	return (
		typeof value === "string" &&
		(ANTHROPIC_NATIVE_WEB_FETCH_TOOL_TYPES as readonly string[]).includes(value)
	);
}

export function isNativeWebFetchToolType(
	value: unknown,
): value is NativeWebFetchToolType {
	return isAnthropicNativeWebFetchToolType(value);
}

export function isAnthropicNativeAdvisorToolType(
	value: unknown,
): value is AnthropicNativeAdvisorToolType {
	return (
		typeof value === "string" &&
		(ANTHROPIC_NATIVE_ADVISOR_TOOL_TYPES as readonly string[]).includes(value)
	);
}

export function isNativeAdvisorToolType(
	value: unknown,
): value is NativeAdvisorToolType {
	return isAnthropicNativeAdvisorToolType(value);
}

export function isOpenAINativeWebSearchTool(tool: unknown): boolean {
	if (!tool || typeof tool !== "object") return false;
	return isOpenAINativeWebSearchToolType((tool as Record<string, unknown>).type);
}

export function isNativeWebSearchTool(tool: unknown): boolean {
	if (!tool || typeof tool !== "object") return false;
	return isNativeWebSearchToolType((tool as Record<string, unknown>).type);
}

export function isNativeWebFetchTool(tool: unknown): boolean {
	if (!tool || typeof tool !== "object") return false;
	return isNativeWebFetchToolType((tool as Record<string, unknown>).type);
}

export function isNativeAdvisorTool(tool: unknown): boolean {
	if (!tool || typeof tool !== "object") return false;
	return isNativeAdvisorToolType((tool as Record<string, unknown>).type);
}

export function extractToolNameOrType(tool: unknown): string | undefined {
	if (!tool || typeof tool !== "object") return undefined;
	const value = tool as Record<string, any>;
	return (
		toNonEmptyString(value.name) ??
		toNonEmptyString(value.function?.name) ??
		toNonEmptyString(value.type)
	);
}

export function isIRNativeToolDefinition(tool: unknown): boolean {
	if (!tool || typeof tool !== "object") return false;
	const type = toNonEmptyString((tool as Record<string, unknown>).type);
	return Boolean(
		type &&
			type !== "function" &&
			type !== "gateway:datetime" &&
			!type.startsWith("phaseo:"),
	);
}

/**
 * OpenAI hosted tools other than web search: OpenAI runs them inside its own
 * Responses API (https://platform.openai.com/docs/guides/tools). No other
 * provider API defines them, and the gateway has no stand-in for them.
 */
export const OPENAI_HOSTED_TOOL_TYPES = [
	"file_search",
	"code_interpreter",
	"computer",
	"computer_use",
	"computer_use_preview",
	"mcp",
	"image_generation",
	"local_shell",
	"shell",
	"apply_patch",
] as const;

export function isOpenAIHostedToolType(value: unknown): boolean {
	return (
		typeof value === "string" &&
		(isOpenAINativeWebSearchToolType(value) ||
			(OPENAI_HOSTED_TOOL_TYPES as readonly string[]).includes(value))
	);
}

// Hosted tools xAI's Responses API also runs (https://docs.x.ai/docs/guides/tools/overview).
const XAI_HOSTED_TOOL_TYPES = new Set<string>(["code_interpreter", "mcp"]);

/**
 * DeepSeek's built-in web tools (https://api-docs.deepseek.com/guides/web_tools).
 * The DeepSeek executor sends a native web search as `deepseek_web_search` and a
 * native web fetch as `deepseek_read_url`.
 */
export const DEEPSEEK_NATIVE_WEB_SEARCH_TOOL_TYPE = "deepseek_web_search";
export const DEEPSEEK_NATIVE_READ_URL_TOOL_TYPE = "deepseek_read_url";

/** DeepSeek serves its web tools on `deepseek-flash` (V4.1 Flash) and the legacy Flash names that alias it. */
export function isDeepSeekWebToolModel(model: string | null | undefined): boolean {
	const id = String(model ?? "").toLowerCase().replace(/^deepseek\//, "");
	return /^deepseek-(?:v4(?:\.1)?-)?flash(?:$|-)/.test(id);
}

function hasDomainFilter(source: unknown): boolean {
	if (!source || typeof source !== "object") return false;
	const value = source as Record<string, any>;
	const lists = [
		value.allowed_domains, value.include_domains, value.excluded_domains,
		value.exclude_domains, value.blocked_domains,
		value.filters && typeof value.filters === "object" ? value.filters.allowed_domains : undefined,
	];
	return lists.some((list) => Array.isArray(list) && list.length > 0);
}

/**
 * Whether DeepSeek can run this web search natively. DeepSeek rejects (400) a web
 * tool that carries domain filters, and a request that declares any other tool
 * beside its web tools ("other tools cannot be used together with
 * deepseek_web_search, deepseek_read_url"). Such requests stay on the gateway's
 * own search, which DeepSeek models can call like any function.
 */
export function deepSeekRunsNativeWebSearch(args: {
	model?: string | null;
	tool?: unknown;
	otherToolCount?: number;
}): boolean {
	if (!isDeepSeekWebToolModel(args.model)) return false;
	if ((args.otherToolCount ?? 0) > 0) return false;
	const tool = args.tool && typeof args.tool === "object" ? args.tool as Record<string, any> : null;
	if (tool && (hasDomainFilter(tool) || hasDomainFilter(tool.parameters))) return false;
	return true;
}

/**
 * Whether the route sends the request to a Responses API that runs this
 * OpenAI hosted tool itself: OpenAI (both endpoints; Chat requests carrying a
 * hosted tool go to /v1/responses), Azure OpenAI deployments on /responses,
 * and xAI for web search, code interpreter and MCP. DeepSeek runs web search
 * itself on Flash, as `deepseek_web_search`, when the request allows it (see
 * deepSeekRunsNativeWebSearch). Everything else would receive a tool
 * definition its API does not define.
 */
export function routeRunsOpenAIHostedTool(args: {
	providerId: string;
	model?: string | null;
	endpoint: string;
	toolType: string;
	/** The request's tool entry, for providers whose support depends on its options. */
	tool?: unknown;
	/** Tools in the request other than hosted web search. */
	otherToolCount?: number;
}): boolean {
	// Collapses xAI's ids (x-ai, xai and the routed spacex-ai) onto one id.
	const providerId = normalizeProviderId(String(args.providerId ?? ""));
	const model = String(args.model ?? "").toLowerCase();
	if (providerId === "openai" || providerId === "openai-eu") return true;
	if (providerId === "azure") {
		// Azure also serves Claude and MAI models, which do not run on its Responses API.
		return args.endpoint === "responses" && !/(?:^|\/)(?:claude-|mai-)/.test(model);
	}
	if (providerId === "spacex-ai") {
		return isOpenAINativeWebSearchToolType(args.toolType) || XAI_HOSTED_TOOL_TYPES.has(args.toolType);
	}
	if (providerId === "deepseek") {
		return isOpenAINativeWebSearchToolType(args.toolType) && deepSeekRunsNativeWebSearch(args);
	}
	return false;
}
