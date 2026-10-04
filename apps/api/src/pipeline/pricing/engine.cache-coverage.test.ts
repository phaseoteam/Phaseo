import { describe, expect, it } from "vitest";
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
    it("does not silently omit unpriced cached usage on paid routes", () => {
        expect(() => computeBillSummary(usage, card("0.000001"))).toThrow("pricing_rule_missing:cached_read_text_tokens");
    });
    it("requires explicit cache pricing even on zero-price routes", () => {
        expect(() => computeBillSummary(usage, card("0"))).toThrow("pricing_rule_missing:cached_read_text_tokens");
        expect(computeBillSummary(usage, card("0", "0")).cost_usd).toBe(0);
    });
    it("charges uncached input, cached input and output using their explicit prices", () => {
        expect(computeBillSummary(usage, card("0.000001", "0.0000005")).cost_usd).toBe(0.00009);
    });
});
