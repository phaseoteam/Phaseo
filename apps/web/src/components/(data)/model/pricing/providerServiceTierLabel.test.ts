import { describe, expect, it } from "vitest";
import { getProviderServiceTierLabel } from "./providerServiceTierLabel";
import { getProviderRoutePresentation } from "./providerRoutePresentation";
import { getServiceTierBadgeText } from "./ServiceTierBadge";
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

describe("getServiceTierBadgeText", () => {
	it("explains a provider's own name for the Fast tier", () => {
		const { label, tooltip } = getServiceTierBadgeText("priority", "Highspeed");
		expect(label).toBe("Highspeed");
		expect(tooltip).toBe(
			"Highspeed is this provider's name for its Fast tier, a faster endpoint for this model. It requires explicit selection in your request or a route dedicated to this tier. It is not selected automatically.",
		);
	});

	it("keeps the plain tooltip when there is no provider name or it matches ours", () => {
		const expected = "Fast requires explicit selection in your request or a route dedicated to this tier. It is not selected automatically.";
		expect(getServiceTierBadgeText("priority").tooltip).toBe(expected);
		expect(getServiceTierBadgeText("priority", "Fast").tooltip).toBe(expected);
		expect(getServiceTierBadgeText("priority", "  ").label).toBe("Fast");
	});
});
