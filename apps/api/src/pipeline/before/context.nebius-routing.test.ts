import { describe, expect, it } from "vitest";
import type { GatewayContextData, GatewayProviderSnapshot } from "./types";
import { applyNebiusRegionalModelAllowlist } from "./context";

function buildProvider(args: {
    providerId: string;
    providerModelSlug: string | null;
}): GatewayProviderSnapshot {
    return {
        providerId: args.providerId,
        providerModelSlug: args.providerModelSlug,
        supportsEndpoint: true,
        baseWeight: 1,
        byokMeta: [],
    };
}

function buildContext(args: {
    resolvedModel: string | null;
    providers: GatewayProviderSnapshot[];
    pricing?: Record<string, any>;
}): GatewayContextData {
    return {
        workspaceId: "team_test",
        resolvedModel: args.resolvedModel,
        key: { ok: true, reason: null, resetAt: null },
        keyLimit: { ok: true, reason: null, resetAt: null },
        credit: { ok: true, reason: null, resetAt: null },
        providers: args.providers,
        pricing: args.pricing ?? {},
    };
}

describe("applyNebiusRegionalModelAllowlist", () => {
    it("keeps allowed EU North 1 model", () => {
        const parsed = buildContext({
            resolvedModel: "nvidia/nemotron-3-super-120b-a12b",
            providers: [
                buildProvider({
                    providerId: "nebius-token-factory-eu-north-1",
                    providerModelSlug: "nvidia/nemotron-3-super-120b-a12b",
                }),
            ],
            pricing: {
                "nebius-token-factory-eu-north-1": { provider: "nebius-token-factory-eu-north-1" },
            },
        });

        const filtered = applyNebiusRegionalModelAllowlist({
            parsed,
            requestedModel: "nvidia/nemotron-3-super-120b-a12b",
        });

        expect(filtered.providers).toHaveLength(1);
        expect(filtered.providers[0]?.providerId).toBe("nebius-token-factory-eu-north-1");
        expect(filtered.pricing["nebius-token-factory-eu-north-1"]).toBeDefined();
    });

    it("drops disallowed regional Nebius model and matching pricing", () => {
        const parsed = buildContext({
            resolvedModel: "meta/llama-3.3-70b-instruct",
            providers: [
                buildProvider({
                    providerId: "nebius-token-factory-us-central-1",
                    providerModelSlug: "meta/llama-3.3-70b-instruct",
                }),
            ],
            pricing: {
                "nebius-token-factory-us-central-1": { provider: "nebius-token-factory-us-central-1" },
            },
        });

        const filtered = applyNebiusRegionalModelAllowlist({
            parsed,
            requestedModel: "meta/llama-3.3-70b-instruct",
        });

        expect(filtered.providers).toHaveLength(0);
        expect(filtered.pricing["nebius-token-factory-us-central-1"]).toBeUndefined();
    });

    it("keeps non-Nebius providers unchanged", () => {
        const parsed = buildContext({
            resolvedModel: "meta/llama-3.3-70b-instruct",
            providers: [
                buildProvider({
                    providerId: "groq",
                    providerModelSlug: "meta/llama-3.3-70b-instruct",
                }),
            ],
            pricing: {
                groq: { provider: "groq" },
            },
        });

        const filtered = applyNebiusRegionalModelAllowlist({
            parsed,
            requestedModel: "meta/llama-3.3-70b-instruct",
        });

        expect(filtered.providers).toHaveLength(1);
        expect(filtered.providers[0]?.providerId).toBe("groq");
        expect(filtered.pricing.groq).toBeDefined();
    });

    it("supports provider-scoped regional Nebius model requests", () => {
        const parsed = buildContext({
            resolvedModel: "nvidia/nemotron-3-super-2026-03-11",
            providers: [
                buildProvider({
                    providerId: "nebius-token-factory-us-central-1",
                    providerModelSlug: "nvidia/nemotron-3-super-120b-a12b",
                }),
            ],
            pricing: {
                "nebius-token-factory-us-central-1": { provider: "nebius-token-factory-us-central-1" },
            },
        });

        const filtered = applyNebiusRegionalModelAllowlist({
            parsed,
            requestedModel: "nebius-token-factory-us-central-1/nvidia/nemotron-3-super-120b-a12b",
        });

        expect(filtered.providers).toHaveLength(1);
        expect(filtered.providers[0]?.providerId).toBe("nebius-token-factory-us-central-1");
    });
});

