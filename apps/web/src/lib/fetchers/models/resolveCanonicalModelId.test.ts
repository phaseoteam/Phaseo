const mockFetchPublicWebApi = jest.fn();

jest.mock("next/cache", () => ({
	cacheLife: jest.fn(),
	cacheTag: jest.fn(),
}));

jest.mock("@/lib/web-api/client", () => ({
	fetchPublicWebApi: (...args: unknown[]) => mockFetchPublicWebApi(...args),
}));

import { resolveCanonicalModelId } from "./resolveCanonicalModelId";

describe("resolveCanonicalModelId", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("does not resolve a public API-model route mapped only to a hidden internal model", async () => {
		mockFetchPublicWebApi.mockResolvedValue({
			resolution: {
				requestedModelId: "provider/public-looking-id",
				canonicalModelId: null,
				internalModelId: null,
				source: "unresolved",
			},
		});

		await expect(resolveCanonicalModelId("provider/public-looking-id", false)).resolves.toEqual({
			requestedModelId: "provider/public-looking-id",
			canonicalModelId: null,
			internalModelId: null,
			source: "unresolved",
		});
		expect(mockFetchPublicWebApi).toHaveBeenCalledWith(
			"/api/_web/models/provider%2Fpublic-looking-id/canonical",
		);
	});
});
