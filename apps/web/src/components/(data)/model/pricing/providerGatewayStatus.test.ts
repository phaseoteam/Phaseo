import { describe, it, expect } from "vitest";
import {
	chooseGatewayStatus,
	getGatewayStatusSortRank,
	resolveGatewayStatus,
} from "@/components/(data)/model/pricing/providerGatewayStatus";

describe("providerGatewayStatus", () => {
	it("orders active, deranked, coming soon, and inactive states", () => {
		const statuses = [
			"active",
			"deranked",
			"internal_testing",
			"coming_soon",
			"inactive",
			"disabled",
		];

		expect(
			statuses.map((status) => getGatewayStatusSortRank(status)),
		).toEqual([0, 1, 2, 3, 4, 5]);
		// The catalogue's stored value and the former levels all read as the one deranked status.
		expect(["degraded", "deranked_lvl1", "deranked_lvl3"].map((status) => getGatewayStatusSortRank(status))).toEqual([1, 1, 1]);
	});

	it("keeps external catalogue providers distinct from inactive providers", () => {
		expect(
			resolveGatewayStatus({
				isActiveGateway: false,
				providerStatus: "external",
				providerRoutingStatus: "disabled",
				modelRoutingStatus: "active",
				capabilityStatus: "active",
			}),
		).toBe("external");
	});

	it("shows route lifecycle status for an external provider offer", () => {
		expect(
			resolveGatewayStatus({
				isActiveGateway: false,
				providerAvailabilityStatus: "available",
				phaseoStatus: "planned",
				providerStatus: "external",
				providerRoutingStatus: "active",
				modelRoutingStatus: "active",
				capabilityStatus: "active",
			}),
		).toBe("coming_soon");
	});

	it("prefers the best routable status within a provider offer", () => {
		expect(
			chooseGatewayStatus([
				"inactive",
				"internal_testing",
				"deranked",
				"coming_soon",
			]),
		).toBe("deranked");
	});

	it("resolves provider, model and capability deranks before active, only while routing is on", () => {
		const resolve = (overrides: Record<string, unknown>) => resolveGatewayStatus({
			isActiveGateway: true,
			capabilityStatus: "active",
			providerRoutingStatus: "active",
			modelRoutingStatus: "active",
			...overrides,
		});
		expect(resolve({ providerRoutingStatus: "deranked" })).toBe("deranked");
		expect(resolve({ modelRoutingStatus: "degraded" })).toBe("deranked");
		expect(resolve({ capabilityStatus: "degraded" })).toBe("deranked");
		// `degraded` is also stored on routes whose routing is off.
		expect(resolve({ isActiveGateway: false, modelRoutingStatus: "degraded" })).toBe("inactive");
	});

	it("keeps internal testing distinct from generic coming soon", () => {
		expect(
			resolveGatewayStatus({
				isActiveGateway: true,
				capabilityStatus: "internal_testing",
				providerRoutingStatus: "active",
				modelRoutingStatus: "active",
			}),
		).toBe("internal_testing");
	});

	it("uses the explicit provider, Phaseo, and access statuses", () => {
		expect(
			resolveGatewayStatus({
				isActiveGateway: false,
				providerAvailabilityStatus: "coming_soon",
				phaseoStatus: "planned",
				accessScope: "public",
				providerRoutingStatus: "active",
				modelRoutingStatus: "disabled",
			}),
		).toBe("coming_soon");

		expect(
			resolveGatewayStatus({
				isActiveGateway: false,
				providerAvailabilityStatus: "available",
				phaseoStatus: "implementing",
				accessScope: "public",
			}),
		).toBe("coming_soon");

		expect(
			resolveGatewayStatus({
				isActiveGateway: false,
				providerAvailabilityStatus: "available",
				phaseoStatus: "testing",
				accessScope: "internal",
			}),
		).toBe("internal_testing");

		expect(
			resolveGatewayStatus({
				isActiveGateway: false,
				providerAvailabilityStatus: "removed",
				phaseoStatus: "enabled",
				accessScope: "public",
			}),
		).toBe("inactive");
	});
});
