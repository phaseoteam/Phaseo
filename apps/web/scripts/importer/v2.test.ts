jest.mock("./paths", () => ({
    DATA_ROOT: "",
    DIR_ALIASES: "",
}));

import {
    isFreeModelVariant,
    mergeProviderModels,
    preflightV2Benchmarks,
    preflightV2Models,
    pricingModelPart,
    v2RouteModelSlug,
    v2RouteExecutionRegions,
    v2PricingMeterMetadata,
    validateJsonPricingRules,
    routeStatus,
    catalogueStatus,
    providerAvailabilityStatus,
    phaseoStatus,
    routeAccessScope,
    phaseoRoutingEnabled,
    staleJsonProviderRouteIds,
    staleOwnedModelChildRows,
    staleSubscriptionPlanChildRows,
    staleSubscriptionPlanUuids,
    protectedCatalogueIndex,
    staleBenchmarkResultIds,
    staleModelSlugs,
    explicitlyRetiredAliasSlugs,
    stalePricingSkuIds,
    stalePricingMeterIds,
    staleRouteVariantIds,
    stealthRouteIds,
    isProtectedProviderModel,
    canonicalServiceTierSlug,
    resolveCapabilityDataPolicy,
} from "./v2";

describe("capability data policy resolution", () => {
    const provider = {
        capability_data_policies: {
            "text.generate": {
                tier: "private",
                confidence: "confirmed",
                zdrEligibility: "eligible",
                retentionMode: "transient",
                retentionDays: 0,
            },
        },
        capability_data_policy_exclusions: [
            { capability_id: "text.generate", provider_model_slug_prefix: "labs-" },
        ],
    };

    it("uses the provider default for an eligible capability", () => {
        expect(resolveCapabilityDataPolicy(provider, "text.generate", "mistral-small-4"))
            .toMatchObject({ tier: "private", zdrEligibility: "eligible" });
    });

    it("does not apply a stateless default to excluded Labs models", () => {
        expect(resolveCapabilityDataPolicy(provider, "text.generate", "labs-mistral-small-4"))
            .toBeNull();
    });

    it("supports capability-wide exclusions without a model prefix", () => {
        expect(resolveCapabilityDataPolicy({
            ...provider,
            capability_data_policy_exclusions: [{ capability_id: "text.generate" }],
        }, "text.generate", "mistral-small-4"))
            .toBeNull();
    });

    it("lets an explicit capability policy override the provider default", () => {
        const explicit = { tier: "logs", confidence: "confirmed", zdrEligibility: "ineligible", retentionMode: "until_deleted" };
        expect(resolveCapabilityDataPolicy(provider, "text.generate", "mistral-small-4", explicit))
            .toEqual(explicit);
    });
});

describe("service tier canonicalization", () => {
    it("stores fast as the canonical priority tier", () => {
        expect(canonicalServiceTierSlug("fast")).toBe("priority");
        expect(canonicalServiceTierSlug("priority")).toBe("priority");
    });
});

describe("V2 child reconciliation", () => {
    it("removes repository-owned notices that disappeared from JSON", () => {
        expect(staleOwnedModelChildRows(
            [
                { model_slug: "moonshotai/kimi-k3" },
                { model_slug: "external/model" },
            ],
            [],
            new Set(["moonshotai/kimi-k3"]),
            ["model_slug"],
        )).toEqual([{ model_slug: "moonshotai/kimi-k3" }]);
    });

    it("removes stale links and details while preserving desired identities", () => {
        expect(staleOwnedModelChildRows(
            [
                { model_slug: "lab/model", link_kind: "docs", url: "https://old.example" },
                { model_slug: "lab/model", link_kind: "weights", url: "https://weights.example" },
            ],
            [
                { model_slug: "lab/model", link_kind: "docs", url: "https://new.example" },
                { model_slug: "lab/model", link_kind: "weights", url: "https://weights.example" },
            ],
            new Set(["lab/model"]),
            ["model_slug", "link_kind", "url"],
        )).toEqual([
            { model_slug: "lab/model", link_kind: "docs", url: "https://old.example" },
        ]);
    });
});

