import { describe, expect, it } from "vitest";

import {
    deriveOfferServiceTiers,
    isCurrentPricingSku,
    isCurrentStandardPricingSku,
    isExecutablePricingSku,
    mergeOfferServiceTiers,
    pricingSkuServiceTier,
} from "./models.catalogue";

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
        expect(isCurrentStandardPricingSku({ ...current, service_tier_slug: null }, now)).toBe(true);
        expect(isCurrentStandardPricingSku({ ...current, service_tier_slug: " Standard " }, now)).toBe(true);
        expect(isCurrentStandardPricingSku({ ...current, status: "deprecated" }, now)).toBe(false);
        expect(isCurrentStandardPricingSku({ ...current, service_tier_slug: "batch" }, now)).toBe(false);
        expect(isCurrentStandardPricingSku({ ...current, service_tier_slug: "priority" }, now)).toBe(false);
        expect(isCurrentStandardPricingSku({ ...current, effective_from: "2026-09-23T00:00:00Z" }, now)).toBe(false);
        expect(isCurrentStandardPricingSku({ ...current, effective_to: "2026-09-22T11:59:59Z" }, now)).toBe(false);
    });

    it("applies the same status and window rules to every tier", () => {
        const priority = {
            status: "active",
            service_tier_slug: "priority",
            effective_from: "2026-09-01T00:00:00Z",
            effective_to: null,
        };
        expect(isCurrentPricingSku(priority, now)).toBe(true);
        expect(isCurrentPricingSku({ ...priority, status: "deprecated" }, now)).toBe(false);
        expect(isCurrentPricingSku({ ...priority, effective_from: "2026-09-23T00:00:00Z" }, now)).toBe(false);
        expect(isCurrentPricingSku({ ...priority, effective_to: "2026-09-22T11:59:59Z" }, now)).toBe(false);
        expect(pricingSkuServiceTier(priority)).toBe("priority");
        expect(pricingSkuServiceTier({ service_tier_slug: null })).toBe("standard");
        expect(pricingSkuServiceTier({ service_tier_slug: "  " })).toBe("standard");
        expect(pricingSkuServiceTier({ service_tier_slug: "fast" })).toBe("priority");
    });

    it("treats only current USD SKUs as executable, like loadPriceCard", () => {
        const sku = {
            status: "active",
            currency: "USD",
            effective_from: "2026-09-01T00:00:00Z",
            effective_to: null,
        };
        expect(isExecutablePricingSku(sku, now)).toBe(true);
        expect(isExecutablePricingSku({ ...sku, currency: "EUR" }, now)).toBe(false);
        expect(isExecutablePricingSku({ ...sku, currency: "usd" }, now)).toBe(false);
        expect(isExecutablePricingSku({ ...sku, status: "draft" }, now)).toBe(false);
        expect(isExecutablePricingSku({ ...sku, effective_from: "2026-09-23T00:00:00Z" }, now)).toBe(false);
        expect(isExecutablePricingSku({ ...sku, effective_to: "2026-09-22T11:59:59Z" }, now)).toBe(false);
    });
});

describe("deriveOfferServiceTiers", () => {
    it("reads fast SKUs as the priority plan", () => {
        expect(deriveOfferServiceTiers({ providerId: "openai", skuTiers: ["fast"], capabilityParams: {} })).toEqual(["priority"]);
    });

    it("lists every priced realtime tier in alphabetical order", () => {
        expect(deriveOfferServiceTiers({
            providerId: "openai",
            skuTiers: ["standard", "priority", "flex", "batch"],
            capabilityParams: {},
        })).toEqual(["flex", "priority", "standard"]);
        expect(deriveOfferServiceTiers({
            providerId: "groq",
            skuTiers: ["ultrafast", "standard"],
            capabilityParams: null,
        })).toEqual(["standard", "ultrafast"]);
    });

    it("treats unpriced routes as standard-only", () => {
        expect(deriveOfferServiceTiers({ providerId: "openai", skuTiers: undefined, capabilityParams: {} })).toEqual(["standard"]);
        expect(deriveOfferServiceTiers({ providerId: "openai", skuTiers: [], capabilityParams: {} })).toEqual(["standard"]);
    });

    it("drops standard when every SKU needs an explicit service tier", () => {
        expect(deriveOfferServiceTiers({
            providerId: "openai",
            skuTiers: ["priority", "batch"],
            capabilityParams: {},
        })).toEqual(["priority"]);
        expect(deriveOfferServiceTiers({ providerId: "openai", skuTiers: ["batch"], capabilityParams: {} })).toEqual([]);
    });

    it("hides Mistral priority unless the route declares a service_tier parameter", () => {
        for (const providerId of ["mistral", "mistral-eu"]) {
            expect(deriveOfferServiceTiers({
                providerId,
                skuTiers: ["standard", "priority"],
                capabilityParams: { temperature: {} },
            })).toEqual(["standard"]);
            expect(deriveOfferServiceTiers({
                providerId,
                skuTiers: ["standard", "priority"],
                capabilityParams: { service_tier: { type: "enum" } },
            })).toEqual(["priority", "standard"]);
            expect(deriveOfferServiceTiers({
                providerId,
                skuTiers: ["standard", "priority"],
                capabilityParams: { serviceTier: true },
            })).toEqual(["priority", "standard"]);
        }
        expect(deriveOfferServiceTiers({
            providerId: "openai",
            skuTiers: ["standard", "priority"],
            capabilityParams: {},
        })).toEqual(["priority", "standard"]);
    });

    it("restricts a route catalogued as one tier to that tier", () => {
        const catalogued = (name: string) => ({ service_tier: { provider_catalog: { name, upstream: name } } });
        expect(deriveOfferServiceTiers({
            providerId: "google-vertex",
            skuTiers: ["standard", "priority", "flex"],
            capabilityParams: catalogued("fast"),
        })).toEqual(["priority"]);
        expect(deriveOfferServiceTiers({
            providerId: "google-vertex",
            skuTiers: ["standard", "priority", "flex"],
            capabilityParams: catalogued("flex"),
        })).toEqual(["flex"]);
        expect(deriveOfferServiceTiers({
            providerId: "google-vertex",
            skuTiers: ["standard", "priority"],
            capabilityParams: catalogued("standard"),
        })).toEqual(["standard"]);
        // A catalogued tier without pricing on that tier is not served.
        expect(deriveOfferServiceTiers({
            providerId: "google-vertex",
            skuTiers: ["standard"],
            capabilityParams: catalogued("ultrafast"),
        })).toEqual([]);
        expect(deriveOfferServiceTiers({
            providerId: "google-vertex",
            skuTiers: ["batch"],
            capabilityParams: catalogued("batch"),
        })).toEqual([]);
    });

    it("merges tiers across capabilities as a sorted union", () => {
        expect(mergeOfferServiceTiers(["standard"], ["priority", "standard"], undefined, ["flex"]))
            .toEqual(["flex", "priority", "standard"]);
    });
});
