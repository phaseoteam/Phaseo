// Purpose: Shared text-protocol normalizers for IR translation.
// Why: Avoid drift across chat/responses decoders for common field mappings.
// How: Centralizes conversion of request surface fields to IR-compatible values.

import type {
	IRCacheControl,
	IRChatRequest,
	IRGeoPreferences,
	IRReasoning,
	IRTool,
} from "@core/ir";
import { normalizeTextServiceTier } from "@core/serviceTiers";

export function normalizeResponseFormat(
	format: unknown,
): IRChatRequest["responseFormat"] {
	if (!format) return undefined;

	if (typeof format === "string") {
		if (format === "json_object" || format === "json") {
			return { type: "json_object" };
		}
		return { type: "text" };
	}

	if (typeof format === "object") {
		const value = format as Record<string, any>;
		if (value.type === "json_object" || value.type === "json") {
			return {
				type: "json_object",
				schema: value.schema,
			};
		}

		if (value.type === "json_schema") {
			return {
				type: "json_schema",
				schema:
					value.schema ??
					value.json_schema?.schema ??
					value.json_schema?.schema_,
				name: value.name ?? value.json_schema?.name,
				strict: value.strict ?? value.json_schema?.strict,
			};
		}

		return { type: "text" };
	}

	return undefined;
}

export function normalizeImageConfig(
	imageConfig: unknown,
): IRChatRequest["imageConfig"] {
	if (!imageConfig || typeof imageConfig !== "object") {
		return undefined;
	}

	const value = imageConfig as Record<string, any>;
	return {
		aspectRatio: value.aspect_ratio ?? value.aspectRatio,
		imageSize: value.image_size ?? value.imageSize,
		fontInputs: Array.isArray(value.font_inputs)
			? value.font_inputs.map((entry: any) => ({
				fontUrl: entry?.font_url,
				text: entry?.text,
			}))
			: Array.isArray(value.fontInputs)
				? value.fontInputs.map((entry: any) => ({
					fontUrl: entry?.fontUrl ?? entry?.font_url,
					text: entry?.text,
				}))
				: undefined,
		superResolutionReferences:
			value.super_resolution_references ?? value.superResolutionReferences,
		includeRaiReason: value.include_rai_reason ?? value.includeRaiReason,
		referenceImages: Array.isArray(value.reference_images)
			? value.reference_images
			: Array.isArray(value.referenceImages)
				? value.referenceImages
				: undefined,
	};
}

export function normalizeModalities(
	modalities: unknown,
): IRChatRequest["modalities"] {
	const values = Array.isArray(modalities) ? modalities : [modalities];
	const mapped = values
		.map((value) => (typeof value === "string" ? value.trim().toLowerCase() : ""))
		.map((value) => {
			if (value === "text") return "text";
			if (value === "image" || value === "images") return "image";
			if (value === "audio" || value === "audios") return "audio";
			return "";
		})
		.filter(
			(value): value is "text" | "image" | "audio" =>
				value === "text" || value === "image" || value === "audio",
		);

	return mapped.length > 0 ? Array.from(new Set(mapped)) : undefined;
}

export function normalizeThinkingConfig(thinking: unknown): IRReasoning | undefined {
	if (!thinking || typeof thinking !== "object") return undefined;
	const value = thinking as Record<string, any>;

	const enabledFromType =
		typeof value.type === "string"
			? value.type.toLowerCase() === "enabled" || value.type.toLowerCase() === "adaptive"
			: undefined;
	const effortRaw =
		typeof value.effort === "string" ? value.effort.toLowerCase() : undefined;
	const effort: IRReasoning["effort"] =
		effortRaw === "none" ||
		effortRaw === "minimal" ||
		effortRaw === "low" ||
		effortRaw === "medium" ||
		effortRaw === "high" ||
		effortRaw === "xhigh" ||
		effortRaw === "max"
			? effortRaw
			: undefined;
	const maxTokens = (() => {
		const candidate =
			value.max_tokens ??
			value.maxTokens ??
			value.budget_tokens ??
			value.budgetTokens ??
			value.thinking_budget ??
			value.thinkingBudget;
		return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : undefined;
	})();
	const includeThoughts = (() => {
		const candidate = value.include_thoughts ?? value.includeThoughts;
		return typeof candidate === "boolean" ? candidate : undefined;
	})();

	const reasoning: IRReasoning = {
		enabled:
			typeof value.enabled === "boolean"
				? value.enabled
				: enabledFromType,
		effort,
		maxTokens,
		includeThoughts,
		context: value.keep === "all" ? "all_turns" : undefined,
	};

	if (
		reasoning.enabled === undefined &&
		reasoning.effort === undefined &&
		reasoning.maxTokens === undefined &&
		reasoning.includeThoughts === undefined
	) {
		return undefined;
	}

	return reasoning;
}