describe("V2 subscription plan reconciliation", () => {
    it("deletes stale plans while preserving database-owned overrides", () => {
        expect(staleSubscriptionPlanUuids(
            [
                { plan_uuid: "current" },
                { plan_uuid: "stale" },
                { plan_uuid: "database-owned" },
            ],
            new Set(["current"]),
            new Set(["database-owned"]),
        )).toEqual(["stale"]);
    });

    it("reconciles removed child rows only for repository-owned current plans", () => {
        expect(staleSubscriptionPlanChildRows(
            [
                { plan_uuid: "current", model_slug: "kept" },
                { plan_uuid: "current", model_slug: "removed" },
                { plan_uuid: "database-owned", model_slug: "removed" },
                { plan_uuid: "old-plan", model_slug: "removed" },
            ],
            [{ plan_uuid: "current", model_slug: "kept" }],
            new Set(["current"]),
            new Set(["database-owned"]),
            ["plan_uuid", "model_slug"],
        )).toEqual([{ plan_uuid: "current", model_slug: "removed" }]);
    });

    it("preserves relations to database-owned models", () => {
        expect(staleSubscriptionPlanChildRows(
            [{ plan_uuid: "current", model_slug: "private/model" }],
            [],
            new Set(["current"]),
            new Set(),
            ["plan_uuid", "model_slug"],
            new Set(["private/model"]),
        )).toEqual([]);
    });
});

describe("V2 provider route reconciliation", () => {
    it("deletes only stale importer-owned routes", () => {
        expect(staleJsonProviderRouteIds(
            [
                { provider_model_id: "provider:active", metadata: { source: "json" } },
                { provider_model_id: "provider:disabled", metadata: { source: "json" } },
                { provider_model_id: "provider:stale", metadata: { source: "models.dev" } },
                { provider_model_id: "provider:unresolved", metadata: { source: "json" } },
                { provider_model_id: "provider:manual", metadata: { source: "manual" } },
            ],
            new Set(["provider:active", "provider:disabled"]),
            new Set(["provider:unresolved"]),
        )).toEqual(["provider:stale"]);
    });

    it("preserves protected stealth routes", () => {
        expect(staleJsonProviderRouteIds(
            [{ provider_model_id: "private-provider:hidden-model", metadata: { source: "json" } }],
            new Set(),
            new Set(),
            new Set(["private-provider:hidden-model"]),
        )).toEqual([]);
    });
});

describe("V2 alias reconciliation", () => {
    it("removes explicitly retired aliases even without ownership metadata", () => {
        expect(explicitlyRetiredAliasSlugs(
            [
                { alias_slug: "openai/gpt-latest" },
                { alias_slug: "openai/gpt-astra-latest" },
                { alias_slug: "openai/gpt-latest", metadata: { source: "json" } },
            ],
            new Set(["openai/gpt-latest"]),
        )).toEqual(["openai/gpt-latest"]);
    });
});

