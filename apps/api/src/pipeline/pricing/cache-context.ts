// Purpose: Normalize request cache controls into a stable pricing context.
// Why: Pricing rules should match cache settings consistently across providers.
// How: Extract provider-specific cache options and emit canonical context keys.

function pickFirstString(...values: unknown[]): string | undefined {
	for (const value of values) {
		if (typeof value !== "string") continue;
		const trimmed = value.trim();
		if (!trimmed) continue;
		return trimmed;
	}
	return undefined;
}

function isObject(value: unknown): value is Record<string, any> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeCacheTtl(value: string | undefined): string | undefined {
	if (!value) return undefined;
	return value.trim().toLowerCase();
}

export function deriveCachePricingContext(body: any): Record<string, any> {
	const providerOptions = body?.provider_options ?? body?.providerOptions;
	const hasOpenaiOptions = isObject(providerOptions?.openai);
	const openaiOptions = hasOpenaiOptions ? providerOptions.openai : {};
	const hasAnthropicOptions = isObject(providerOptions?.anthropic);
	const anthropicOptions = hasAnthropicOptions
		? providerOptions.anthropic
		: {};
	const hasGoogleOptions = isObject(providerOptions?.google);
	const googleOptions = hasGoogleOptions ? providerOptions.google : {};
	const hasXaiOptions = isObject(providerOptions?.xai) || isObject(providerOptions?.["x-ai"]);
	const xaiOptions = isObject(providerOptions?.xai)
		? providerOptions.xai
		: isObject(providerOptions?.["x-ai"])
			? providerOptions["x-ai"]
			: {};

	const topLevelCacheControl = isObject(body?.cache_control ?? body?.cacheControl)
		? (body?.cache_control ?? body?.cacheControl)
		: undefined;
	const explicitPromptCacheRetention = pickFirstString(
		body?.prompt_cache_retention,
		body?.promptCacheRetention,
		openaiOptions?.prompt_cache_retention,
		openaiOptions?.promptCacheRetention,
	);
	const promptCacheRetention =
		explicitPromptCacheRetention ??
		pickFirstString(topLevelCacheControl?.ttl);
	const anthropicCacheControl = isObject(
		anthropicOptions?.cache_control ?? anthropicOptions?.cacheControl,
	)
		? (anthropicOptions?.cache_control ?? anthropicOptions?.cacheControl)
		: topLevelCacheControl;
	const googleCacheControl = isObject(
		googleOptions?.cache_control ?? googleOptions?.cacheControl,
	)
		? (googleOptions?.cache_control ?? googleOptions?.cacheControl)
		: topLevelCacheControl;
	const googleCachedContent = pickFirstString(
		googleOptions?.cached_content,
		googleOptions?.cachedContent,
		body?.cached_content,
		body?.cachedContent,
	);
	const googleCacheTtl = pickFirstString(
		googleOptions?.cache_ttl,
		googleOptions?.cacheTtl,
		googleCacheControl?.ttl,
	);
	const xaiConversationId = pickFirstString(
		xaiOptions?.conversation_id,
		xaiOptions?.conversationId,
		body?.conversation_id,
		body?.conversationId,
	);

	const cacheTtl = normalizeCacheTtl(
		pickFirstString(
			promptCacheRetention,
			anthropicCacheControl?.ttl,
			googleCacheTtl,
		),
	);

	const out: Record<string, any> = {};
	if (promptCacheRetention) out.prompt_cache_retention = promptCacheRetention;
	if (anthropicCacheControl) out.anthropic_cache_control = anthropicCacheControl;
	if (googleCachedContent) out.google_cached_content = googleCachedContent;
	if (googleCacheControl) out.google_cache_control = googleCacheControl;
	if (googleCacheTtl) out.google_cache_ttl = normalizeCacheTtl(googleCacheTtl);
	if (xaiConversationId) out.xai_conversation_id = xaiConversationId;
	if (cacheTtl) out.cache_ttl = cacheTtl;

	const cacheProvider = (() => {
		if (xaiConversationId || hasXaiOptions) return "xai";
		if (googleCachedContent || googleCacheTtl || hasGoogleOptions) return "google";
		if (hasAnthropicOptions) return "anthropic";
		if (explicitPromptCacheRetention || hasOpenaiOptions) return "openai";
		return undefined;
	})();
	if (cacheProvider) out.cache_provider = cacheProvider;
	if (Object.keys(out).length > 0) {
		out.cache_requested = true;
	}

	return out;
}



