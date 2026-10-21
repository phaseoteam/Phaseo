// Purpose: Normalize provider text usage payloads for pricing.
// Why: Providers return different token key names; pricing expects stable meters.
// How: Coerces common usage field variants into canonical meter keys.

import {
	pickFirstFiniteNumber,
	resolveCanonicalTokenUsage,
	resolveRequestCountUsage,
} from "@core/usage-normalization";
import { CACHED_WRITE_TOKEN_PATHS, resolveCacheTokenUsage, uncachedInputTokens } from "@core/cache-usage";

type TextUsageNormalizationOptions = {
	// When true, cached-read tokens are treated as a subset of input tokens.
	// Pricing then uses uncached input meter + cached-read meter (no double count).
	cachedReadTokensAreSubsetOfInput?: boolean;
	// When true, cache-write tokens are already counted inside input tokens (OpenAI,
	// Kimi, Alibaba). Anthropic reports writes on top of input, so it passes false.
	cachedWriteTokensAreSubsetOfInput?: boolean;
};

function withOptionHints(usageRaw: any, options?: TextUsageNormalizationOptions): any {
	if (typeof options?.cachedReadTokensAreSubsetOfInput !== "boolean" &&
		typeof options?.cachedWriteTokensAreSubsetOfInput !== "boolean") {
		return usageRaw;
	}
	return {
		...usageRaw,
		...(typeof options.cachedReadTokensAreSubsetOfInput === "boolean"
			? { cached_read_tokens_are_subset_of_input: options.cachedReadTokensAreSubsetOfInput }
			: {}),
		...(typeof options.cachedWriteTokensAreSubsetOfInput === "boolean"
			? { cached_write_tokens_are_subset_of_input: options.cachedWriteTokensAreSubsetOfInput }
			: {}),
	};
}

function pickNumber(source: any, path: string): number | undefined {
	if (!source || typeof source !== "object") return undefined;
	const parts = path.split(".");
	let current: any = source;
	for (const part of parts) {
		if (current == null || typeof current !== "object") return undefined;
		current = current[part];
	}
	return typeof current === "number" ? current : undefined;
}

function pickFirstNumber(source: any, paths: string[]): number | undefined {
	return pickFirstFiniteNumber(source, paths);
}

