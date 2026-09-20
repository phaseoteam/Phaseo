import { getProviderListingCategory, getProviderRoutePresentation, isProviderRouteVariant } from "./providerRoutePresentation";
import { resolveGatewayStatus } from "./providerGatewayStatus";

const openai = { api_provider_id: "openai", api_provider_name: "OpenAI" };

describe("provider listing categories", () => {
    it.each(["planned", "implementing", "testing", "enabled"])("keeps external %s offers in the external category", phaseoStatus => {
        const provider = { api_provider_id: "catalogue", api_provider_name: "Catalogue", status: "external" };
        const lifecycleStatus = resolveGatewayStatus({
            isActiveGateway: false,
            providerStatus: provider.status,
            phaseoStatus,
        });
        expect(getProviderListingCategory(provider, lifecycleStatus)).toBe("external");
    });

    it("preserves lifecycle categories for integrated providers", () => {
        expect(getProviderListingCategory(openai, "coming_soon")).toBe("preview");
        expect(getProviderListingCategory(openai, "internal_testing")).toBe("preview");
        expect(getProviderListingCategory(openai, "deranked_lvl1")).toBe("routable");
        expect(getProviderListingCategory(openai, "inactive")).toBe("inactive");
    });
});

describe("provider route presentation", () => {
    it("does not use provider headquarters as a routing region", () => {
        expect(getProviderRoutePresentation({ ...openai, country_code: "US" })).toEqual({ name: "OpenAI", region: null, tier: null });
        expect(isProviderRouteVariant(openai, "standard")).toBe(false);
        expect(isProviderRouteVariant(openai, "free")).toBe(false);
    });

    it("separates regional labels from provider names and supports combined tiers", () => {
        const provider = { ...openai, api_provider_id: "openai-eu", offer_label: "EU", offer_scope: "regional" as const };
        expect(getProviderRoutePresentation(provider, "priority")).toEqual({ name: "OpenAI", region: "eu", tier: "Fast" });
        expect(isProviderRouteVariant(provider, "standard")).toBe(true);
    });

    it("keeps the AWS provider identity when removing the US suffix", () => {
        expect(getProviderRoutePresentation({ api_provider_id: "anthropic-aws-us", api_provider_name: "Anthropic AWS US", offer_label: "AWS US", offer_scope: "regional" })).toEqual({ name: "Claude Platform for AWS", region: "us", tier: null });
    });

    it("preserves unknown regional labels rather than inventing a region code", () => {
        const provider = { ...openai, api_provider_id: "example-region", offer_label: "Asia Pacific", offer_scope: "regional" as const };
        expect(getProviderRoutePresentation(provider).name).toContain("Asia Pacific");
        expect(getProviderRoutePresentation(provider).region).toBeNull();
        expect(isProviderRouteVariant(provider, "standard")).toBe(true);
    });

    it.each(["flex", "priority", "batch"])("separates the %s tier", plan => {
        expect(isProviderRouteVariant(openai, plan)).toBe(true);
        expect(getProviderRoutePresentation(openai, plan).tier).toBeTruthy();
    });
});
