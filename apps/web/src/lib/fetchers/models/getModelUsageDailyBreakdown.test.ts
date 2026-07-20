const mockFetchPublicWebApi = jest.fn();

jest.mock("@/lib/web-api/client", () => ({
	fetchPublicWebApi: (...args: unknown[]) => mockFetchPublicWebApi(...args),
}));

describe("getModelUsageDailyBreakdown", () => {
	beforeEach(() => jest.clearAllMocks());

	it("uses the cached Worker endpoint with bounded filter query parameters", async () => {
		mockFetchPublicWebApi.mockResolvedValue({ rows: [{
			dayBucket: "2026-07-10", modelId: "poolside/laguna-xs-2.1:free", providerId: "poolside", endpoint: "responses", requests: 75, totalTokens: 78275,
		}] });
		const { getModelUsageDailyBreakdown } = await import("./getModelUsageDailyBreakdown");
		const rows = await getModelUsageDailyBreakdown({ modelId: "poolside/laguna-xs-2.1", providerIds: ["poolside"], days: 30 });
		expect(mockFetchPublicWebApi).toHaveBeenCalledWith("/api/_web/models/poolside%2Flaguna-xs-2.1/usage-daily?provider_ids=poolside&days=30");
		expect(rows[0]).toMatchObject({ modelId: "poolside/laguna-xs-2.1:free", requests: 75, totalTokens: 78275 });
	});
});
