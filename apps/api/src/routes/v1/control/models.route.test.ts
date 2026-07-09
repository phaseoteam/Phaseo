import { beforeEach, describe, expect, it, vi } from "vitest";

const guardAuthMock = vi.fn();
const fetchCatalogueMock = vi.fn();
const fetchGatewayContextMock = vi.fn();

vi.mock("@pipeline/before/guards", () => ({
	guardAuth: (...args: any[]) => guardAuthMock(...args),
}));

vi.mock("./models.catalogue", () => ({
	fetchCatalogue: (...args: any[]) => fetchCatalogueMock(...args),
}));

vi.mock("@pipeline/before/context", () => ({
	fetchGatewayContext: (...args: any[]) => fetchGatewayContextMock(...args),
}));

import { handleModels } from "./models";

describe("handleModels", () => {
	beforeEach(() => {
		guardAuthMock.mockReset();
		fetchCatalogueMock.mockReset();
		fetchGatewayContextMock.mockReset();
		guardAuthMock.mockResolvedValue({
			ok: true,
			value: {
				workspaceId: "ws_test",
				apiKeyId: "key_test",
			},
		});
		fetchCatalogueMock.mockResolvedValue([]);
		fetchGatewayContextMock.mockResolvedValue({
			resolvedModel: "phaseo/free",
			providers: [],
			pricing: {},
		});
	});

	it("forwards documented model filters into fetchCatalogue", async () => {
		const response = await handleModels(
			new Request(
				"https://api.example.com/v1/control/models" +
					"?provider=openai" +
					"&provider_status=beta" +
					"&provider_routing_status=disabled" +
					"&model_routing_status=deranked_lvl1" +
					"&capability_status=coming_soon" +
					"&status=active" +
					"&provider_availability_status=coming_soon" +
					"&provider_availability_reason=scheduled" +
					"&availability=all"
			),
			"shared"
		);

		expect(response.status).toBe(200);
		expect(fetchCatalogueMock).toHaveBeenCalledWith({
			availability: "all",
			endpoints: [],
			providerIds: ["openai"],
			providerStatuses: ["beta"],
			providerRoutingStatuses: ["disabled"],
			modelRoutingStatuses: ["deranked_lvl1"],
			capabilityStatuses: ["coming_soon"],
			organisationIds: [],
			inputTypes: [],
			outputTypes: [],
			params: [],
			statuses: ["active"],
			providerAvailabilityStatuses: ["coming_soon"],
			providerAvailabilityReasons: ["scheduled"],
		});
	});
});
