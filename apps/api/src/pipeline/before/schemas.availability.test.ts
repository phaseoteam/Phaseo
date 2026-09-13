import { describe, expect, it } from "vitest";

import { contextSchema } from "./schemas";

describe("contextSchema provider availability", () => {
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