describe("stealth catalogue protection", () => {
    it("indexes only dispositions protected from repository sync", () => {
        expect(protectedCatalogueIndex([
            { source_type: "providers", source_key: "private-provider", disposition: "stealth" },
            { source_type: "models", source_key: "private-lab/hidden-model", disposition: "database_managed" },
            { source_type: "providers", source_key: "draft", disposition: "unknown" },
        ])).toEqual(new Map([
            ["providers", new Set(["private-provider"])],
            ["models", new Set(["private-lab/hidden-model"])],
        ]));
    });

    it("preserves protected models and benchmark results", () => {
        const protectedModels = new Set(["private-lab/hidden-model"]);
        expect(staleModelSlugs(
            [
                { model_slug: "public/stale", metadata: { source: "json" } },
                { model_slug: "private-lab/hidden-model", metadata: { source: "json" } },
            ],
            new Set(),
            protectedModels,
        )).toEqual(["public/stale"]);
        expect(staleBenchmarkResultIds(
            [
                { result_id: "public-result", model_slug: "public/stale" },
                { result_id: "private-result", model_slug: "private-lab/hidden-model" },
            ],
            new Set(),
            protectedModels,
        )).toEqual(["public-result"]);
    });

    it("retires replaced JSON meters without touching historical, admin or protected pricing", () => {
        const meter = { sku_id: "refreshed", metadata: { source: "json" }, billable: true };
        expect(stalePricingMeterIds([
            { ...meter, sku_meter_id: "old", meter_key: "requests" },
            { ...meter, sku_meter_id: "current", meter_key: "input_video_seconds" },
            { ...meter, sku_meter_id: "admin", meter_key: "custom", metadata: { source: "admin" } },
            { ...meter, sku_meter_id: "protected", meter_key: "protected", metadata: { source: "json", source_key: "override" } },
            { ...meter, sku_meter_id: "other-sku", sku_id: "unrefreshed", meter_key: "requests" },
            { ...meter, sku_meter_id: "retired", meter_key: "old", billable: false },
        ], new Set(["refreshed:input_video_seconds"]), new Set(["refreshed"]), new Set(["override"])))
            .toEqual(["old"]);
    });

    it("preserves protected pricing rules and route SKUs", () => {
        expect(stalePricingSkuIds(
            [
                { sku_id: "stale", provider_model_id: "public:model", sku_code: "old", version: 1, metadata: { source: "json" } },
                { sku_id: "rule", provider_model_id: "public:model", sku_code: "managed", version: 1, metadata: { source: "json", source_key: "private-rule" } },
                { sku_id: "route", provider_model_id: "private-provider:hidden-model", sku_code: "default", version: 1, metadata: { source: "json" } },
            ],
            new Set(),
            new Set(["private-rule"]),
            new Set(["private-provider:hidden-model"]),
        )).toEqual(["stale"]);
    });

    it("blocks SKU and meter upserts for protected provider models", () => {
        const protectedRoutes = new Set(["stealth:private-model"]);

        expect(isProtectedProviderModel(
            { provider_model_id: "stealth:private-model" },
            protectedRoutes,
        )).toBe(true);
        expect(isProtectedProviderModel(
            { provider_api_model_id: "stealth:private-model" },
            protectedRoutes,
        )).toBe(true);
        expect(isProtectedProviderModel(
            { provider_model_id: "public:model" },
            protectedRoutes,
        )).toBe(false);
    });

    it("preserves variants belonging to protected routes", () => {
        expect(staleRouteVariantIds(
            [
                { variant_id: "public-variant", provider_model_id: "public:model", variant_key: "global:standard", metadata: { source: "json" } },
                { variant_id: "private-variant", provider_model_id: "private-provider:hidden-model", variant_key: "global:standard", metadata: { source: "json" } },
            ],
            new Set(),
            new Set(["private-provider:hidden-model"]),
        )).toEqual(["public-variant"]);
    });

    it("treats only explicitly marked routes as stealth", () => {
        expect(stealthRouteIds([
            { provider_model_id: "private-provider:hidden-model", is_stealth: true },
            { provider_model_id: "public-provider:model", is_stealth: false },
            { provider_model_id: "missing-flag:model" },
            { provider_model_id: "", is_stealth: true },
        ])).toEqual(new Set(["private-provider:hidden-model"]));
    });
});

describe("free model variants", () => {
    it("uses the canonical base identity for a free provider route", () => {
        expect(v2RouteModelSlug(
            {
                api_model_id: "z-ai/glm-4-7-flash:free",
                internal_model_id: "z-ai/glm-4.7-flash",
            },
            (value) => String(value),
            { canonical_model_id: "z-ai/glm-4.7-flash:free" },
        )).toBe("z-ai/glm-4.7-flash:free");
    });

    it("does not add the suffix twice", () => {
        expect(v2RouteModelSlug(
            { api_model_id: "poolside/laguna-s-2.1:free", model_id: "poolside/laguna-s-2.1:free" },
            (value) => String(value),
            { canonical_model_id: "poolside/laguna-s-2.1:free" },
        )).toBe("poolside/laguna-s-2.1:free");
    });

    it("rejects a free route whose canonical variant is absent from JSON", () => {
        expect(() => v2RouteModelSlug(
            { api_model_id: "poolside/laguna-s-2.1:free", model_id: "poolside/laguna-s-2.1" },
            (value) => String(value),
        )).toThrow("missing authored canonical_model_id");
        expect(isFreeModelVariant("poolside/laguna-s-2.1:FREE")).toBe(true);
    });
});

