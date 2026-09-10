import { revalidatePath, updateTag } from "next/cache";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchInternalWebApi } from "@/lib/web-api/client";
import { purgeCacheScopeAction } from "./actions";

jest.mock("next/cache", () => ({ revalidatePath: jest.fn(), updateTag: jest.fn() }));
jest.mock("@/lib/fetchers/internal/serverAccountContext", () => ({ getServerAccountContext: jest.fn() }));
jest.mock("@/lib/fetchers/internal/fetchInternalAuthStatus", () => ({ fetchInternalAuthStatus: jest.fn() }));
jest.mock("@/lib/web-api/client", () => ({ fetchInternalWebApi: jest.fn() }));
jest.mock("@/app/(dashboard)/internal/data/actions", () => ({
	revalidateSingleModelAllAction: jest.fn(),
	revalidateSingleModelApiInfoAction: jest.fn(),
	revalidateSingleModelDataAction: jest.fn(),
}));

describe("complete model page revalidation", () => {
	const modelId = "deepseek/deepseek-v4.1-flash";
	const input = { scope: "model" as const, targetId: modelId, bumpBrowserGeneration: true };

	beforeEach(() => {
		jest.resetAllMocks();
		jest.mocked(getServerAccountContext).mockResolvedValue({ accessToken: "test-session" } as Awaited<ReturnType<typeof getServerAccountContext>>);
	});

	it("expires every model section and the rendered page after the Worker purge", async () => {
		jest.mocked(fetchInternalWebApi).mockImplementation(async () => {
			expect(updateTag).not.toHaveBeenCalled();
			expect(revalidatePath).not.toHaveBeenCalled();
			return { success: true, scope: "model", targetId: modelId } as never;
		});

		await purgeCacheScopeAction(input);

		expect(fetchInternalWebApi).toHaveBeenCalledWith("/api/internal/cache/purge", "test-session", {
			method: "POST", body: JSON.stringify(input),
		});
		for (const section of [
			"header", "overview", "gateway-metadata", "availability", "pricing",
			"pricing-history", "performance", "benchmarks", "timeline", "apps",
			"subscription-plans", "routing-health", "usage-daily", "realtime-window",
		]) {
			expect(updateTag).toHaveBeenCalledWith(`frontend:model-${section}`);
		}
		expect(updateTag).toHaveBeenCalledWith(`model:api:${modelId}`);
		expect(updateTag).toHaveBeenCalledWith("public-model-catalogue");
		expect(revalidatePath).toHaveBeenCalledWith(`/models/${modelId}`);
	});

	it("does not rebuild the website from stale Worker data when the purge fails", async () => {
		jest.mocked(fetchInternalWebApi).mockRejectedValue(new Error("Worker purge failed"));
		await expect(purgeCacheScopeAction(input)).rejects.toThrow("Worker purge failed");
		expect(updateTag).not.toHaveBeenCalled();
		expect(revalidatePath).not.toHaveBeenCalled();
	});

	it("requires an authenticated admin session before requesting a purge", async () => {
		jest.mocked(getServerAccountContext).mockResolvedValue({ accessToken: null } as Awaited<ReturnType<typeof getServerAccountContext>>);
		await expect(purgeCacheScopeAction(input)).rejects.toThrow("Sign in again");
		expect(fetchInternalWebApi).not.toHaveBeenCalled();
		expect(revalidatePath).not.toHaveBeenCalled();
	});
});
