import { describe, expect, it } from "vitest";
import { resolveEffectiveDataPolicy } from "./dataPolicy";
import type { GatewayProviderSnapshot } from "./types";

function provider(overrides: Partial<GatewayProviderSnapshot> = {}): GatewayProviderSnapshot {
    return {
        providerId: "openai",
        supportsEndpoint: true,
        baseWeight: 1,
        byokMeta: [],
        providerModelSlug: "gpt-5",
        dataPolicyTier: "private",
        dataPolicyConfidence: "confirmed",
        zeroDataRetention: true,
        ...overrides,
    };
}

describe("resolveEffectiveDataPolicy", () => {
    it("inherits the provider policy for stateless inference", () => {
        expect(resolveEffectiveDataPolicy({ endpoint: "responses", provider: provider() })).toMatchObject({
            tier: "private",
            zdrEligibility: "eligible",
            retentionMode: "unknown",
            source: "provider",
        });
    });

    it("reports no retention only for an explicitly selected ZDR offer", () => {
        expect(resolveEffectiveDataPolicy({
            endpoint: "responses",
            provider: provider({ dataPolicyVariant: "zdr" }),
        })).toMatchObject({
            zdrEligibility: "eligible",
            retentionMode: "none",
            source: "provider",
        });
    });

    it("does not classify batch as ZDR from the provider default", () => {
        expect(resolveEffectiveDataPolicy({ endpoint: "batch", provider: provider() })).toMatchObject({
            tier: "logs",
            zdrEligibility: "ineligible",
            retentionMode: "until_deleted",
            source: "capability_default",
        });
    });

    it("uses an explicit capability policy ahead of the conservative default", () => {
        const result = resolveEffectiveDataPolicy({
            endpoint: "batch",
            provider: provider({
                capabilityParams: {
                    data_policy: {
                        tier: "private",
                        confidence: "confirmed",
                        zdrEligibility: "eligible",
                        retentionMode: "none",
                        reason: "Covered by a custom upstream agreement.",
                    },
                },
            }),
        });
        expect(result).toMatchObject({
            tier: "private",
            zdrEligibility: "eligible",
            source: "capability",
        });
    });
});

it("grants retention only to the explicitly verified native capability", () => {
    const native = provider({ zeroDataRetention: false, capabilityParams: { data_policy: {
        tier: "private", confidence: "confirmed", zeroDataRetention: true,
        zdrEligibility: "eligible", retentionMode: "none", retentionDays: 0,
    } } });
    expect(resolveEffectiveDataPolicy({ endpoint: "text.generate", provider: native }))
        .toMatchObject({ tier: "private", zdrEligibility: "eligible", retentionMode: "none", retentionDays: 0 });
    expect(resolveEffectiveDataPolicy({ endpoint: "text.generate", provider: provider({ zeroDataRetention: false }) }))
        .toMatchObject({ zdrEligibility: "ineligible" });
});


it("does not promote an explicitly unguaranteed or ineligible route", () => {
    for (const policy of [
        { zeroDataRetention: false, zdrEligibility: "eligible" },
        { zeroDataRetention: true, zdrEligibility: "ineligible" },
    ]) {
        expect(resolveEffectiveDataPolicy({ endpoint: "text.generate", provider: provider({
            capabilityParams: { data_policy: policy },
        }) })).toMatchObject({ zdrEligibility: "ineligible" });
    }
});