describe("explicit data-use variants", () => {
    it("keeps the contributor route isolated from the standard model identity", () => {
        expect(v2RouteModelSlug(
            {
                api_model_id: "meta/muse-spark-1.2-contributor",
                internal_model_id: "meta/muse-spark-1.2-contributor",
            },
            (value) => String(value),
            { canonical_model_id: "meta/muse-spark-1.2-contributor" },
        )).toBe("meta/muse-spark-1.2-contributor");
    });
});

describe("routeStatus", () => {
    it("defaults an authored active gateway route to active", () => {
        expect(routeStatus(null, true)).toBe("active");
    });

    it("keeps an explicit disabled status authoritative", () => {
        expect(routeStatus("disabled", true)).toBe("disabled");
    });
});

describe("explicit catalogue statuses", () => {
    it("preserves canonical lifecycle without making unknown values available", () => {
        expect(catalogueStatus("Limited Access")).toBe("limited_access");
        expect(catalogueStatus("Rumoured")).toBe("rumoured");
        expect(catalogueStatus(null)).toBe("unknown");
    });

    it("keeps upstream availability separate from Phaseo integration", () => {
        const offer = {
            provider_status: "available",
            phaseo_status: "unsupported",
            is_active_gateway: true,
            routable: true,
            capabilities: [{ capability_id: "music.generate", status: "active" }],
        };
        expect(providerAvailabilityStatus(offer)).toBe("available");
        expect(phaseoStatus(offer)).toBe("unsupported");
        expect(phaseoRoutingEnabled(offer)).toBe(false);
    });

    it("fails closed for announced offers and non-enabled integrations", () => {
        const offer = {
            provider_status: "coming_soon",
            phaseo_status: "planned",
            is_active_gateway: true,
            routable: true,
        };
        expect(phaseoRoutingEnabled(offer)).toBe(false);
    });

    it("fails closed for unrecognised explicit values", () => {
        const offer = {
            provider_status: "probably_live",
            phaseo_status: "ship_it",
            is_active_gateway: true,
            routable: true,
        };
        expect(providerAvailabilityStatus(offer)).toBe("unknown");
        expect(phaseoStatus(offer)).toBe("disabled");
        expect(phaseoRoutingEnabled(offer)).toBe(false);
    });

    it("restricts testing integrations to internal access without public routing", () => {
        const offer = {
            provider_status: "available",
            phaseo_status: "testing",
            is_active_gateway: true,
            routable: true,
        };
        expect(routeAccessScope(offer)).toBe("internal");
        expect(phaseoRoutingEnabled(offer)).toBe(false);
    });

    it("keeps withheld catalogue routes discoverable without enabling routing", () => {
        const offer = {
            provider_status: "limited_access",
            is_active_gateway: false,
            routable: false,
            routing_status: "disabled",
            capabilities: [{ capability_id: "text.generate", status: "inactive" }],
        };
        expect(phaseoStatus(offer)).toBe("unsupported");
        expect(routeAccessScope(offer)).toBe("public");
        expect(phaseoRoutingEnabled(offer)).toBe(false);
    });

    it("keeps deprecated provider routes routable until their retirement window ends", () => {
        const offer = {
            provider_status: "deprecated",
            phaseo_status: "enabled",
            routing_status: "deprecated",
            effective_to: "2099-01-01T00:00:00Z",
            is_active_gateway: true,
            routable: true,
        };
        expect(providerAvailabilityStatus(offer)).toBe("deprecated");
        expect(phaseoRoutingEnabled(offer)).toBe(true);
    });

    it("disables deprecated provider routes after their retirement window ends", () => {
        const offer = {
            provider_status: "deprecated",
            phaseo_status: "enabled",
            routing_status: "deprecated",
            effective_to: "2000-01-01T00:00:00Z",
            is_active_gateway: true,
            routable: true,
        };
        expect(phaseoRoutingEnabled(offer)).toBe(false);
    });

    it("fails closed to internal access for an unrecognised explicit scope", () => {
        const offer = {
            provider_status: "available",
            phaseo_status: "enabled",
            access_scope: "staff-ish",
            is_active_gateway: true,
            routable: true,
        };
        expect(routeAccessScope(offer)).toBe("internal");
        expect(phaseoRoutingEnabled(offer)).toBe(false);
    });

    it("keeps legacy active routes enabled during migration", () => {
        const offer = {
            is_active_gateway: true,
            routable: true,
            routing_status: "active",
            capabilities: [{ capability_id: "text.generate", status: "active" }],
        };
        expect(providerAvailabilityStatus(offer)).toBe("available");
        expect(phaseoStatus(offer)).toBe("enabled");
        expect(phaseoRoutingEnabled(offer)).toBe(true);
    });
});

