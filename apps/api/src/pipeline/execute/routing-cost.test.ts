import { describe, expect, it } from "vitest";
import type { ProviderHealth } from "./health";
import { ageHealth, TOKEN_MIX_TAU_MS } from "./health-evidence";
import {
    computeRoutingCosts,
    DEFAULT_OUTPUT_TOKENS,
    DEFAULT_PROMPT_TOKENS,
    MIN_SHARE_WEIGHT,
    modelTokenMix,
    resolveRoutingAlgorithm,
    type RoutingCostEntry,
} from "./routing-cost";

const PER_M = 1 / 1_000_000;

function health(overrides: Partial<ProviderHealth> = {}): ProviderHealth {
    return {
        endpoint: "chat.completions", provider: "p", model: "m",
        lat_ewma_10s: 800, lat_ewma_60s: 800, lat_ewma_300s: 800,
        err_ewma_10s: 0, err_ewma_60s: 0, err_ewma_300s: 0,
        rate_10s: 0, rate_60s: 0, tp_ewma_60s: 100,
        rec_ok_ew_60s: 0, rec_tot_ew_60s: 0,
        inflight: 0, current_load: 0,
        breaker: "closed", breaker_until_ms: 0, breaker_attempts: 0,
        last_ts_10s: 0, last_ts_60s: 0, last_ts_300s: 0, last_updated: 0,
        ...overrides,
    };
}

function entry(key: string, args: {
    input?: number | null; cachedRead?: number | null; output?: number | null;
    health?: Partial<ProviderHealth>; errorRate?: number; rateLimitedShare?: number;
} = {}): RoutingCostEntry {
    return {
        key,
        prices: {
            input: args.input === undefined ? 1 * PER_M : args.input,
            cachedRead: args.cachedRead ?? null,
            output: args.output === undefined ? 4 * PER_M : args.output,
        },
        health: health(args.health),
        errorRate: args.errorRate ?? 0,
        rateLimitedShare: args.rateLimitedShare ?? 0,
    };
}

describe("computeRoutingCosts", () => {
    it("prices the model's measured token mix, so a cheap input price cannot hide expensive output", () => {
        // Output-heavy traffic: 1,000 prompt tokens produce 4,000 output tokens.
        const mix = { prompt_tok_ewma: 1_000, out_tok_ewma: 4_000, tok_weight: 5 };
        const costs = computeRoutingCosts([
            entry("cheap-input", { input: 0.5 * PER_M, output: 10 * PER_M, health: mix }),
            entry("honest", { input: 1 * PER_M, output: 4 * PER_M, health: mix }),
        ]);
        expect(costs.get("cheap-input")!.effectivePrice!).toBeCloseTo(0.0405, 6);
        expect(costs.get("honest")!.effectivePrice!).toBeCloseTo(0.017, 6);
        expect(costs.get("honest")!.shareWeight).toBe(1);
        expect(costs.get("cheap-input")!.shareWeight).toBeLessThan(0.1);
    });

    it("bills cache reads at each provider's measured hit rate, not its advertised cache price", () => {
        const costs = computeRoutingCosts([
            // Advertises a very cheap cache read but never hits it.
            entry("no-hits", { input: 2 * PER_M, cachedRead: 0.1 * PER_M, output: 8 * PER_M,
                health: { prompt_tok_ewma: 100_000, cached_tok_ewma: 0, out_tok_ewma: 4_000, tok_weight: 10 } }),
            // Charges more for cache reads but serves 60% of prompts from cache.
            entry("hits", { input: 2 * PER_M, cachedRead: 0.5 * PER_M, output: 8 * PER_M,
                health: { prompt_tok_ewma: 100_000, cached_tok_ewma: 60_000, out_tok_ewma: 4_000, tok_weight: 10 } }),
        ]);
        expect(costs.get("hits")!.cacheHitRate).toBeCloseTo(0.6);
        // 40K uncached at $2/M + 60K cached at $0.50/M + 4K output at $8/M.
        expect(costs.get("hits")!.effectivePrice!).toBeCloseTo(0.142, 6);
        expect(costs.get("no-hits")!.effectivePrice!).toBeCloseTo(0.232, 6);
        expect(costs.get("hits")!.shareWeight).toBeGreaterThan(costs.get("no-hits")!.shareWeight);
    });

    it("lets a faster provider charge more and still win", () => {
        const costs = computeRoutingCosts([
            entry("cheap-slow", { input: 1 * PER_M, output: 4 * PER_M, health: { lat_ewma_60s: 3_000, tp_ewma_60s: 20 } }),
            entry("pricier-fast", { input: 1.2 * PER_M, output: 4.8 * PER_M, health: { lat_ewma_60s: 400, tp_ewma_60s: 150 } }),
        ]);
        expect(costs.get("pricier-fast")!.routingCost!).toBeLessThan(costs.get("cheap-slow")!.routingCost!);
        expect(costs.get("pricier-fast")!.shareWeight).toBe(1);
        expect(costs.get("cheap-slow")!.shareWeight).toBeLessThan(0.2);
    });

    it("charges provider errors about eight times their rate and rate limits far less", () => {
        const base = computeRoutingCosts([entry("a"), entry("b")]).get("a")!.routingCost!;
        const failing = computeRoutingCosts([entry("a", { errorRate: 0.01 }), entry("b")]).get("a")!.routingCost!;
        const limited = computeRoutingCosts([entry("a", { errorRate: 0.01, rateLimitedShare: 0.01 }), entry("b")]).get("a")!.routingCost!;
        expect(failing / base).toBeCloseTo(1.08, 2);
        expect(limited / base).toBeGreaterThan(1.02);
        expect(limited / base).toBeLessThan(failing / base);
    });

    it("splits traffic between near-equal providers and keeps a trickle for the rest", () => {
        const costs = computeRoutingCosts([
            entry("best"),
            entry("close", { input: 1.03 * PER_M, output: 4.12 * PER_M }),
            entry("double", { input: 2 * PER_M, output: 8 * PER_M }),
        ]);
        expect(costs.get("close")!.shareWeight).toBeGreaterThan(0.95);
        expect(costs.get("double")!.shareWeight).toBeLessThan(0.1);
    });

    it("keeps unpriced routes behind priced peers and ranks unpriced pools on waiting alone", () => {
        const mixed = computeRoutingCosts([entry("priced"), entry("unpriced", { input: null })]);
        expect(mixed.get("unpriced")!.routingCost).toBeNull();
        expect(mixed.get("unpriced")!.shareWeight).toBe(MIN_SHARE_WEIGHT);

        const unpriced = computeRoutingCosts([
            entry("fast", { input: null, output: null, health: { lat_ewma_60s: 300 } }),
            entry("slow", { input: null, output: null, health: { lat_ewma_60s: 3_000, tp_ewma_60s: 20 } }),
        ]);
        expect(unpriced.get("fast")!.shareWeight).toBe(1);
        expect(unpriced.get("slow")!.shareWeight).toBe(MIN_SHARE_WEIGHT);
    });

    it("does not divide by zero for free providers", () => {
        const costs = computeRoutingCosts([entry("free", { input: 0, output: 0 }), entry("paid")]);
        expect(costs.get("free")!.shareWeight).toBe(1);
        expect(Number.isFinite(costs.get("paid")!.shareWeight)).toBe(true);
    });
});

