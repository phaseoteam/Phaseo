import {
	aggregateProviderAuditRoutability,
	classifyProviderAuditRoutability,
} from "./providerAuditStatus";

describe("classifyProviderAuditRoutability", () => {
	const now = new Date("2026-05-05T12:00:00.000Z");

	test("classifies active mappings as routable", () => {
		expect(
			classifyProviderAuditRoutability({
				isActiveGateway: true,
				providerStatus: "active",
				providerRoutingStatus: "active",
				modelRoutingStatus: "active",
				capabilityStatus: "active",
				now,
			})
		).toMatchObject({
			key: "active",
			availability: "active",
			isRoutableNow: true,
		});
	});

	test("classifies internal testing capabilities as preview", () => {
		expect(
			classifyProviderAuditRoutability({
				isActiveGateway: true,
				providerStatus: "active",
				providerRoutingStatus: "active",
				modelRoutingStatus: "active",
				capabilityStatus: "internal_testing",
				now,
			})
		).toMatchObject({
			key: "internal_testing",
			availability: "coming_soon",
			isRoutableNow: false,
		});
	});

	test("classifies beta providers as preview-only instead of generic inactive", () => {
		expect(
			classifyProviderAuditRoutability({
				isActiveGateway: true,
				providerStatus: "beta",
				providerRoutingStatus: "active",
				modelRoutingStatus: "active",
				capabilityStatus: "active",
				now,
			})
		).toMatchObject({
			key: "preview_only",
			availability: "coming_soon",
			isRoutableNow: false,
		});
	});

	test("classifies not-ready providers explicitly", () => {
		expect(
			classifyProviderAuditRoutability({
				isActiveGateway: true,
				providerStatus: "not_ready",
				providerRoutingStatus: "active",
				modelRoutingStatus: "active",
				capabilityStatus: "active",
				now,
			})
		).toMatchObject({
			key: "provider_not_ready",
			availability: "inactive",
			isRoutableNow: false,
		});
	});

	test.each([
		["gated", "Gated Access"],
		["access_limited", "Access Limited"],
		["region_limited", "Region Limited"],
		["project_limited", "Project Limited"],
		["paused", "Paused"],
		["soft_blocked", "Soft Blocked"],
	] as const)("classifies %s providers explicitly", (providerStatus, label) => {
		expect(
			classifyProviderAuditRoutability({
				isActiveGateway: true,
				providerStatus,
				providerRoutingStatus: "active",
				modelRoutingStatus: "active",
				capabilityStatus: "active",
				now,
			})
		).toMatchObject({
			key: providerStatus,
			label,
			availability: "inactive",
			isRoutableNow: false,
		});
	});

	test("classifies future effective windows as scheduled", () => {
		expect(
			classifyProviderAuditRoutability({
				isActiveGateway: true,
				capabilityStatus: "active",
				effectiveFrom: "2026-05-06T00:00:00.000Z",
				now,
			})
		).toMatchObject({
			key: "scheduled",
			availability: "coming_soon",
		});
	});

	test("classifies disabled provider routing before capability state", () => {
		expect(
			classifyProviderAuditRoutability({
				isActiveGateway: true,
				providerRoutingStatus: "disabled",
				capabilityStatus: "active",
				now,
			})
		).toMatchObject({
			key: "provider_disabled",
			availability: "inactive",
		});
	});

	test("classifies expired mappings as retired", () => {
		expect(
			classifyProviderAuditRoutability({
				isActiveGateway: true,
				capabilityStatus: "active",
				effectiveTo: "2026-05-04T23:59:59.000Z",
				now,
			})
		).toMatchObject({
			key: "retired",
			availability: "inactive",
		});
	});
});

describe("aggregateProviderAuditRoutability", () => {
	test("prefers active when at least one capability is routable", () => {
		const aggregate = aggregateProviderAuditRoutability([
			{
				capabilityId: "text.generate",
				capabilityStatus: "active",
				routability: classifyProviderAuditRoutability({
					isActiveGateway: true,
					capabilityStatus: "active",
				}),
			},
			{
				capabilityId: "image.generate",
				capabilityStatus: "internal_testing",
				routability: classifyProviderAuditRoutability({
					isActiveGateway: true,
					capabilityStatus: "internal_testing",
				}),
			},
		]);

		expect(aggregate.state.key).toBe("active");
		expect(aggregate.activeCount).toBe(1);
		expect(aggregate.previewCount).toBe(1);
		expect(aggregate.summary).toBe("1 active • 1 preview");
	});

	test("prefers preview over inactive when nothing is routable", () => {
		const aggregate = aggregateProviderAuditRoutability([
			{
				capabilityId: "text.generate",
				capabilityStatus: "internal_testing",
				routability: classifyProviderAuditRoutability({
					isActiveGateway: true,
					capabilityStatus: "internal_testing",
				}),
			},
			{
				capabilityId: "image.generate",
				capabilityStatus: "disabled",
				routability: classifyProviderAuditRoutability({
					isActiveGateway: true,
					capabilityStatus: "disabled",
				}),
			},
		]);

		expect(aggregate.state.key).toBe("internal_testing");
		expect(aggregate.previewCount).toBe(1);
		expect(aggregate.inactiveCount).toBe(1);
	});

	test("prefers preview-only over generic inactive when a provider is beta", () => {
		const aggregate = aggregateProviderAuditRoutability([
			{
				capabilityId: "text.generate",
				capabilityStatus: "active",
				routability: classifyProviderAuditRoutability({
					isActiveGateway: true,
					providerStatus: "beta",
					capabilityStatus: "active",
				}),
			},
			{
				capabilityId: "image.generate",
				capabilityStatus: "disabled",
				routability: classifyProviderAuditRoutability({
					isActiveGateway: true,
					capabilityStatus: "disabled",
				}),
			},
		]);

		expect(aggregate.state.key).toBe("preview_only");
		expect(aggregate.previewCount).toBe(1);
		expect(aggregate.inactiveCount).toBe(1);
	});

	test("prefers access-limited over generic inactive when a provider is gated", () => {
		const aggregate = aggregateProviderAuditRoutability([
			{
				capabilityId: "text.generate",
				capabilityStatus: "active",
				routability: classifyProviderAuditRoutability({
					isActiveGateway: true,
					providerStatus: "access_limited",
					capabilityStatus: "active",
				}),
			},
			{
				capabilityId: "image.generate",
				capabilityStatus: "disabled",
				routability: classifyProviderAuditRoutability({
					isActiveGateway: true,
					capabilityStatus: "disabled",
				}),
			},
		]);

		expect(aggregate.state.key).toBe("access_limited");
		expect(aggregate.inactiveCount).toBe(2);
	});
});