describe("v2RouteExecutionRegions", () => {
    it("prefers model-specific execution regions over provider defaults", () => {
        expect(v2RouteExecutionRegions(
            ["global"],
            { regions: { execution: ["EU-NORTH1"] } },
        )).toEqual(["eu-north1"]);
    });

    it("falls back to provider defaults when a model has no execution regions", () => {
        expect(v2RouteExecutionRegions(["US", "us"], { regions: { execution: null } }))
            .toEqual(["us"]);
    });
});

describe("mergeProviderModels", () => {
    it("keeps authored-only routes and lets JSON override legacy fields", () => {
        const rows = mergeProviderModels(
            [{
                provider_api_model_id: "provider:lab/model",
                routing_status: "disabled",
                legacy_only: true,
            }],
            new Map([
                ["provider:lab/model", {
                    provider_api_model_id: "provider:lab/model",
                    routing_status: "active",
                }],
                ["provider:lab/model:free", {
                    provider_api_model_id: "provider:lab/model:free",
                    canonical_model_id: "lab/model:free",
                }],
            ]),
        );

        expect(rows).toHaveLength(2);
        expect(rows).toContainEqual(expect.objectContaining({
            provider_api_model_id: "provider:lab/model",
            routing_status: "active",
            legacy_only: true,
        }));
        expect(rows).toContainEqual(expect.objectContaining({
            provider_api_model_id: "provider:lab/model:free",
            canonical_model_id: "lab/model:free",
        }));
    });
});

describe("pricingModelPart", () => {
    it.each([
        "mindai/macaron-v1-venti:free",
        "inclusionai/ling-3.0-flash:free",
    ])("preserves the %s variant when removing the capability suffix", (apiModelId) => {
        expect(pricingModelPart(`novita:${apiModelId}:text.generate`)).toEqual({
            providerSlug: "novita",
            apiModelId,
        });
    });

    it("parses standard model keys", () => {
        expect(pricingModelPart("openai:openai/gpt-5:text.generate")).toEqual({
            providerSlug: "openai",
            apiModelId: "openai/gpt-5",
        });
    });
});

describe("validateJsonPricingRules", () => {
    const baseRule = {
        model_key: "anthropic:anthropic/claude-3-opus:text.generate",
        capability_id: "text.generate",
        pricing_plan: "batch",
        meter: "output_text_tokens",
        unit: "token",
        unit_size: 1_000_000,
        currency: "USD",
        match: [],
        priority: 100,
    };

    it("accepts multiple meters on one offer", () => {
        expect(() => validateJsonPricingRules([
            { ...baseRule, source_key: "input", meter: "input_text_tokens", price_per_unit: 7.5 },
            { ...baseRule, source_key: "output", price_per_unit: 37.5 },
        ])).not.toThrow();
    });

    it("rejects two prices for the same offer and meter", () => {
        expect(() => validateJsonPricingRules([
            { ...baseRule, source_key: "wrong", price_per_unit: 2 },
            { ...baseRule, source_key: "correct", price_per_unit: 37.5 },
        ])).toThrow("Conflicting JSON pricing rates");
    });

    it("rejects conflicting included quantities for the same offer and meter", () => {
        expect(() => validateJsonPricingRules([
            { ...baseRule, source_key: "five-free", price_per_unit: 0.04, included_quantity: 5 },
            { ...baseRule, source_key: "no-allowance", price_per_unit: 0.04, included_quantity: 0 },
        ])).toThrow("Conflicting JSON pricing rates");
    });
});