export function normalizeTextUsageForPricing(
	usageRaw: any,
	options?: TextUsageNormalizationOptions,
): Record<string, any> | undefined {
	if (!usageRaw || typeof usageRaw !== "object") return undefined;

	const tokenUsage = resolveCanonicalTokenUsage(usageRaw);

	const usageForCache = withOptionHints(usageRaw, options);
	const cache = resolveCacheTokenUsage(usageForCache, tokenUsage.inputTokens);
	const cachedReadTokens = cache.readTokens;
	const cachedWrite5mTokens = cache.write5mTokens;
	const cachedWrite1hTokens = cache.write1hTokens;
	const cachedWriteTokens = pickFirstNumber(usageRaw, [...CACHED_WRITE_TOKEN_PATHS]);
	const reasoningTokens = pickFirstNumber(usageRaw, [
		"reasoning_tokens",
		"reasoningTokens",
		"thoughtsTokenCount",
		"thoughtTokenCount",
		"output_tokens_details.reasoning_tokens",
		"completion_tokens_details.reasoning_tokens",
	]);

	const inputImageTokens = pickFirstNumber(usageRaw, [
		"input_image_tokens",
		"_ext.inputImageTokens",
		"input_tokens_details.input_images",
	]);
	const inputAudioTokens = pickFirstNumber(usageRaw, [
		"input_audio_tokens",
		"_ext.inputAudioTokens",
		"input_tokens_details.input_audio",
	]);
	const inputVideoTokens = pickFirstNumber(usageRaw, [
		"input_video_tokens",
		"_ext.inputVideoTokens",
		"input_tokens_details.input_videos",
	]);
	const outputImageTokens = pickFirstNumber(usageRaw, [
		"output_image_tokens",
		"_ext.outputImageTokens",
		"output_tokens_details.output_images",
	]);
	const outputAudioTokens = pickFirstNumber(usageRaw, [
		"output_audio_tokens",
		"_ext.outputAudioTokens",
		"output_tokens_details.output_audio",
	]);
	const outputVideoTokens = pickFirstNumber(usageRaw, [
		"output_video_tokens",
		"_ext.outputVideoTokens",
		"output_tokens_details.output_videos",
	]);
	const requests = resolveRequestCountUsage(usageRaw);
	const nativeWebSearchRequests = pickFirstNumber(usageRaw, [
		"native_web_search_requests",
		"native_web_searches",
		"server_tool_use.web_search_requests",
		"serverToolUse.web_search_requests",
		"_ext.serverToolUse.web_search_requests",
		"num_search_queries",
		"_ext.numSearchQueries",
	]);
	const meters: Record<string, number> = {
		input_tokens: tokenUsage.inputTokens,
		input_text_tokens: Math.round(uncachedInputTokens(tokenUsage.inputTokens, cache)),
		output_tokens: tokenUsage.outputTokens,
		output_text_tokens: tokenUsage.outputTokens,
		total_tokens: tokenUsage.totalTokens,
	};

	if (typeof cachedReadTokens === "number") meters.cached_read_text_tokens = cachedReadTokens;
	if (typeof cachedWriteTokens === "number") meters.cached_write_text_tokens = cachedWriteTokens;
	if (typeof cachedWrite5mTokens === "number") meters.cached_write_text_tokens_5m = cachedWrite5mTokens;
	if (typeof cachedWrite1hTokens === "number") meters.cached_write_text_tokens_1h = cachedWrite1hTokens;
	if (
		typeof cachedWriteTokens !== "number" &&
		(typeof cachedWrite5mTokens === "number" || typeof cachedWrite1hTokens === "number")
	) {
		meters.cached_write_text_tokens = (cachedWrite5mTokens ?? 0) + (cachedWrite1hTokens ?? 0);
	}
	// OpenAI 30-minute / 12-hour split. The aggregate above stays the write total.
	if (typeof cache.write30mTokens === "number") meters.cached_write_text_tokens_30m = cache.write30mTokens;
	if (typeof cache.write12hTokens === "number") meters.cached_write_text_tokens_12h = cache.write12hTokens;
	if (
		typeof meters.cached_write_text_tokens !== "number" &&
		(typeof cache.write30mTokens === "number" || typeof cache.write12hTokens === "number")
	) {
		meters.cached_write_text_tokens = (cache.write30mTokens ?? 0) + (cache.write12hTokens ?? 0);
	}
	if (typeof reasoningTokens === "number") meters.reasoning_tokens = reasoningTokens;
	if (typeof inputImageTokens === "number") meters.input_image_tokens = inputImageTokens;
	if (typeof inputAudioTokens === "number") meters.input_audio_tokens = inputAudioTokens;
	if (typeof inputVideoTokens === "number") meters.input_video_tokens = inputVideoTokens;
	if (typeof outputImageTokens === "number") meters.output_image_tokens = outputImageTokens;
	if (typeof outputAudioTokens === "number") meters.output_audio_tokens = outputAudioTokens;
	if (typeof outputVideoTokens === "number") meters.output_video_tokens = outputVideoTokens;
	if (typeof requests === "number") meters.requests = requests;
	if (typeof nativeWebSearchRequests === "number") meters.native_web_search_requests = nativeWebSearchRequests;
	// State both semantics explicitly: later stages merge this with protocol-encoded usage
	// and must not re-infer them from field names.
	if (typeof cachedReadTokens === "number") {
		(meters as Record<string, any>).cached_read_tokens_are_subset_of_input = cache.readSubset;
	}
	if (typeof meters.cached_write_text_tokens === "number") {
		(meters as Record<string, any>).cached_write_tokens_are_subset_of_input = cache.writeSubset;
	}
	const observedServiceTier =
		typeof usageRaw.service_tier === "string"
			? usageRaw.service_tier
			: typeof usageRaw.serviceTier === "string"
				? usageRaw.serviceTier
				: undefined;
	if (observedServiceTier) {
		meters.service_tier = observedServiceTier;
		meters.serviceTier = observedServiceTier;
	}

	return meters;
}
