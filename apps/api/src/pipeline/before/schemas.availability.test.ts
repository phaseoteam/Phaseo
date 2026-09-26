import { describe, expect, it } from "vitest";

import { contextSchema } from "./schemas";

describe("contextSchema provider availability", () => {
    it("accepts lifecycle metadata without treating it as geography", () => {
        expect(contextSchema.parse(payload({ status: "available", announcement_date: "2026-09-22" }))
            .providers[0]?.availabilityPolicy).toBeNull();
    });
    it.each([
        { status: "available", countries: ["US"] },
        { status: "available", mode: "invalid", countries: ["US"] },
        { status: "unknown_shape" },
    ])("does not discard malformed restrictions: %j", value => {
        expect(contextSchema.safeParse(payload(value)).success).toBe(false);
    });
    const payload = (availability: unknown) => ({
        workspace_id: "workspace-1",
        key_ok: true,
        key_limit_ok: true,
        credit_ok: true,
        providers: [{ provider_id: "provider-1", availability }],
        pricing: {},
    });

    it("ignores legacy lifecycle strings instead of rejecting gateway context", () => {
        const parsed = contextSchema.parse(payload("Available"));
        expect(parsed.providers[0]?.availabilityPolicy).toBeNull();
    });

    it("preserves structured geographic availability", () => {
        const parsed = contextSchema.parse(payload({
            mode: "blocklist",
            countries: ["US"],
            country_source: "request_origin",
            unknown_country: "allow",
        }));
        expect(parsed.providers[0]?.availabilityPolicy).toMatchObject({
            mode: "blocklist",
            countries: ["US"],
            unknownCountry: "allow",
        });
    });
});
