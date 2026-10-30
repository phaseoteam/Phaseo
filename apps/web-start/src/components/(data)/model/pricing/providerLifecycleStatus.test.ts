import { summarizeProviderLifecycle } from "./providerLifecycleStatus";

describe("summarizeProviderLifecycle", () => {
	it("keeps provider availability, Phaseo readiness, and access separate", () => {
		expect(
			summarizeProviderLifecycle([
				{
					provider_availability_status: "available",
					phaseo_status: "testing",
					access_scope: "internal",
				},
			]),
		).toMatchObject({
			providerAvailability: { key: "available", label: "Available" },
			phaseo: { key: "testing", label: "Testing" },
			accessScope: "internal",
		});
	});

	it("uses the best visible route when a provider has several capabilities", () => {
		expect(
			summarizeProviderLifecycle([
				{
					provider_availability_status: "coming_soon",
					phaseo_status: "planned",
					access_scope: "public",
				},
				{
					provider_availability_status: "preview",
					phaseo_status: "enabled",
					access_scope: "public",
				},
			]),
		).toMatchObject({
			providerAvailability: { key: "preview" },
			phaseo: { key: "enabled" },
			accessScope: "public",
		});
	});
});
