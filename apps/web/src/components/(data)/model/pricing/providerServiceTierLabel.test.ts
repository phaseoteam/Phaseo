import { describe, expect, it } from "vitest";
import { getProviderServiceTierLabel } from "./providerServiceTierLabel";
import { getProviderRoutePresentation } from "./providerRoutePresentation";
import type { ProviderInfo } from "@/lib/fetchers/models/getModelPricing";

describe("getProviderServiceTierLabel", () => {
	it("returns the provider's own name for a tier", () => {
		expect(getProviderServiceTierLabel({ priority: "Highspeed" }, "priority")).toBe("Highspeed");
		expect(getProviderServiceTierLabel({ priority: "Highspeed" }, " Priority ")).toBe("Highspeed");
	});

	it("treats fast and priority as the same tier", () => {
		expect(getProviderServiceTierLabel({ priority: "Highspeed" }, "fast")).toBe("Highspeed");
		expect(getProviderServiceTierLabel({ fast: "Turbo" }, "priority")).toBe("Turbo");
	});

	it("falls back when the provider has no name for the tier", () => {
		expect(getProviderServiceTierLabel(null, "priority")).toBeNull();
		expect(getProviderServiceTierLabel({ priority: "Highspeed" }, "flex")).toBeNull();
		expect(getProviderServiceTierLabel({ priority: "  " }, "priority")).toBeNull();
	});
});

describe("getProviderRoutePresentation", () => {
	const provider = { api_provider_id: "moonshotai", api_provider_name: "Moonshot AI" } as ProviderInfo;

	it("uses the provider's tier name, else the generic one", () => {
		expect(getProviderRoutePresentation({ ...provider, service_tier_labels: { priority: "Highspeed" } }, "priority").tier).toBe("Highspeed");
		expect(getProviderRoutePresentation(provider, "priority").tier).toBe("Fast");
		expect(getProviderRoutePresentation(provider, "standard").tier).toBeNull();
	});
});
