// Purpose: Engine behaviour for catalogue card shapes the provider simulator's pricing sweep
//          found mispriced (fast plan names, provider plan labels, alternate condition spellings,
//          sub-nano prices, TTL and prompt-length selection, Alibaba cache and thinking prices).
// Why: Each was a silent under- or over-charge on live cards (AUDIT N22, N23).
// How: Cards shaped like the request-context RPC rows, priced through computeBillSummary.

import { describe, expect, it } from "vitest";
import { computeBillSummary } from "./engine";
import type { PriceCard, PriceRule } from "./types";

function rule(meter: string, price: string, extra: Partial<PriceRule> = {}): PriceRule {
    return {
        pricing_plan: "standard", meter: meter as PriceRule["meter"], unit: "token", unit_size: 1_000_000,
        price_per_unit: price, currency: "USD", match: [], priority: 100, ...extra,
    };
}

function card(provider: string, model: string, rules: PriceRule[], endpoint = "text.generate"): PriceCard {
    return { provider, model, endpoint, effective_from: null, effective_to: null, currency: "USD", version: null, rules };
}

const nanosBy = (bill: ReturnType<typeof computeBillSummary>) =>
    Object.fromEntries(bill.lines.map((line) => [line.dimension, line.line_nanos]));

describe("fast tier cards from the request-context RPC", () => {
    // Venice Claude Opus 4.8: the fast SKU is stored with service_tier_slug "fast" at twice the standard rate.
    const venice = card("venice", "anthropic/claude-opus-4.8", [
        rule("input_text_tokens", "6"), rule("output_text_tokens", "30"),
        rule("input_text_tokens", "12", { pricing_plan: "fast" }), rule("output_text_tokens", "60", { pricing_plan: "fast" }),
    ]);

    it("bills a fast request at the fast price, whether the plan arrives as fast or priority", () => {
        const usage = { input_text_tokens: 1_000_000, output_text_tokens: 1_000_000 };
        expect(computeBillSummary(usage, venice, {}, "priority").cost_usd_str).toBe("72.000000000");
        expect(computeBillSummary(usage, venice, {}, "fast").cost_usd_str).toBe("72.000000000");
        expect(computeBillSummary(usage, venice).cost_usd_str).toBe("36.000000000");
    });

    it("bills a fast-only card (Fireworks GLM 5.3) instead of returning an empty bill", () => {
        const fireworks = card("fireworks", "z-ai/glm-5.3", [
            rule("input_text_tokens", "2.1", { pricing_plan: "fast" }),
            rule("cached_read_text_tokens", "0.39", { pricing_plan: "fast" }),
            rule("output_text_tokens", "6.6", { pricing_plan: "fast" }),
        ]);
        const bill = computeBillSummary(
            { input_text_tokens: 12_347, cached_read_text_tokens: 4_567, output_text_tokens: 3_457 },
            fireworks, {}, "priority",
        );
        expect(nanosBy(bill)).toEqual({ input_text_tokens: 25_928_700, cached_read_text_tokens: 1_781_130, output_text_tokens: 22_816_200 });
        // A fast-only route is a dedicated tier: a request that did not ask for it is not priced as standard.
        expect(() => computeBillSummary({ input_text_tokens: 1000 }, fireworks)).toThrow("pricing_plan_missing:standard");
    });
});