export function normalizeOpenAIToolChoice(
	choice: unknown,
	options?: { unknownStringFallback?: IRChatRequest["toolChoice"] },
): IRChatRequest["toolChoice"] {
	if (!choice) return undefined;

	if (typeof choice === "string") {
		const normalized = choice.trim();
		if (!normalized) return undefined;
		if (normalized === "auto") return "auto";
		if (normalized === "none") return "none";
		if (normalized === "required" || normalized === "any") return "required";
		return options?.unknownStringFallback ?? { name: normalized };
	}

	if (typeof choice === "object") {
		const value = choice as Record<string, any>;
		if (value.type === "allowed_tools") return normalizeAllowedToolsChoice(value);
		const typeName =
			typeof value.type === "string" && value.type !== "function" && value.type !== "tool"
				? value.type
				: undefined;
		// Responses names the tool at the top level; Chat nests it under `function`
		// or, for a custom tool, under `custom`.
		const functionName =
			typeof value.name === "string"
				? value.name
				: typeof value.function?.name === "string"
					? value.function.name
					: value.type === "custom" && typeof value.custom?.name === "string"
						? value.custom.name
						: undefined;
		if (
			(value.type === "function" || value.type === "tool" || value.type === "custom") &&
			functionName
		) {
			return { name: functionName };
		}
		// A hosted tool (web_search_preview, file_search, ...) is named by its type,
		// the name its decoded tool definition carries.
		if (typeName) {
			return { name: typeName };
		}
		if (functionName) {
			return { name: functionName };
		}
	}

	return undefined;
}

/**
 * `allowed_tools` limits the model to a subset of `tools` with `mode` auto or
 * required. OpenAI routes receive the original object (kept in the IR vendor
 * options); everywhere else it becomes that mode, or a forced call when
 * `required` allows exactly one tool, and only the allowed tools are sent (see
 * resolveAllowedTools). Chat nests the fields under `allowed_tools`; Responses
 * keeps them flat.
 * https://platform.openai.com/docs/api-reference/responses/create#responses_create-tool_choice
 */
function normalizeAllowedToolsChoice(value: Record<string, any>): IRChatRequest["toolChoice"] {
	const config = allowedToolsConfig(value);
	const mode = config.mode === "required" ? "required" : "auto";
	const tools: any[] = Array.isArray(config.tools) ? config.tools : [];
	if (mode === "required" && tools.length === 1) {
		const name = allowedToolEntryName(tools[0]);
		if (name) return { name };
	}
	return mode;
}

function allowedToolsConfig(value: Record<string, any>): Record<string, any> {
	return value.allowed_tools && typeof value.allowed_tools === "object" ? value.allowed_tools : value;
}

/** The name an `allowed_tools` entry gives: `name` (Responses), or nested under `function` or `custom` (Chat). */
function allowedToolEntryName(entry: any): string | undefined {
	if (!entry || typeof entry !== "object") return undefined;
	if (typeof entry.name === "string" && entry.name) return entry.name;
	if (typeof entry.function?.name === "string" && entry.function.name) return entry.function.name;
	if (typeof entry.custom?.name === "string" && entry.custom.name) return entry.custom.name;
	return undefined;
}

function allowedToolEntryMatches(entry: any, tool: IRTool): boolean {
	const name = allowedToolEntryName(entry);
	if (name) return tool.name === name;
	// A hosted tool (web_search_preview, file_search, mcp, ...) is named by its
	// type; an MCP entry also picks its server by label.
	if (!entry || typeof entry !== "object" || typeof entry.type !== "string") return false;
	if (tool.type !== entry.type && tool.name !== entry.type) return false;
	if (typeof entry.server_label === "string") return tool.raw?.server_label === entry.server_label;
	return true;
}

export type ResolvedAllowedTools = {
	/** Names of the defined tools the choice allows. */
	names: string[];
	/** Entries that match no defined tool, by name or type. */
	unmatched: string[];
};

/**
 * The defined tools an `allowed_tools` tool choice lets the model call, or
 * undefined when the choice does not list any (so nothing is restricted).
 * Providers other than OpenAI have no `allowed_tools`, so they are sent only
 * these tools.
 */
