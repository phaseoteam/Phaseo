// Purpose: Shared text-protocol normalizers for IR translation.
// Why: Avoid drift across chat/responses decoders for common field mappings.
// How: Centralizes conversion of request surface fields to IR-compatible values.

import type { IRChatRequest, IRReasoning } from "@core/ir";

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
			return "";
		})
		.filter((value): value is "text" | "image" => value === "text" || value === "image");

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
		if (choice === "auto") return "auto";
		if (choice === "none") return "none";
		if (choice === "required" || choice === "any") return "required";
		return options?.unknownStringFallback;
	}

	if (typeof choice === "object") {
		const value = choice as Record<string, any>;
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
