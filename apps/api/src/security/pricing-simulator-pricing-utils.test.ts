import { describe, expect, it } from "vitest";
import { setNestedValue, unsetNestedValue } from "../../scripts/pricing-simulator-pricing-utils";

describe("pricing simulator nested paths", () => {
    it("sets and unsets safe nested values", () => {
        const target: Record<string, unknown> = {};
        setNestedValue(target, "request.usage.tokens", 12);
        expect(target).toEqual({ request: { usage: { tokens: 12 } } });
        unsetNestedValue(target, "request.usage.tokens");
        expect(target).toEqual({ request: { usage: {} } });
    });

    it("rejects prototype pollution paths", () => {
        const target: Record<string, unknown> = {};
        setNestedValue(target, "__proto__.polluted", true);
        setNestedValue(target, "safe.constructor.prototype.polluted", true);
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
        expect(target).toEqual({});
    });
});
