// Purpose: Shared text-protocol normalizers for IR translation.
// Why: Avoid drift across chat/responses decoders for common field mappings.
// How: Centralizes conversion of request surface fields to IR-compatible values.

import type {
	IRCacheControl,
	IRChatRequest,
	IRGeoPreferences,
	IRReasoning,
} from "@core/ir";

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
		const typeName =
			typeof value.type === "string" && value.type !== "function" && value.type !== "tool"
				? value.type
				: undefined;
		const functionName =
			typeof value.name === "string"
				? value.name
				: typeof value.function?.name === "string"
					? value.function.name
					: undefined;
		if (
			(value.type === "function" || value.type === "tool") &&
			functionName
		) {
			return { name: functionName };
		}
		if (typeName) {
			return { name: typeName };
		}
		if (functionName) {
			return { name: functionName };
		}
	}

	return undefined;
}

export function resolveServiceTierFromSpeedAndTier(input: {
	speed?: unknown;
	service_tier?: unknown;
}): string | undefined {
	const speed = typeof input.speed === "string" ? input.speed.toLowerCase() : undefined;
	if (speed === "fast") return "priority";
	if (typeof input.service_tier === "string" && input.service_tier.length > 0) {
		return input.service_tier;
	}
	return undefined;
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
	const providerOptions = rawRequest?.provider_options;
	const openaiOptions = providerOptions?.openai ?? {};
	const anthropicOptions = providerOptions?.anthropic ?? {};
	const googleOptions = providerOptions?.google ?? {};
	const xaiOptions = providerOptions?.xai ?? providerOptions?.["x-ai"] ?? {};

	return {
		promptCacheRetention: pickFirstNonEmptyString(
			openaiOptions?.prompt_cache_retention,
		),
		anthropicCacheControl: normalizeCacheControl(
			anthropicOptions?.cache_control,
		),
		googleCachedContent: pickFirstNonEmptyString(
			googleOptions?.cached_content,
		),
		xaiConversationId: pickFirstNonEmptyString(
			xaiOptions?.conversation_id,
			xaiOptions?.conversationId,
		),
	};
}








