export {};

/* eslint-disable no-var */
var createAdminClient = jest.fn();
/* eslint-enable no-var */

jest.mock("next/cache", () => ({
	cacheLife: jest.fn(),
	cacheTag: jest.fn(),
}));

jest.mock("@/utils/supabase/admin", () => ({
	createAdminClient: (...args: unknown[]) => createAdminClient(...args),
}));

import { resolveCanonicalModelId } from "./resolveCanonicalModelId";

function createChain(result: { data: unknown; error: unknown }) {
	const query: any = {
		select: jest.fn(() => query),
		eq: jest.fn(() => query),
		or: jest.fn(() => query),
		not: jest.fn(() => query),
		in: jest.fn(async () => result),
		limit: jest.fn(async () => result),
		maybeSingle: jest.fn(async () => result),
	};
	return query;
}

describe("resolveCanonicalModelId", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("does not resolve a public API-model route mapped only to a hidden internal model", async () => {
		const hiddenModels = createChain({ data: [], error: null });
		const aliases = createChain({ data: null, error: null });
		const apiModels = createChain({ data: null, error: null });
		const providerModels = createChain({
			data: [{
				model_id: "internal/hidden-model",
				api_model_id: "provider/public-looking-id",
				provider_api_model_id: "provider:public-looking-id",
				provider_model_slug: "public-looking-id",
			}],
			error: null,
		});

		createAdminClient.mockReturnValue({
			from: jest.fn((table: string) => {
				switch (table) {
					case "data_models": return hiddenModels;
					case "data_api_model_aliases": return aliases;
					case "data_api_models": return apiModels;
					case "data_api_provider_models": return providerModels;
					default: throw new Error(`Unexpected table ${table}`);
				}
			}),
		} as any);

		await expect(resolveCanonicalModelId("provider/public-looking-id", false)).resolves.toEqual({
			requestedModelId: "provider/public-looking-id",
			canonicalModelId: null,
			internalModelId: null,
			source: "unresolved",
		});
		expect(hiddenModels.eq).toHaveBeenCalledWith("hidden", false);
	});
});
