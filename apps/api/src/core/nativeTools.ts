// Purpose: Shared helpers for provider-native tool definitions.
// Why: Preserve native tool identity across schema validation, decoding, and routing.
// How: Exposes canonical native tool types and small detection helpers.

export const OPENAI_NATIVE_WEB_SEARCH_TOOL_TYPES = [
	"web_search",
	"web_search_2025_08_26",
	"web_search_preview",
	"web_search_preview_2025_03_11",
] as const;

export const ANTHROPIC_NATIVE_WEB_SEARCH_TOOL_TYPES = [
	"web_search_20250305",
	"web_search_20260209",
] as const;

export const ANTHROPIC_NATIVE_WEB_FETCH_TOOL_TYPES = [
	"web_fetch_20260209",
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
			!type.startsWith("ai-stats:"),
	);
}