export function resolveAllowedTools(choice: unknown, tools: IRTool[] | undefined): ResolvedAllowedTools | undefined {
	if (!choice || typeof choice !== "object" || Array.isArray(choice)) return undefined;
	const value = choice as Record<string, any>;
	if (value.type !== "allowed_tools") return undefined;
	const entries = allowedToolsConfig(value).tools;
	if (!Array.isArray(entries) || entries.length === 0) return undefined;
	const names = new Set<string>();
	const unmatched: string[] = [];
	for (const entry of entries) {
		const matches = (tools ?? []).filter((tool) => allowedToolEntryMatches(entry, tool));
		if (matches.length === 0) {
			unmatched.push(allowedToolEntryName(entry) ?? (typeof entry?.type === "string" ? entry.type : "unnamed tool"));
		}
		for (const tool of matches) names.add(tool.name);
	}
	return { names: Array.from(names), unmatched };
}

/**
 * Providers sent the original `allowed_tools` object with every tool
 * definition (see the OpenAI Chat and Responses transforms); every other route
 * is sent only the allowed tools.
 */
export function forwardsOpenAIAllowedTools(providerId: string): boolean {
	return providerId === "openai" || providerId === "openai-eu";
}

export function resolveTextServiceTier(input: {
	service_tier?: unknown;
}): string | undefined {
	return normalizeTextServiceTier(input.service_tier);
}

function normalizeNonEmptyString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeBoolean(value: unknown): boolean | undefined {
	return typeof value === "boolean" ? value : undefined;
}

export function normalizeProviderGeoPreferences(
	rawRequest: any,
): IRGeoPreferences | undefined {
	const provider = rawRequest?.provider;
	if (!provider || typeof provider !== "object" || Array.isArray(provider)) {
		return undefined;
	}

	const requiredExecutionRegion = normalizeNonEmptyString(
		provider.required_execution_region ?? provider.requiredExecutionRegion,
	);
	const requiredDataRegion = normalizeNonEmptyString(
		provider.required_data_region ?? provider.requiredDataRegion,
	);
	const requireZeroDataRetention = normalizeBoolean(
		provider.require_zero_data_retention ?? provider.requireZeroDataRetention,
	);
	const inferenceGeo = normalizeNonEmptyString(
		provider.inference_geo ?? provider.inferenceGeo,
	);

	if (
		requiredExecutionRegion === undefined &&
		requiredDataRegion === undefined &&
		requireZeroDataRetention === undefined &&
		inferenceGeo === undefined
	) {
		return undefined;
	}

	return {
		requiredExecutionRegion,
		requiredDataRegion,
		requireZeroDataRetention,
		inferenceGeo,
	};
}

function pickFirstNonEmptyString(...values: unknown[]): string | undefined {
	for (const value of values) {
		const normalized = normalizeNonEmptyString(value);
		if (!normalized) continue;
		return normalized;
	}
	return undefined;
}

function normalizeCacheControl(value: unknown): (IRCacheControl & { scope?: string }) | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const next = { ...(value as Record<string, any>) } as IRCacheControl & { scope?: string };
	if (typeof next.type === "string") next.type = next.type.trim();
	if (typeof next.ttl === "string") next.ttl = next.ttl.trim();
	if (typeof next.scope === "string") next.scope = next.scope.trim();
	if (Object.keys(next).length === 0) return undefined;
	return next;
}

export function normalizeProviderCacheOptions(rawRequest: any): {
	promptCacheRetention?: string;
	anthropicCacheControl?: IRCacheControl & { scope?: string };
	googleCachedContent?: string;
	xaiConversationId?: string;
} {
	const providerOptions = rawRequest?.provider_options ?? rawRequest?.providerOptions ?? {};
	const openaiOptions = providerOptions?.openai ?? {};
	const anthropicOptions = providerOptions?.anthropic ?? {};
	const googleOptions = providerOptions?.google ?? {};
	const xaiOptions = providerOptions?.xai ?? providerOptions?.["x-ai"] ?? {};

	return {
		// The top-level field takes precedence over the provider_options alias (as documented).
		promptCacheRetention: pickFirstNonEmptyString(
			rawRequest?.prompt_cache_retention,
			openaiOptions?.prompt_cache_retention,
		),
		anthropicCacheControl: normalizeCacheControl(
			anthropicOptions?.cache_control ??
				anthropicOptions?.cacheControl ??
				rawRequest?.cache_control ??
				rawRequest?.cacheControl,
		),
		googleCachedContent: pickFirstNonEmptyString(
			googleOptions?.cached_content,
			googleOptions?.cachedContent,
		),
		xaiConversationId: pickFirstNonEmptyString(
			xaiOptions?.conversation_id,
			xaiOptions?.conversationId,
		),
	};
}