describe("provider plan labels on cards without standard rules", () => {
    it("prices DeepInfra's default plan", () => {
        const deepinfra = card("deepinfra", "baai/bge-m3", [rule("input_text_tokens", "0.01", { pricing_plan: "default" })], "text.embed");
        expect(computeBillSummary({ input_text_tokens: 12_347 }, deepinfra).lines).toMatchObject([
            { dimension: "input_text_tokens", line_nanos: 123_470 },
        ]);
    });

    it("prices Xiaomi's early_access plan, cache reads included", () => {
        const xiaomi = card("xiaomi", "xiaomi/mimo-v2.5-pro-ultraspeed", [
            rule("cached_read_text_tokens", "0.0108", { pricing_plan: "early_access" }),
            rule("input_text_tokens", "1.305", { pricing_plan: "early_access" }),
            rule("output_text_tokens", "2.61", { pricing_plan: "early_access" }),
        ]);
        const bill = computeBillSummary({ input_text_tokens: 12_347, cached_read_text_tokens: 4_567, output_text_tokens: 3_457 }, xiaomi);
        expect(nanosBy(bill)).toEqual({ input_text_tokens: 16_112_835, cached_read_text_tokens: 49_324, output_text_tokens: 9_022_770 });
        // A tier request falls back to the label for meters its own plan does not price.
        expect(computeBillSummary({ input_text_tokens: 12_347 }, xiaomi, {}, "priority").lines[0]?.line_nanos).toBe(16_112_835);
    });

    it("prices a free-only card for a model id without the :free suffix", () => {
        const gmi = card("gmicloud", "qwen/qwen3.8-max-0902", [
            rule("input_text_tokens", "0", { pricing_plan: "free" }),
            rule("cached_read_text_tokens", "0", { pricing_plan: "free" }),
            rule("output_text_tokens", "0", { pricing_plan: "free" }),
        ]);
        const bill = computeBillSummary({ input_text_tokens: 100, cached_read_text_tokens: 50, output_text_tokens: 10 }, gmi);
        expect(bill.lines).toHaveLength(3);
        expect(bill.cost_usd_str).toBe("0.000000000");
    });
});

describe("rule conditions and prices as the catalogue stores them", () => {
    it("reads {key, operator} conditions (Upstage document-parse enhanced mode)", () => {
        const upstage = card("upstage", "upstage/document-parse", [
            rule("input_pages", "0.01", { unit: "page", unit_size: 1 }),
            rule("input_pages", "0.03", { unit: "page", unit_size: 1, priority: 110, match: [{ key: "mode", operator: "eq", value: "enhanced" } as any] }),
        ], "ocr");
        expect(computeBillSummary({ input_pages: 3 }, upstage, { mode: "enhanced" }).cost_usd_str).toBe("0.090000000");
        expect(computeBillSummary({ input_pages: 3 }, upstage, { mode: "standard" }).cost_usd_str).toBe("0.030000000");
    });

    it("prices digits below a nano exactly (Baidu Qwen3 embedding)", () => {
        const baidu = card("baidu", "qwen/qwen3-embedding-0.6b", [rule("input_text_tokens", "0.000074505731", { unit_size: 1000 })], "embeddings");
        const bill = computeBillSummary({ input_text_tokens: 12_347 }, baidu);
        // 12.347 units x $0.000074505731 = $0.000919922260...; truncating the unit price to 74,505 nanos gave 919,913.
        expect(bill.lines[0]).toMatchObject({ line_nanos: 919_922, unit_price_usd: "0.000074505731" });
    });
});

describe("cache writes and prompt length", () => {
    it("bills an undivided write at the TTL the request asked for (Kimi K3, ttl 1h)", () => {
        const kimi = card("moonshotai", "moonshotai/kimi-k3", [
            rule("input_text_tokens", "3"), rule("cached_write_text_tokens_1h", "6"),
            rule("cached_write_text_tokens_5m", "3"), rule("output_text_tokens", "15"),
        ]);
        const usage = { input_text_tokens: 12_347, cached_write_text_tokens: 987, output_text_tokens: 3_457 };
        expect(nanosBy(computeBillSummary(usage, kimi, { cache_ttl: "1h" }))).toMatchObject({ cached_write_text_tokens_1h: 5_922_000 });
        expect(nanosBy(computeBillSummary(usage, kimi, {}))).toMatchObject({ cached_write_text_tokens_5m: 2_961_000 });
    });

    it("counts cache writes reported outside input towards a long-context threshold (Claude on Bedrock)", () => {
        const tier = (op: "lte" | "gt") => [{ path: "input_tokens", op, value: 200_000, or_group: 1, and_index: 1 }] as PriceRule["match"];
        const bedrock = card("amazon-bedrock", "anthropic/claude-sonnet-4", [
            rule("input_text_tokens", "3", { match: tier("lte") }),
            rule("cached_read_text_tokens", "0.3", { match: tier("lte") }),
            rule("cached_write_text_tokens_5m", "3.75", { match: tier("lte") }),
            rule("output_text_tokens", "15", { match: tier("lte") }),
            rule("input_text_tokens", "6", { match: tier("gt") }),
            rule("cached_read_text_tokens", "0.6", { match: tier("gt") }),
            rule("cached_write_text_tokens_5m", "7.5", { match: tier("gt") }),
            rule("output_text_tokens", "22.5", { match: tier("gt") }),
        ]);
        // IR usage after normalisation: input counts the 180,001 cache reads but not the 10,001 writes,
        // so the prompt is 200,001 tokens although input_tokens reports 190,000.
        const usage = {
            input_tokens: 190_000, output_tokens: 448, cached_read_text_tokens: 180_001,
            cached_read_tokens_are_subset_of_input: true,
            cached_write_text_tokens: 10_001, cached_write_text_tokens_5m: 10_001,
            cached_write_tokens_are_subset_of_input: false,
        };
        expect(nanosBy(computeBillSummary(usage, bedrock))).toEqual({
            input_text_tokens: 59_994_000, output_text_tokens: 10_080_000,
            cached_read_text_tokens: 108_000_600, cached_write_text_tokens_5m: 75_007_500,
        });
        // Without a stated relation to input, a bare count is not added to input_tokens.
        expect(nanosBy(computeBillSummary({ input_tokens: 200_000, input_text_tokens: 195_433, cached_read_text_tokens: 4_567 }, bedrock)))
            .toMatchObject({ input_text_tokens: 586_299_000 });
    });
});

