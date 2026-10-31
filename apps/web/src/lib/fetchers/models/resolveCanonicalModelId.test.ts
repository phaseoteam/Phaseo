import { describe, it, expect, beforeEach, vi } from "vitest";
const mockFetchPublicWebApi = vi.fn();

vi.mock("@/lib/web-api/client", () => ({
	fetchPublicWebApi: (...args: unknown[]) => mockFetchPublicWebApi(...args),
}));

import { resolveCanonicalModelId } from "@/lib/fetchers/models/resolveCanonicalModelId";

describe("resolveCanonicalModelId", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("does not resolve a public API-model route mapped only to a hidden internal model", async () => {
		mockFetchPublicWebApi.mockResolvedValueOnce({
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
		expect(mockFetchPublicWebApi).toHaveBeenCalledTimes(1);
	});
});
