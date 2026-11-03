import { revalidatePath, updateTag } from "next/cache";
import { fetchInternalAuthStatus } from "@/lib/fetchers/internal/fetchInternalAuthStatus";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchInternalWebApi } from "@/lib/web-api/client";
import { purgeCacheScopeAction, revalidateModelScopeAction, revalidatePublicModelCatalogueAction } from "@/app/[locale]/(dashboard)/internal/cache/actions";
import { revalidateSingleModelAllAction, revalidateSingleModelApiInfoAction, revalidateSingleModelDataAction } from "@/app/(dashboard)/internal/data/actions";

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
	const input = { scope: "model" as const, targetId: modelId };

	beforeEach(() => {
		jest.resetAllMocks();
		jest.mocked(fetchInternalAuthStatus).mockResolvedValue({ signedIn: true, isAdmin: true } as Awaited<ReturnType<typeof fetchInternalAuthStatus>>);
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
		expect(revalidatePath).toHaveBeenCalledWith(`/models/${modelId}`, "layout");
	});

	it("does not rebuild the website from stale Worker data when the purge fails", async () => {
		jest.mocked(fetchInternalWebApi).mockRejectedValue(new Error("Worker purge failed"));
		await expect(purgeCacheScopeAction(input)).rejects.toThrow("Worker purge failed");
		expect(updateTag).not.toHaveBeenCalled();
		expect(revalidatePath).not.toHaveBeenCalled();
	});

	it.each([
		["model-info", "frontend:model-overview"],
		["model-providers", "frontend:model-pricing"],
		["model-telemetry", "frontend:model-runtime-stats"],
	] as const)("refreshes the %s section after its Worker purge", async (scope, tag) => {
		jest.mocked(fetchInternalWebApi).mockResolvedValue({ success: true, scope, targetId: modelId } as never);
		await purgeCacheScopeAction({ scope, targetId: modelId });
		expect(updateTag).toHaveBeenCalledWith(tag);
		expect(revalidatePath).toHaveBeenCalledWith(`/models/${modelId}`);
		expect(updateTag).not.toHaveBeenCalledWith("public-model-catalogue");
	});

	it("requires an authenticated admin session before requesting a purge", async () => {
		jest.mocked(getServerAccountContext).mockResolvedValue({ accessToken: null } as Awaited<ReturnType<typeof getServerAccountContext>>);
		await expect(purgeCacheScopeAction(input)).rejects.toThrow("Sign in again");
		expect(fetchInternalWebApi).not.toHaveBeenCalled();
		expect(revalidatePath).not.toHaveBeenCalled();
	});

	it("keeps local and gateway invalidation when the Worker purge fails", async () => {
		jest.mocked(fetchInternalWebApi).mockRejectedValue(new Error("Worker purge failed"));
		const previousGatewayToken = process.env.GATEWAY_INTERNAL_TEST_TOKEN;
		process.env.GATEWAY_INTERNAL_TEST_TOKEN = "test-gateway-token";
		const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);

		try {
			const result = await revalidatePublicModelCatalogueAction();

			expect(result.ok).toBe(false);
			expect(result.message).toContain("Web API cache purge failed: Worker purge failed.");
			expect(updateTag).toHaveBeenCalledWith("public-model-catalogue");
			expect(revalidatePath).toHaveBeenCalledWith("/chat");
			expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/internal/cache/purge"), expect.objectContaining({ body: JSON.stringify({ tags: ["models"] }) }));
		} finally {
			fetchMock.mockRestore();
			if (previousGatewayToken === undefined) delete process.env.GATEWAY_INTERNAL_TEST_TOKEN;
			else process.env.GATEWAY_INTERNAL_TEST_TOKEN = previousGatewayToken;
		}
	});
});

describe("cache actions admin guard", () => {
	beforeEach(() => {
		jest.resetAllMocks();
		jest.mocked(getServerAccountContext).mockResolvedValue({ accessToken: "test-session" } as Awaited<ReturnType<typeof getServerAccountContext>>);
	});

	it.each([
		["anonymous", { signedIn: false, isAdmin: false }],
		["signed-in non-admin", { signedIn: true, isAdmin: false }],
	])("rejects a %s model scope revalidation before touching any cache", async (_label, status) => {
		jest.mocked(fetchInternalAuthStatus).mockResolvedValue(status as Awaited<ReturnType<typeof fetchInternalAuthStatus>>);

		for (const scope of ["data", "api", "all"] as const) {
			const result = await revalidateModelScopeAction({ modelId: "openai/gpt-6", scope });
			expect(result).toEqual({ ok: false, message: "Model (openai/gpt-6) failed: Unauthorized" });
		}

		expect(revalidateSingleModelDataAction).not.toHaveBeenCalled();
		expect(revalidateSingleModelApiInfoAction).not.toHaveBeenCalled();
		expect(revalidateSingleModelAllAction).not.toHaveBeenCalled();
		expect(updateTag).not.toHaveBeenCalled();
		expect(revalidatePath).not.toHaveBeenCalled();
	});

	it("rejects a non-admin purge before calling the Worker", async () => {
		jest.mocked(fetchInternalAuthStatus).mockResolvedValue({ signedIn: true, isAdmin: false } as Awaited<ReturnType<typeof fetchInternalAuthStatus>>);
		await expect(purgeCacheScopeAction({ scope: "model", targetId: "openai/gpt-6" })).rejects.toThrow("Unauthorized");
		expect(fetchInternalWebApi).not.toHaveBeenCalled();
		expect(updateTag).not.toHaveBeenCalled();
		expect(revalidatePath).not.toHaveBeenCalled();
	});

	it("runs the model scope revalidation for an admin", async () => {
		jest.mocked(fetchInternalAuthStatus).mockResolvedValue({ signedIn: true, isAdmin: true } as Awaited<ReturnType<typeof fetchInternalAuthStatus>>);
		jest.mocked(revalidateSingleModelDataAction).mockResolvedValue({ ok: true, message: "Model data cache revalidated." });
		await expect(revalidateModelScopeAction({ modelId: "openai/gpt-6", scope: "data" })).resolves.toEqual({ ok: true, message: "Model data cache revalidated." });
		expect(revalidateSingleModelDataAction).toHaveBeenCalledWith("openai/gpt-6");
	});
});
