import { describe, expect, it } from "vitest";
import { createPublicRoutingSnapshot, isPublicCatalogFresh, publicCatalogSchema } from "./publicCatalogSnapshot";

const fixture = () => ({
    version: 1, model: "lab/model", resolvedModel: "lab/model", endpoints: ["text.generate"],
    checkedAt: 10_000, expiresAt: 310_000,
    variants: [{ endpoint: "text.generate", providers: [{
        provider_id: "test", api_model_id: "lab/model", byok_meta: [],
        capability_params: [{ param_id: "temperature", min: 0, max: 2 }],
        availability: { mode: "blocklist", countries: ["XX"], country_source: "request_origin", unknown_country: "deny" },
    }], pricing: { test: {
        provider: "test", model: "lab/model", endpoint: "text.generate", currency: "USD",
        effective_from: null, effective_to: null, version: "v1",
        rules: [{ meter: "input_tokens", price_per_unit: "0.0001", unit_size: 1_000_000,
            included_quantity: 5, pricing_plan: "standard", billing_timestamp_basis: "request_start",
            match: [{ path: "input_tokens", op: "gt", value: 1000, or_group: 0 }],
            time_windows: [{ label: "night", timezone: "UTC", start_time: "00:00", end_time: "08:00", price_per_unit: "0.00005" }],
        }],
    } } }],
    providerRows: [{ provider_slug: "test", routable: true, zero_data_retention: "default",
        stream_cancellation_support: "supported", stream_cancellation_stops_provider_billing: true,
        stream_cancellation_usage_recovery: "authoritative", stream_cancellation_evidence_kind: "provider",
        metadata: { availability: { mode: "allowlist", countries: ["GB"], country_source: "request_origin", unknown_country: "deny" } },
    }], routeModes: [{ provider_slug: "test", credential_mode: "managed_and_byok" }],
});

describe("compact public routing snapshots", () => {
    it("preserves routing, capabilities, pricing conditions and cancellation policy", () => {
        expect(publicCatalogSchema.parse(fixture())).toEqual(fixture());
    });
    it("strips UI fields from providers, price cards, rules and metadata", () => {
        const value = fixture();
        Object.assign(value.variants[0].providers[0], { description: "large display copy", icon: "logo" });
        Object.assign(value.variants[0].pricing.test, { display_price: "free" });
        Object.assign(value.variants[0].pricing.test.rules[0], { display_label: "tokens" });
        Object.assign(value.providerRows[0].metadata, { admin_notes: "not routing data" });
        expect(publicCatalogSchema.parse(value)).toEqual(fixture());
    });
    it.each(["workspace_id", "api_key", "enc_value", "fingerprint_sha256", "Authorization"])("rejects %s at any depth", key => {
        const value = fixture();
        Object.assign(value.providerRows[0].metadata, { extra: { [key]: "secret" } });
        expect(publicCatalogSchema.safeParse(value).success).toBe(false);
    });
    it("rejects BYOK material and prototype keys", () => {
        const value = fixture();
        value.variants[0].providers[0].byok_meta = [{ id: "private" }] as never[];
        expect(publicCatalogSchema.safeParse(value).success).toBe(false);
        expect(publicCatalogSchema.safeParse(JSON.parse(JSON.stringify(fixture()).replace('"routable":true', '"__proto__":{},"routable":true'))).success).toBe(false);
    });
    it("has a stable content revision independent of key order and lease timestamps", async () => {
        const a = await createPublicRoutingSnapshot(fixture());
        const input = fixture(); input.checkedAt++; input.expiresAt++;
        const b = await createPublicRoutingSnapshot(Object.fromEntries(Object.entries(input).reverse()));
        expect(a.revision).toMatch(/^[a-f0-9]{64}$/);
        expect(a.revision).toBe(b.revision);
        input.variants[0].pricing.test.rules[0].price_per_unit = "0.0002";
        expect((await createPublicRoutingSnapshot(input)).revision).not.toBe(a.revision);
    });
    it("owns and freezes all cached data without freezing the caller's objects", async () => {
        const input = fixture();
        const nested = { config: { enum: ["a"] } };
        Object.assign(input.variants[0].providers[0].capability_params[0], nested);
        const snapshot = await createPublicRoutingSnapshot(input);
        nested.config.enum.push("b");
        expect(Object.isFrozen(nested.config)).toBe(false);
        input.variants[0].providers[0].provider_id = "other";
        expect(snapshot.catalog.variants[0].providers[0].provider_id).toBe("test");
        expect(() => { snapshot.catalog.variants[0].providers[0].provider_id = "changed"; }).toThrow();
        expect(() => { snapshot.catalog.variants[0].pricing.test.rules[0].match!.push({ path: "x", op: "eq" }); }).toThrow();
    });
    it("rejects excessive nesting and oversized content", async () => {
        const input = fixture();
        let deep: unknown = true;
        for (let i = 0; i < 40; i++) deep = { value: deep };
        Object.assign(input.variants[0].providers[0].capability_params[0], { deep });
        expect(publicCatalogSchema.safeParse(input).success).toBe(false);
        const big = fixture(); Object.assign(big.variants[0].providers[0].capability_params[0], { values: "x".repeat(256_000) });
        await expect(createPublicRoutingSnapshot(big)).rejects.toThrow("too_large");
    });
    it("requires matching ordered identity and finite absolute freshness", () => {
        const value = publicCatalogSchema.parse(fixture());
        expect(isPublicCatalogFresh(value, value.model, value.endpoints, 10_000)).toBe(true);
        expect(isPublicCatalogFresh(value, value.model, value.endpoints, value.expiresAt)).toBe(false);
        expect(isPublicCatalogFresh(value, "other", value.endpoints, 10_000)).toBe(false);
        expect(isPublicCatalogFresh({ ...value, expiresAt: 310_001 }, value.model, value.endpoints, 10_000)).toBe(false);
        expect(isPublicCatalogFresh(value, value.model, ["responses"], 10_000)).toBe(false);
    });
});
