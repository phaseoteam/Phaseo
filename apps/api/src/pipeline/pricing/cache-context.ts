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

function partHasCacheMark(part: unknown): boolean {
	return isObject(part) && (isObject(part.cache_control) || isObject(part.cacheControl) || isObject(part.prompt_cache_breakpoint));
}

function contentHasCacheMark(content: unknown): boolean {
	return Array.isArray(content) && content.some(partHasCacheMark);
}

/**
 * Whether the request marks cache breakpoints on content blocks, system blocks or tools
 * (Anthropic-style `cache_control`, OpenAI-style `prompt_cache_breakpoint`). Providers
 * that bill implicit and explicit cache hits at different rates (Alibaba Model Studio)
 * serve an explicit hit only for such a request.
 */
function requestHasCacheMarks(body: any): boolean {
	if (!isObject(body)) return false;
	if (contentHasCacheMark(body.system) || contentHasCacheMark(body.tools)) return true;
	for (const message of Array.isArray(body.messages) ? body.messages : []) {
		if (partHasCacheMark(message) || contentHasCacheMark(message?.content)) return true;
	}
	for (const item of Array.isArray(body.input) ? body.input : []) {
		if (partHasCacheMark(item) || contentHasCacheMark(item?.content)) return true;
	}
	return false;
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

	// Request-level lifetime in prompt_cache_options (Moonshot and DeepInfra: "5m" or "1h").
	// Kept apart from cache_ttl: the engine uses it only for undivided writes on a card with
	// 1-hour write rows, which is where the lifetime is sent (see execute/cacheTtl.ts).
	const promptCacheOptions = isObject(body?.prompt_cache_options)
		? body.prompt_cache_options
		: isObject(openaiOptions?.prompt_cache_options) ? openaiOptions.prompt_cache_options : undefined;
	const promptCacheOptionsTtl = normalizeCacheTtl(pickFirstString(promptCacheOptions?.ttl));

	const out: Record<string, any> = {};
	if (promptCacheRetention) out.prompt_cache_retention = promptCacheRetention;
	if (promptCacheOptionsTtl) out.prompt_cache_options_ttl = promptCacheOptionsTtl;
	if (anthropicCacheControl) out.anthropic_cache_control = anthropicCacheControl;
	if (googleCachedContent) out.google_cached_content = googleCachedContent;
	if (googleCacheControl) out.google_cache_control = googleCacheControl;
	if (googleCacheTtl) out.google_cache_ttl = normalizeCacheTtl(googleCacheTtl);
	if (xaiConversationId) out.xai_conversation_id = xaiConversationId;
	if (cacheTtl) out.cache_ttl = cacheTtl;
	if (requestHasCacheMarks(body)) out.cache_marks = true;

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



