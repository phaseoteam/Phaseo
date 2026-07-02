import {
	chooseGatewayStatus,
	getGatewayStatusSortRank,
	resolveGatewayStatus,
} from "@/components/(data)/model/pricing/providerGatewayStatus";

describe("providerGatewayStatus", () => {
	it("orders active, deranked levels, coming soon, and inactive states", () => {
		const statuses = [
			"active",
			"deranked_lvl1",
			"deranked_lvl2",
			"deranked_lvl3",
			"internal_testing",
			"coming_soon",
			"inactive",
			"disabled",
		];

		expect(
			statuses.map((status) => getGatewayStatusSortRank(status)),
		).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
	});

	it("prefers the best routable status within a provider offer", () => {
		expect(
			chooseGatewayStatus([
				"inactive",
				"internal_testing",
				"deranked_lvl2",
				"coming_soon",
			]),
		).toBe("deranked_lvl2");
	});

	it("resolves provider and model routing deranks before active", () => {
		expect(
			resolveGatewayStatus({
				isActiveGateway: true,
				capabilityStatus: "active",
				providerRoutingStatus: "deranked_lvl1",
				modelRoutingStatus: "active",
			}),
		).toBe("deranked_lvl1");

		expect(
			resolveGatewayStatus({
				isActiveGateway: true,
				capabilityStatus: "active",
				providerRoutingStatus: "active",
				modelRoutingStatus: "deranked_lvl3",
			}),
		).toBe("deranked_lvl3");
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
});
