import { describe, expect, test } from "vitest";
import { checkPricingEntrySafety, isMajorError } from "../validate";

describe("pricing token units", () => {
    const entry = (meter: string, unit: string) => ({
        key: "provider:lab/model:text.generate",
        api_provider_id: "provider",
        api_model_id: "lab/model",
        capability_id: "text.generate",
        rules: [{ meter, unit, unit_size: 1000000, price_per_unit: 0 }],
    });

    test.each(["input_text_tokens", "output_text_tokens", "cached_write_text_tokens"])(
        "rejects noncanonical units for %s before import", meter => {
            const errors = checkPricingEntrySafety(entry(meter, "tokens"));
            expect(errors).toContainEqual(expect.stringContaining("unit must be 'token'"));
            expect(errors.some(isMajorError)).toBe(true);
            expect(checkPricingEntrySafety(entry(meter, "token"))).toEqual([]);
        },
    );
});
