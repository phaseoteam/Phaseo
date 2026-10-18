import { describe, expect, it, vi } from "vitest";
import { computeBillSummary } from "./engine";
import type { PriceCard, PriceRule } from "./types";

function card(overrides: Partial<PriceRule> = {}): PriceCard {
    return {
        provider: "test", model: "test", endpoint: "text.generate",
        effective_from: null, effective_to: null, currency: "USD", version: null,
        rules: [{
            meter: "input_text_tokens", pricing_plan: "standard", unit: "token",
            unit_size: 1_000_000, price_per_unit: "2", currency: "USD", match: [],
            ...overrides,
        }],
    };
}

describe("invalid pricing cannot become a wallet charge", () => {
    it("rejects unmatched paid output even when the matched input line is free", () => {
        const mixed = card({ price_per_unit: "0" });
        mixed.rules.push({ ...mixed.rules[0], meter: "output_text_tokens", price_per_unit: "2",
            match: [{ path: "quality", op: "eq", value: "standard" }] });
        expect(() => computeBillSummary({ input_text_tokens: 1000, output_text_tokens: 500 }, mixed, { quality: "premium" }))
            .toThrow("pricing_rule_missing:output_text_tokens");
    });
    it("does not present an input-only subtotal as a complete bill when output pricing fails to match", () => {
        const mixed = card();
        mixed.rules.push({
            ...mixed.rules[0], meter: "output_text_tokens",
            match: [{ path: "quality", op: "eq", value: "standard" }],
        });
        expect(() => computeBillSummary({ input_text_tokens: 1000, output_text_tokens: 500 }, mixed, { quality: "premium" }))
            .toThrow("pricing_rule_missing:output_text_tokens");
    });
    it("prices cache usage from the input rule when the effective card omits its cache meter", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const withInput = computeBillSummary({ input_text_tokens: 1000, cached_read_text_tokens: 500 }, card());
        expect(withInput.lines.find((line) => line.dimension === "cached_read_text_tokens")?.pricing_fallback).toBe("input_rate");
        expect(computeBillSummary({ cached_read_text_tokens: 500 }, card()).cache_pricing_fallback?.[0]?.meter)
            .toBe("cached_read_text_tokens");
        warn.mockRestore();
    });
    it("still rejects cache usage when the card has no input rule to fall back to", () => {
        const outputOnly = card();
        outputOnly.rules = outputOnly.rules.map((rule) => ({ ...rule, meter: "output_text_tokens" }));
        expect(() => computeBillSummary({ output_text_tokens: 10, cached_read_text_tokens: 500 }, outputOnly))
            .toThrow("pricing_rule_missing:cached_read_text_tokens");
    });
    it("preserves aggregate cache-write pricing for providers that also report TTL detail", () => {
        const aggregate = card();
        aggregate.rules.push({ ...aggregate.rules[0], meter: "cached_write_text_tokens", price_per_unit: "3" });
        expect(computeBillSummary({
            input_text_tokens: 1000,
            cached_write_text_tokens: 500,
            cached_write_text_tokens_5m: 300,
            cached_write_text_tokens_1h: 200,
        }, aggregate).lines.map((line) => line.dimension)).toContain("cached_write_text_tokens");
    });
	it("treats a priced implicit cached-input meter as cached-read coverage", () => {
		const implicit = card();
		implicit.rules.push({
			...implicit.rules[0],
			meter: "implicit_cached_input_text_tokens",
			price_per_unit: "0.2",
		});
		const result = computeBillSummary({ cached_tokens: 500 }, implicit);
		expect(result.lines.map((line) => line.dimension)).toContain("implicit_cached_input_text_tokens");
	});
	it("falls back to the input rate for split cache writes when aggregate conditions do not match", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const aggregate = card();
		aggregate.rules.push({
			...aggregate.rules[0], meter: "cached_write_text_tokens", price_per_unit: "3",
			match: [{ path: "cache_class", op: "eq", value: "eligible" }],
		});
		const result = computeBillSummary({ cached_write_text_tokens_5m: 300 }, aggregate);
		expect(result.lines.map((line) => line.dimension)).toEqual(["cached_write_text_tokens_5m"]);
		expect(result.lines[0]?.pricing_fallback).toBe("input_rate");
		warn.mockRestore();
	});
	it("rejects an aggregate cache-write quantity smaller than its split detail", () => {
		const aggregate = card();
		aggregate.rules.push({ ...aggregate.rules[0], meter: "cached_write_text_tokens", price_per_unit: "3" });
		expect(() => computeBillSummary({
			cached_write_text_tokens: 1,
			cached_write_text_tokens_5m: 500,
			cached_write_text_tokens_1h: 500,
		}, aggregate)).toThrow("pricing_rule_missing:cached_write_text_tokens_5m,cached_write_text_tokens_1h");
	});
    it.each([0, -1, NaN, Infinity])("rejects invalid unit size %s instead of charging per single unit", (unit_size) => {
        expect(() => computeBillSummary({ input_text_tokens: 1000 }, card({ unit_size })))
            .toThrow("pricing_invalid_unit_size");
    });
    it.each(["", "bad", "NaN", "Infinity", "1e999", "-2"])("rejects invalid price %s", (price_per_unit) => {
        expect(() => computeBillSummary({ input_text_tokens: 1000 }, card({ price_per_unit })))
            .toThrow("pricing_invalid_unit_price");
    });
    it("does not label a foreign-currency rate as USD", () => {
        expect(() => computeBillSummary({ input_text_tokens: 1000 }, card({ currency: "CNY" })))
            .toThrow("pricing_unsupported_currency");
    });
    it.each([null, undefined, true, false])("rejects nonnumeric runtime price %s", (price) => {
        expect(() => computeBillSummary({ input_text_tokens: 1000 }, card({ price_per_unit: price as any })))
            .toThrow("pricing_invalid_unit_price");
    });
    it("rejects a debit outside exact integer precision", () => {
        expect(() => computeBillSummary({ input_text_tokens: 1e18 }, card()))
            .toThrow("pricing_amount_out_of_range");
    });
    it("does not silently turn a positive sub-nano rate into free usage", () => {
        expect(() => computeBillSummary({ input_text_tokens: 1_000_000 }, card({ price_per_unit: "0.0000000001" })))
            .toThrow("pricing_unit_price_below_precision");
    });
    it("preserves explicit zero rates and fractional quantities", () => {
        expect(computeBillSummary({ input_text_tokens: 1000 }, card({ price_per_unit: "0" })).cost_usd).toBe(0);
        expect(computeBillSummary({ input_text_tokens: 0.5 }, card()).cost_usd_str).toBe("0.000001000");
    });
});
