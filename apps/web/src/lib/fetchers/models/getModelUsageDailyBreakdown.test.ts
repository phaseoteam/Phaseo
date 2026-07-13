const mockCreateAdminClient = jest.fn();

jest.mock("next/cache", () => ({
	cacheLife: jest.fn(),
	cacheTag: jest.fn(),
}));

jest.mock("@/utils/supabase/admin", () => ({
	createAdminClient: (...args: unknown[]) => mockCreateAdminClient(...args),
}));

function createQueryResult(data: unknown[] = []) {
	return {
		select: jest.fn(() => ({
			in: jest.fn(async () => ({ data, error: null })),
		})),
	};
}

describe("getModelUsageDailyBreakdown", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("expands provider api model ids so base model pages include free-router activity", async () => {
		const providerModelRows = [
			{
				model_id: "poolside/laguna-xs-2.1",
				api_model_id: "poolside/laguna-xs-2.1:free",
				provider_model_slug: "poolside/laguna-xs-2.1",
			},
		];
		const fromMock = jest.fn((table: string) => {
			if (table === "data_api_provider_models") {
				return createQueryResult(providerModelRows);
			}
			if (table === "data_api_model_aliases") {
				return createQueryResult([]);
			}
			throw new Error(`Unexpected table ${table}`);
		});
		const rpcMock = jest.fn(async () => ({
			data: [
				{
					day_bucket: "2026-07-10",
					model_id: "poolside/laguna-xs-2.1:free",
					provider_id: "poolside",
					endpoint: "responses",
					requests: 75,
					success_requests: 75,
					failed_requests: 0,
					neutral_requests: 0,
					rate_limited_requests: 0,
					total_tokens: 78275,
				},
			],
			error: null,
		}));

		mockCreateAdminClient.mockReturnValue({
			from: fromMock,
			rpc: rpcMock,
		});

		const { getModelUsageDailyBreakdown } = await import(
			"./getModelUsageDailyBreakdown"
		);

		const rows = await getModelUsageDailyBreakdown({
			modelId: "poolside/laguna-xs-2.1",
			days: 30,
		});

		expect(rpcMock).toHaveBeenCalledWith(
			"get_model_usage_daily_breakdown",
			expect.objectContaining({
				p_model_ids: expect.arrayContaining([
					"poolside/laguna-xs-2.1",
					"poolside/laguna-xs-2.1:free",
				]),
			}),
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			modelId: "poolside/laguna-xs-2.1:free",
			requests: 75,
			totalTokens: 78275,
		});
	});
});
