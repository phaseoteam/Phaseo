// Purpose: Routing cost for default (balanced) text routing.
// Why: Ranking by list price alone sends traffic to slow or failing providers and lets a
// provider win with a cheap input price while charging more for cached or output tokens.
// How: Each candidate's cost per successful answer is (effective price + priced waiting)
// divided by its chance of success. Providers near the cheapest cost share most traffic;
// beyond that band their share falls off quickly, but never to zero.

import { resolveCacheTokenUsage } from "@core/cache-usage";
import type { ProviderHealth } from "./health";

/** Token mix used before a model has measured traffic. */
export const DEFAULT_PROMPT_TOKENS = 4_000;
export const DEFAULT_OUTPUT_TOKENS = 500;
/** Waiting is priced so that, for the pool's median provider, it costs as much as the tokens. */
const WAIT_VALUE_SHARE = 1;
/** Time to first token counts again on top of total time: agent loops wait on it every step. */
const TTFT_EXTRA_WEIGHT = 1;
/** Provider-caused failures cost this many times their share on top of the retry they force. */
const PROVIDER_ERROR_PENALTY = 7;
/** A 429 costs a wasted try (already in the success rate) plus this many median tries. */
const RATE_LIMIT_PENALTY = 1.5;
/** Providers within this fraction of the cheapest cost split most of the traffic. */
const COMPETITIVE_EDGE = 0.3;
/** Every routable provider keeps a trickle of traffic so recovery and speed-ups are seen. */
export const MIN_SHARE_WEIGHT = 0.01;
const MIN_SUCCESS_PROBABILITY = 0.05;

export type RoutingCostPrices = {
    /** USD per uncached prompt token; null when the route has no comparable input price. */
    input: number | null;
    /** USD per cache-read token; null bills cache reads at the input price. */
    cachedRead: number | null;
    /** USD per output token; null when the route has no output price. */
    output: number | null;
};

export type RoutingCostEntry = {
    key: string;
    prices: RoutingCostPrices;
    health: ProviderHealth;
    /** Error rate already scaled by the confidence the evidence deserves. */
    errorRate: number;
    /** Share of recent attempts rejected with a rate limit, confidence-scaled. */
    rateLimitedShare: number;
};

export type RoutingCostBreakdown = {
    promptTokens: number;
    outputTokens: number;
    cacheHitRate: number;
    /** Effective USD price of one try; null when the route cannot be priced against its pool. */
    effectivePrice: number | null;
    ttftMs: number;
    throughputTps: number;
    waitSeconds: number;
    waitCost: number;
    successProbability: number;
    providerErrorRate: number;
    rateLimitedShare: number;
    /** Expected cost per successful answer, in the pool's cost unit. */
    routingCost: number | null;
    /** Relative traffic weight in (0, 1]; 1 for the cheapest routing cost. */
    shareWeight: number;
};

