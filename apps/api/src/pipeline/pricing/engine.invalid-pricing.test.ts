import { describe, expect, it } from "vitest";
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
