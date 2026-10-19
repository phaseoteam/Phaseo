// Purpose: How reported usage maps onto price-card meters for a few provider semantics.
// Why: Keeps provider- and usage-shape rules the engine applies (cache hit type, prompt length,
//      thinking-mode output, native server-tool prices) documented in one place and out of the
//      rule-selection code.
// How: Pure helpers called from engine.ts while splitting usage into meters and building jobs.

import type { PriceCard, PriceRule, PricingDimensionKey } from "./types";

/**
 * Whether a reported cache hit came from an explicit cache: the request carried cache marks
 * (block `cache_control`, a top-level `cache_control`, or Anthropic provider options), or
 * the response reported cache creation, which only explicit caching bills. Alibaba Model
 * Studio documents implicit and explicit caching as mutually exclusive, told apart only by
 * whether the request used `cache_control`, and reports both hits as
 * `prompt_tokens_details.cached_tokens`
 * (https://www.alibabacloud.com/help/en/model-studio/context-cache).
 */
export function cacheHitIsExplicit(requestOptions: Record<string, any> | undefined, writeTokens: Array<number | undefined>): boolean {
    if (requestOptions?.cache_marks === true || requestOptions?.anthropic_cache_control) return true;
    return writeTokens.some((value) => typeof value === "number" && value > 0);
}

/**
 * Cache counts the usage explicitly reports on top of its input count: a `false` subset
 * hint (set by the usage normalisers from the provider's semantics), or Anthropic's
 * top-level cache_read_input_tokens / cache_creation_input_tokens without a hint.
 */
export function cacheCountsReportedOutsideInput(
    usageRaw: any,
    cache: { readSubset: boolean; writeSubset: boolean },
): { read: boolean; write: boolean } {
    if (!usageRaw || typeof usageRaw !== "object") return { read: false, write: false };
    const readHint = usageRaw.cached_read_tokens_are_subset_of_input ?? usageRaw.cachedReadTokensAreSubsetOfInput;
    const writeHint = usageRaw.cached_write_tokens_are_subset_of_input ?? usageRaw.cachedWriteTokensAreSubsetOfInput;
    return {
        read: !cache.readSubset && (typeof readHint === "boolean" || typeof usageRaw.cache_read_input_tokens === "number"),
        write: !cache.writeSubset && (typeof writeHint === "boolean" || typeof usageRaw.cache_creation_input_tokens === "number"),
    };
}

/**
 * Alibaba Model Studio prices hybrid-thinking models with an output column headed
 * "Thinking mode (chain of thought + answer)": when the model thought, the visible answer
 * is billed at the thinking price too (https://www.alibabacloud.com/help/en/model-studio/model-pricing).
 * Catalogue cards carry that price as the output_reasoning_tokens rule.
 */
export function thinkingModeBillsAnswer(card: PriceCard, meters: Record<string, number>): boolean {
    const provider = String(card.provider ?? "").toLowerCase();
    if (!provider.startsWith("alibaba")) return false;
    if (!((meters.output_reasoning_tokens ?? 0) > 0)) return false;
    return card.rules.some((rule) => rule.meter === "output_reasoning_tokens");
}

/**
 * Place one reported cache hit on a card that prices implicit hits. A card that prices implicit
 * and explicit hits separately gets the hit on the meter for the cache that served it, never on
 * both; a card with only an implicit price bills every hit there.
 */
export function assignImplicitCacheRead(
    meters: Record<string, number>,
    card: PriceCard,
    readTokens: number,
    explicitHit: boolean,
): void {
    const pricesExplicitReads = card.rules.some((rule) => rule.meter === "cached_read_text_tokens");
    if (pricesExplicitReads && explicitHit) return;
    meters.implicit_cached_input_text_tokens = readTokens;
    if (pricesExplicitReads) delete meters.cached_read_text_tokens;
}

/** Documented per-call prices for provider-native server tools when a card has no row for them. */
export function nativeToolFallbackRule(card: PriceCard, meter: PricingDimensionKey): PriceRule | null {
    const provider = String(card.provider ?? "").toLowerCase();
    if (meter === "native_web_search_requests" && (provider === "openai" || provider === "anthropic")) {
        return {
            pricing_plan: "standard",
            meter,
            unit: "request",
            unit_size: 1,
            price_per_unit: "0.01",
            currency: "USD",
            match: [],
            priority: -1000,
            id: `${provider}_native_web_search_default`,
        };
    }
    if (meter === "native_web_fetch_requests" && provider === "anthropic") {
        return {
            pricing_plan: "standard",
            meter,
            unit: "request",
            unit_size: 1,
            price_per_unit: "0",
            currency: "USD",
            match: [],
            priority: -1000,
            id: "anthropic_native_web_fetch_default",
        };
    }
    return null;
}