describe("Alibaba Model Studio", () => {
    // Qwen 3.8 Max 0902: implicit hits $0.25, explicit hits $0.17, explicit creation $2.50 per 1M tokens.
    const qwenMax = card("alibaba-cloud", "qwen/qwen3.8-max-0902", [
        rule("input_text_tokens", "2"), rule("implicit_cached_input_text_tokens", "0.25"),
        rule("cached_write_text_tokens", "2.5"), rule("cached_read_text_tokens", "0.17"), rule("output_text_tokens", "6"),
    ]);
    const hit = {
        prompt_tokens: 100_003, completion_tokens: 5_003,
        prompt_tokens_details: { cached_tokens: 20_011 }, cached_read_tokens_are_subset_of_input: true,
    };

    it("bills one reported hit once, as implicit when the request set no cache marks", () => {
        const bill = computeBillSummary(hit, qwenMax);
        expect(nanosBy(bill)).toEqual({
            implicit_cached_input_text_tokens: 5_002_750, input_text_tokens: 159_984_000, output_text_tokens: 30_018_000,
        });
    });

    it("bills the hit as explicit when the request carried cache_control marks", () => {
        const bill = computeBillSummary(hit, qwenMax, { cache_marks: true });
        expect(nanosBy(bill)).toEqual({
            cached_read_text_tokens: 3_401_870, input_text_tokens: 159_984_000, output_text_tokens: 30_018_000,
        });
    });

    it("bills the hit as explicit when the response also reported a cache creation", () => {
        const bill = computeBillSummary({
            ...hit,
            prompt_tokens_details: { cached_tokens: 20_011, cache_write_tokens: 3_019 },
            cached_write_tokens_are_subset_of_input: true,
        }, qwenMax);
        expect(nanosBy(bill)).toMatchObject({ cached_read_text_tokens: 3_401_870, cached_write_text_tokens: 7_547_500 });
        expect(bill.lines.some((line) => line.dimension === "implicit_cached_input_text_tokens")).toBe(false);
    });

    it("bills the answer at the thinking-mode price when the model thought", () => {
        const qwen3 = card("alibaba-cloud", "qwen/qwen3-0.6b", [
            rule("input_text_tokens", "0.11"), rule("output_text_tokens", "0.42"), rule("output_reasoning_tokens", "1.26"),
        ]);
        const thinking = computeBillSummary({ input_text_tokens: 12_347, output_text_tokens: 4_246, reasoning_tokens: 789 }, qwen3);
        expect(thinking.cost_usd_str).toBe("0.006708130");
        expect(nanosBy(thinking)).toMatchObject({ output_text_tokens: 4_355_820, output_reasoning_tokens: 994_140 });
        // Non-thinking answers keep the non-thinking price, and other providers keep the output price.
        expect(nanosBy(computeBillSummary({ output_text_tokens: 3_457 }, qwen3))).toEqual({ output_text_tokens: 1_451_940 });
        const other = card("example", "example/model", qwen3.rules);
        expect(nanosBy(computeBillSummary({ output_text_tokens: 4_246, reasoning_tokens: 789 }, other)))
            .toMatchObject({ output_text_tokens: 1_451_940 });
    });
});