describe("v2PricingMeterMetadata", () => {
    it("preserves an authored included quantity for pricing imports", () => {
        expect(v2PricingMeterMetadata({
            rule_id: "minimax-h3-input-images",
            included_quantity: 5,
        })).toEqual(expect.objectContaining({
            source: "json",
            included_quantity: 5,
        }));
    });

    it("does not invent an allowance when none is authored", () => {
        expect(v2PricingMeterMetadata({ rule_id: "meter-without-allowance" }))
            .not.toHaveProperty("included_quantity");
    });
});

describe("preflightV2Models", () => {
    it("accepts a canonical stealth model without a legacy alias", () => {
        const model = {
            model_id: "stealth/ox-alpha",
            organisation_id: "stealth",
            name: "Stealth Ox Alpha",
        };

        const result = preflightV2Models([model], new Map());

        expect(result.models).toEqual([model]);
        expect(result.modelSlugAliases.size).toBe(0);
        expect(result.issues).toEqual([]);
    });

    it("canonicalizes authored legacy aliases without mutating the legacy row", () => {
        const legacyRow = {
            model_id: "nousresearch/hermes-3-llama-3.1-405b",
            organisation_id: "nous",
            name: "Hermes 3 Llama 3.1 405b",
        };

        const result = preflightV2Models(
            [legacyRow],
            new Map([["nousresearch/hermes-3-llama-3.1-405b", "nous/hermes-3-llama-3.1-405b"]]),
        );

        expect(result.models).toEqual([{ ...legacyRow, model_id: "nous/hermes-3-llama-3.1-405b" }]);
        expect(result.modelSlugAliases.get("nousresearch/hermes-3-llama-3.1-405b")).toBe("nous/hermes-3-llama-3.1-405b");
        expect(result.issues).toEqual([]);
        expect(legacyRow.model_id).toBe("nousresearch/hermes-3-llama-3.1-405b");
    });

    it("excludes an invalid legacy identity and records a deterministic issue", () => {
        const result = preflightV2Models(
            [{ model_id: "unknown/model", organisation_id: "nous" }],
            new Map(),
        );

        expect(result.models).toEqual([]);
        expect(result.issues).toEqual([expect.objectContaining({
            source_type: "v2_model_preflight",
            source_key: "unknown/model",
            issue_code: "unresolved_model_slug_prefix",
        })]);
    });

    it("keeps the canonical row when both legacy and canonical identities exist", () => {
        const canonicalRow = { model_id: "nous/hermes-3-llama-3.1-405b", organisation_id: "nous", name: "Canonical" };
        const legacyRow = { model_id: "nousresearch/hermes-3-llama-3.1-405b", organisation_id: "nous", name: "Legacy" };

        const result = preflightV2Models(
            [canonicalRow, legacyRow],
            new Map([[legacyRow.model_id, canonicalRow.model_id]]),
        );

        expect(result.models).toEqual([canonicalRow]);
        expect(result.issues[0]).toEqual(expect.objectContaining({ issue_code: "canonical_model_duplicate" }));
    });

    it("maps benchmark results through the canonical model identity", () => {
        const result = preflightV2Benchmarks(
            [{ id: "result-1", model_id: "legacy/model", benchmark_id: "arc-agi-3", score: "50" }],
            new Set(["arc-agi-3"]),
            new Set(["nous/model"]),
            (value) => value === "legacy/model" ? "nous/model" : String(value),
        );

        expect(result.rows).toEqual([expect.objectContaining({ result_id: "result-1", model_slug: "nous/model" })]);
        expect(result.issues).toEqual([]);
    });
});
