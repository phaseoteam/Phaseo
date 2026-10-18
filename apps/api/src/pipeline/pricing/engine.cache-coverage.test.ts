import { describe, expect, it, vi } from "vitest";
import { computeBillSummary } from "./engine";
import type { PriceCard } from "./types";

function card(price: string, cachePrice?: string): PriceCard {
    return {
        provider: "novita", model: "apodex/apodex-1.1-mini", endpoint: "text.generate",
        effective_from: null, effective_to: null, currency: "USD", version: null,
        rules: ["input_text_tokens", "output_text_tokens", ...(cachePrice == null ? [] : ["cached_read_text_tokens"])].map((meter) => ({
            pricing_plan: "standard", meter, unit: "token", unit_size: 1,
            price_per_unit: meter === "cached_read_text_tokens" ? cachePrice! : price,
            currency: "USD", match: [], priority: 100,
        })),
    };
}

const usage = { input_tokens: 100, output_tokens: 10, input_tokens_details: { cached_tokens: 40 } };

describe("cache pricing coverage", () => {
    it("bills unpriced cached reads at the input rate and flags the catalogue gap", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const result = computeBillSummary(usage, card("0.000001"));
        expect(result.cost_usd).toBe(0.00011);
        expect(result.lines.find((line) => line.dimension === "cached_read_text_tokens")).toMatchObject({
            quantity: 40,
            pricing_fallback: "input_rate",
        });
        expect(result.cache_pricing_fallback).toEqual([expect.objectContaining({
            meter: "cached_read_text_tokens", quantity: 40, input_meter: "input_text_tokens", multiplier: 1,
        })]);
        expect(warn).toHaveBeenCalledWith("[pricing] cache meter priced at input-rate fallback", expect.anything());
        warn.mockRestore();
    });
    it("keeps zero-price routes free when the cache row is missing", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        expect(computeBillSummary(usage, card("0")).cost_usd).toBe(0);
        expect(computeBillSummary(usage, card("0", "0")).cost_usd).toBe(0);
        warn.mockRestore();
    });
    it("bills fallback writes at the documented multiplier", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const claude = { ...card("0.000003"), provider: "anthropic-aws", model: "anthropic/claude-sonnet-5" };
        const result = computeBillSummary(
            { input_tokens: 100, output_tokens: 0, cached_write_text_tokens_5m: 1000, cached_write_text_tokens_1h: 1000 },
            claude,
        );
        const byMeter = new Map(result.lines.map((line) => [line.dimension, line.unit_price_usd]));
        expect(byMeter.get("cached_write_text_tokens_5m")).toBe("0.000003750");
        expect(byMeter.get("cached_write_text_tokens_1h")).toBe("0.000006000");
        expect(byMeter.has("cached_write_text_tokens")).toBe(false);
        warn.mockRestore();
    });
    it("charges uncached input, cached input and output using their explicit prices", () => {
        expect(computeBillSummary(usage, card("0.000001", "0.0000005")).cost_usd).toBe(0.00009);
    });
});

// Claude Fable 5 on Bedrock, Claude on AWS and Vertex: one aggregate write meter per TTL,
// keyed on cache_ttl (catalogue rows as of 2026-10-17).
function fableTtlCard(): PriceCard {
    const rule = (meter: string, price: string, match: any[] = []) => ({
        pricing_plan: "standard", meter: meter as any, unit: "token", unit_size: 1_000_000,
        price_per_unit: price, currency: "USD", match, priority: 100,
    });
    return {
        provider: "amazon-bedrock", model: "anthropic/claude-fable-5", endpoint: "text.generate",
        effective_from: null, effective_to: null, currency: "USD", version: null,
        rules: [
            rule("input_text_tokens", "10"),
            rule("output_text_tokens", "50"),
            rule("cached_read_text_tokens", "1"),
            rule("cached_write_text_tokens", "12.5", [{ path: "cache_ttl", op: "eq", or_group: 1, and_index: 1, value: "5m" }]),
            rule("cached_write_text_tokens", "20", [{ path: "cache_ttl", op: "eq", or_group: 1, and_index: 1, value: "1h" }]),
        ],
    };
}

describe("TTL-keyed cache write rules", () => {
    const lineFor = (result: ReturnType<typeof computeBillSummary>, price: string) =>
        result.lines.find((line) => line.dimension === "cached_write_text_tokens" && line.unit_price_usd === price);

    it("defaults to the 5-minute rule when neither the usage nor the request names a TTL", () => {
        const result = computeBillSummary({ input_tokens: 100, output_tokens: 10, cache_creation_input_tokens: 2_000 }, fableTtlCard());
        expect(lineFor(result, "12.500000000")?.quantity).toBe(2_000);
        expect(result.cache_pricing_fallback).toBeUndefined();
    });

    it("prices each reported TTL split at its own rule", () => {
        const result = computeBillSummary({
            input_tokens: 100,
            output_tokens: 10,
            cache_read_input_tokens: 30_000,
            cache_creation_input_tokens: 3_000,
            cache_creation: { ephemeral_5m_input_tokens: 2_000, ephemeral_1h_input_tokens: 1_000 },
        }, fableTtlCard());
        expect(lineFor(result, "12.500000000")?.quantity).toBe(2_000);
        expect(lineFor(result, "20.000000000")?.quantity).toBe(1_000);
        // 100 * 10 + 10 * 50 + 30000 * 1 + 2000 * 12.5 + 1000 * 20, per 1M tokens.
        expect(result.cost_usd).toBeCloseTo(0.0765, 9);
    });

    it("honours an explicit request TTL when the usage has no split", () => {
        const result = computeBillSummary(
            { input_tokens: 100, output_tokens: 10, cache_creation_input_tokens: 2_000 },
            fableTtlCard(),
            { cache_ttl: "1h" },
        );
        expect(lineFor(result, "20.000000000")?.quantity).toBe(2_000);
    });
});
