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
 * Whether the route sends the request to a Responses API that runs this
 * OpenAI hosted tool itself: OpenAI (both endpoints; Chat requests carrying a
 * hosted tool go to /v1/responses), Azure OpenAI deployments on /responses,
 * and xAI for web search, code interpreter and MCP. Everything else would
 * receive a tool definition its API does not define.
 */
export function routeRunsOpenAIHostedTool(args: {
	providerId: string;
	model?: string | null;
	endpoint: string;
	toolType: string;
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
	return false;
}
