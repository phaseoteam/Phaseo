import { describe, expect, it } from "vitest";

import { isCurrentStandardPricingSku } from "./models.catalogue";

describe("catalogue pricing SKU selection", () => {
    const now = Date.parse("2026-09-22T12:00:00Z");

    it("keeps only active, effective standard-tier pricing", () => {
        const current = {
            status: "active",
            service_tier_slug: "standard",
            effective_from: "2026-09-01T00:00:00Z",
            effective_to: null,
        };

        expect(isCurrentStandardPricingSku(current, now)).toBe(true);
        expect(isCurrentStandardPricingSku({ ...current, status: "deprecated" }, now)).toBe(false);
        expect(isCurrentStandardPricingSku({ ...current, service_tier_slug: "batch" }, now)).toBe(false);
        expect(isCurrentStandardPricingSku({ ...current, effective_from: "2026-09-23T00:00:00Z" }, now)).toBe(false);
        expect(isCurrentStandardPricingSku({ ...current, effective_to: "2026-09-22T11:59:59Z" }, now)).toBe(false);
    });
});