function finitePositive(value: number | undefined | null): value is number {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function median(values: number[]): number | null {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function tokenWeight(h: ProviderHealth): number {
    return finitePositive(h.tok_weight) ? h.tok_weight : 0;
}

/** The model's typical request: traffic-weighted across its providers, else a default. */
export function modelTokenMix(healths: ProviderHealth[]): { promptTokens: number; outputTokens: number } {
    let weight = 0;
    let prompt = 0;
    let output = 0;
    for (const h of healths) {
        const w = tokenWeight(h);
        if (!w) continue;
        weight += w;
        prompt += w * Math.max(0, h.prompt_tok_ewma ?? 0);
        output += w * Math.max(0, h.out_tok_ewma ?? 0);
    }
    if (weight <= 0 || prompt <= 0) {
        return { promptTokens: DEFAULT_PROMPT_TOKENS, outputTokens: DEFAULT_OUTPUT_TOKENS };
    }
    return { promptTokens: prompt / weight, outputTokens: output / weight };
}

function cacheHitRate(h: ProviderHealth): number | null {
    if (!tokenWeight(h) || !finitePositive(h.prompt_tok_ewma)) return null;
    return Math.max(0, Math.min(1, (h.cached_tok_ewma ?? 0) / h.prompt_tok_ewma));
}

/** Cost per successful answer for each candidate, and the traffic weight that follows. */
export function computeRoutingCosts(entries: RoutingCostEntry[]): Map<string, RoutingCostBreakdown> {
    const out = new Map<string, RoutingCostBreakdown>();
    if (!entries.length) return out;

    const { promptTokens, outputTokens } = modelTokenMix(entries.map((entry) => entry.health));
    // Unmeasured providers start from the pool's typical cache-hit rate rather than a guess.
    const measuredHits = entries.map((entry) => cacheHitRate(entry.health));
    let hitWeight = 0;
    let hitSum = 0;
    entries.forEach((entry, index) => {
        const hit = measuredHits[index];
        if (hit === null) return;
        hitWeight += tokenWeight(entry.health);
        hitSum += tokenWeight(entry.health) * hit;
    });
    const poolHitRate = hitWeight > 0 ? hitSum / hitWeight : 0;

    const anyOutputPrice = entries.some((entry) => entry.prices.output !== null);
    const knownTps = entries.map((entry) => entry.health.tp_ewma_60s).filter(finitePositive);
    const typicalTps = median(knownTps);

    const rows = entries.map((entry, index) => {
        const h = entry.health;
        const hit = measuredHits[index] ?? poolHitRate;
        const { input, cachedRead, output } = entry.prices;
        // A route missing a meter its peers charge for cannot be compared on price.
        const priced = input !== null && (output !== null || !anyOutputPrice);
        const effectivePrice = priced
            ? promptTokens * (1 - hit) * input! +
                promptTokens * hit * (cachedRead ?? input!) +
                outputTokens * (output ?? 0)
            : null;
        const ttftMs = Math.max(0, Number.isFinite(h.lat_ewma_60s) ? h.lat_ewma_60s : 0);
        const throughputTps = finitePositive(h.tp_ewma_60s) ? h.tp_ewma_60s : typicalTps ?? 0;
        // Measured throughput spans the whole response, first token included.
        const totalSeconds = throughputTps > 0 ? outputTokens / throughputTps : ttftMs / 1000;
        const waitSeconds = totalSeconds + TTFT_EXTRA_WEIGHT * (ttftMs / 1000);
        const successProbability = Math.max(MIN_SUCCESS_PROBABILITY, Math.min(1, 1 - entry.errorRate));
        const rateLimitedShare = Math.max(0, Math.min(1, entry.rateLimitedShare));
        const providerErrorRate = Math.max(0, Math.min(1, entry.errorRate - rateLimitedShare));
        return { entry, hit, effectivePrice, ttftMs, throughputTps, waitSeconds, successProbability, rateLimitedShare, providerErrorRate };
    });

    // One second of waiting is worth the pool's typical price per typical wait.
    const typicalPrice = median(rows.map((row) => row.effectivePrice).filter((value): value is number => value !== null));
    const typicalWait = median(rows.map((row) => row.waitSeconds));
    // Unpriced or free pools are ranked on waiting alone.
    const valueOfSecond = typicalPrice !== null && typicalPrice > 0 && typicalWait !== null && typicalWait > 0
        ? (WAIT_VALUE_SHARE * typicalPrice) / typicalWait
        : 1;
    const anyPriced = typicalPrice !== null;

    const tryCosts = rows.map((row) => {
        if (anyPriced && row.effectivePrice === null) return null;
        return (row.effectivePrice ?? 0) + valueOfSecond * row.waitSeconds;
    });
    const typicalTry = median(tryCosts.filter((value): value is number => value !== null)) ?? 0;
    const costs = rows.map((row, index) => {
        const tryCost = tryCosts[index];
        if (tryCost === null) return null;
        return (tryCost / row.successProbability) * (1 + PROVIDER_ERROR_PENALTY * row.providerErrorRate) +
            RATE_LIMIT_PENALTY * row.rateLimitedShare * typicalTry;
    });
    const finiteCosts = costs.filter((value): value is number => value !== null);
    const positiveCosts = finiteCosts.filter((value) => value > 0);
    // Free, instant answers would divide by zero; treat them as a tenth of the cheapest paid one.
    const costFloor = positiveCosts.length ? Math.min(...positiveCosts) / 10 : 1;
    const minCost = finiteCosts.length ? Math.max(costFloor, Math.min(...finiteCosts)) : null;

    rows.forEach((row, index) => {
        const cost = costs[index];
        let shareWeight = MIN_SHARE_WEIGHT;
        if (cost !== null && minCost !== null) {
            const excess = Math.max(costFloor, cost) / minCost - 1;
            shareWeight = Math.max(MIN_SHARE_WEIGHT, Math.exp(-((excess / COMPETITIVE_EDGE) ** 2)));
        }
        out.set(row.entry.key, {
            promptTokens,
            outputTokens,
            cacheHitRate: row.hit,
            effectivePrice: row.effectivePrice,
            ttftMs: row.ttftMs,
            throughputTps: row.throughputTps,
            waitSeconds: row.waitSeconds,
            waitCost: valueOfSecond * row.waitSeconds,
            successProbability: row.successProbability,
            providerErrorRate: row.providerErrorRate,
            rateLimitedShare: row.rateLimitedShare,
            routingCost: cost,
            shareWeight,
        });
    });
    return out;
}

/** Prompt size with cache reads and writes included, and the cache-read part, from any usage shape. */
export function promptTokensFromUsage(usage: any): { prompt_tokens?: number; cached_prompt_tokens?: number } {
    if (!usage || typeof usage !== "object") return {};
    const input = Number(usage.inputTokens ?? usage.input_tokens ?? usage.prompt_tokens ?? usage.input_text_tokens);
    if (!Number.isFinite(input) || input < 0) return {};
    const cache = resolveCacheTokenUsage(usage, input);
    const read = Math.max(0, cache.readTokens ?? 0);
    const write = Math.max(0, cache.writeTokens ?? 0);
    return {
        prompt_tokens: input + (cache.readSubset ? 0 : read) + (cache.writeSubset ? 0 : write),
        cached_prompt_tokens: read,
    };
}

export type RoutingAlgorithm = "provider-score-v8" | "routing-cost-v9";
const SWITCHBACK_BLOCK_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Which algorithm ranks default text traffic. `switchback` alternates the two in 3-hour
 * UTC blocks, swapping each block's algorithm day to day so every time of day sees both.
 * The block is a pure function of time, so a comparison needs only request timestamps.
 */
export function resolveRoutingAlgorithm(setting: string | null | undefined, nowMs = Date.now()): RoutingAlgorithm {
    const value = String(setting ?? "").trim().toLowerCase();
    if (value === "v8" || value === "provider-score-v8") return "provider-score-v8";
    if (value === "switchback") {
        const block = Math.floor(nowMs / SWITCHBACK_BLOCK_MS);
        const day = Math.floor(nowMs / DAY_MS);
        return (block + day) % 2 === 0 ? "routing-cost-v9" : "provider-score-v8";
    }
    return "routing-cost-v9";
}