describe("modelTokenMix", () => {
    it("falls back to a default request until the model has traffic", () => {
        expect(modelTokenMix([health(), health()])).toEqual({
            promptTokens: DEFAULT_PROMPT_TOKENS,
            outputTokens: DEFAULT_OUTPUT_TOKENS,
        });
    });

    it("weights each provider's measured mix by its traffic", () => {
        const mix = modelTokenMix([
            health({ prompt_tok_ewma: 10_000, out_tok_ewma: 100, tok_weight: 3 }),
            health({ prompt_tok_ewma: 2_000, out_tok_ewma: 500, tok_weight: 1 }),
        ]);
        expect(mix.promptTokens).toBe(8_000);
        expect(mix.outputTokens).toBe(200);
    });
});

describe("ageHealth", () => {
    it("ages the rate-limit count and token-mix weight with their windows", () => {
        const now = 1_000_000_000;
        const aged = ageHealth(health({
            last_ts_10s: now - 20_000, rec_tot_ew_10s: 10, rec_ok_ew_10s: 0, rec_rate_limited_ew_10s: 2,
            last_tok_ms: now - TOKEN_MIX_TAU_MS, tok_weight: 4,
        }), now);
        // The 429 share of recent failures is unchanged by idle time.
        expect(aged.rec_rate_limited_ew_10s! / (aged.rec_tot_ew_10s! - aged.rec_ok_ew_10s!)).toBeCloseTo(0.2);
        expect(aged.tok_weight).toBeCloseTo(4 / Math.E);
    });
});

describe("resolveRoutingAlgorithm", () => {
    const HOUR = 60 * 60 * 1000;
    const day0 = Date.UTC(2026, 10, 2);

    it("defaults to the routing cost and honours an explicit v8", () => {
        expect(resolveRoutingAlgorithm(undefined)).toBe("routing-cost-v9");
        expect(resolveRoutingAlgorithm("v9")).toBe("routing-cost-v9");
        expect(resolveRoutingAlgorithm("v8")).toBe("provider-score-v8");
    });

    it("alternates 3-hour blocks and swaps each time slot from one day to the next", () => {
        const first = resolveRoutingAlgorithm("switchback", day0 + 1 * HOUR);
        expect(resolveRoutingAlgorithm("switchback", day0 + 2.9 * HOUR)).toBe(first);
        expect(resolveRoutingAlgorithm("switchback", day0 + 4 * HOUR)).not.toBe(first);
        expect(resolveRoutingAlgorithm("switchback", day0 + 25 * HOUR)).not.toBe(first);
        const perDay = Array.from({ length: 8 }, (_, block) => resolveRoutingAlgorithm("switchback", day0 + (block * 3 + 1) * HOUR));
        expect(perDay.filter((version) => version === "routing-cost-v9")).toHaveLength(4);
    });
});
