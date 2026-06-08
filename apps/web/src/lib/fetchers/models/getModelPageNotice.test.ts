export {};

var createClient = jest.fn();
var isFreeRouterModelId = jest.fn();
var applyHiddenFilter = jest.fn((query) => query);

jest.mock("next/cache", () => ({
	cacheLife: jest.fn(),
	cacheTag: jest.fn(),
}));

jest.mock("@/utils/supabase/client", () => ({
	createClient: (...args: unknown[]) => createClient(...args),
}));

jest.mock("@/lib/models/freeRouter", () => ({
	isFreeRouterModelId: (...args: unknown[]) => isFreeRouterModelId(...args),
}));

jest.mock("./visibility", () => ({
	applyHiddenFilter: (...args: unknown[]) => applyHiddenFilter(...args),
}));

import {
	parseModelPageNoticeRow,
	resolveApiModelIdForModelPageUncached,
} from "./getModelPageNotice";

function createMaybeSingleQuery(result: { data: any; error: any }) {
	const query: any = {
		select: jest.fn(() => query),
		eq: jest.fn(() => query),
		not: jest.fn(() => query),
		limit: jest.fn(async () => ({ data: [], error: null })),
		maybeSingle: jest.fn(async () => result),
	};
	return query;
}

function createProviderQuery(result: { data: any; error: any }) {
	const query: any = {
		select: jest.fn(() => query),
		eq: jest.fn(() => query),
		not: jest.fn(() => query),
		limit: jest.fn(async () => result),
	};
	return query;
}

describe("parseModelPageNoticeRow", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		isFreeRouterModelId.mockReturnValue(false);
	});

	it("parses a valid notice row", () => {
		expect(
			parseModelPageNoticeRow({
				api_model_id: "openai/gpt-5",
				tone: "warning",
				markdown: "This **model** has limited availability.",
			}),
		).toEqual({
			apiModelId: "openai/gpt-5",
			tone: "warning",
			markdown: "This **model** has limited availability.",
		});
	});

	it("trims the markdown and rejects empty values", () => {
		expect(
			parseModelPageNoticeRow({
				api_model_id: "openai/gpt-5",
				tone: "info",
				markdown: "   ",
			}),
		).toBeNull();
	});

	it("rejects invalid tone values", () => {
		expect(
			parseModelPageNoticeRow({
				api_model_id: "openai/gpt-5",
				tone: "notice",
				markdown: "Heads up",
			}),
		).toBeNull();
	});
});

describe("resolveApiModelIdForModelPageUncached", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		isFreeRouterModelId.mockReturnValue(false);
	});

	it("falls back to the internal model id when the data_models row exists without an api_model_id", async () => {
		const apiModelsQuery = createMaybeSingleQuery({ data: null, error: null });
		const aliasesQuery = createMaybeSingleQuery({ data: null, error: null });
		const internalModelsQuery = createMaybeSingleQuery({
			data: { api_model_id: null },
			error: null,
		});
		const providerModelsQuery = createProviderQuery({ data: [], error: null });

		createClient.mockResolvedValue({
			from: jest.fn((table: string) => {
				switch (table) {
					case "data_api_models":
						return apiModelsQuery;
					case "data_api_model_aliases":
						return aliasesQuery;
					case "data_models":
						return internalModelsQuery;
					case "data_api_provider_models":
						return providerModelsQuery;
					default:
						throw new Error(`Unexpected table ${table}`);
				}
			}),
		} as any);

		await expect(
			resolveApiModelIdForModelPageUncached("anthropic/claude-opus-4.1", false),
		).resolves.toBe("anthropic/claude-opus-4.1");
		expect(applyHiddenFilter).toHaveBeenCalledWith(internalModelsQuery, false);
	});
});
