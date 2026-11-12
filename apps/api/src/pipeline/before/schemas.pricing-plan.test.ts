import { describe, expect, it } from "vitest";
import { priceCardSchema } from "./schemas";

describe("request-context price card parsing", () => {
    it("names stored fast SKUs priority, as the fallback card loader does", () => {
        const card = priceCardSchema.parse({
            provider: "venice",
            model: "anthropic/claude-opus-4.8",
            endpoint: "text.generate",
            effective_from: null,
            version: null,
            rules: [
                { pricing_plan: "standard", meter: "input_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: 6 },
                { pricing_plan: "fast", meter: "input_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: 12 },
                { pricing_plan: "early_access", meter: "output_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: 2.61 },
            ],
        });
        expect(card.rules.map((rule) => rule.pricing_plan)).toEqual(["standard", "priority", "early_access"]);
    });
});
