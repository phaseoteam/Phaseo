import { describe, it, expect, beforeEach, vi } from "vitest";
import { fetchInternalAuthStatus } from "@/lib/fetchers/internal/fetchInternalAuthStatus";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchInternalWebApi } from "@/lib/web-api/client";
import { purgeCacheScopeAction, revalidatePublicModelCatalogueAction } from "@/features/internal/cache/actions";

vi.mock("@/lib/fetchers/internal/serverAccountContext", () => ({ getServerAccountContext: vi.fn() }));
vi.mock("@/lib/fetchers/internal/fetchInternalAuthStatus", () => ({ fetchInternalAuthStatus: vi.fn() }));
vi.mock("@/lib/web-api/client", () => ({ fetchInternalWebApi: vi.fn() }));
vi.mock("@/features/internal/data/actions", () => ({
	revalidateSingleModelAllAction: vi.fn(),
	revalidateSingleModelApiInfoAction: vi.fn(),
	revalidateSingleModelDataAction: vi.fn(),
}));

// The serverAction middleware logs the real error and sends the browser a generic one.
async function expectActionFailure(run: () => Promise<unknown>, message: string) {
	const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
	try {
		await expect(run()).rejects.toThrow("Server action failed");
		expect(log).toHaveBeenCalledWith(expect.stringContaining("[server-action]"), expect.objectContaining({ message: expect.stringContaining(message) }));
	} finally {
		log.mockRestore();
	}
}

// The website keeps no server-side data cache, so a purge is only the Worker
// request; the browser re-reads page data after the mutation.
describe("complete model page revalidation", () => {
	const modelId = "deepseek/deepseek-v4.1-flash";
	const input = { scope: "model" as const, targetId: modelId };

	beforeEach(() => {
		vi.resetAllMocks();
		vi.mocked(fetchInternalAuthStatus).mockResolvedValue({ signedIn: true, isAdmin: true } as Awaited<ReturnType<typeof fetchInternalAuthStatus>>);
		vi.mocked(getServerAccountContext).mockResolvedValue({ accessToken: "test-session" } as Awaited<ReturnType<typeof getServerAccountContext>>);
	});

	it("sends the purge to the Worker with the admin session", async () => {
		vi.mocked(fetchInternalWebApi).mockResolvedValue({ success: true, scope: "model", targetId: modelId } as never);

		await expect(purgeCacheScopeAction({ data: input })).resolves.toMatchObject({ success: true, scope: "model", targetId: modelId });

		expect(fetchInternalWebApi).toHaveBeenCalledWith("/api/internal/cache/purge", "test-session", {
			method: "POST", body: JSON.stringify(input),
		});
	});

	it("reports a failed Worker purge", async () => {
		vi.mocked(fetchInternalWebApi).mockRejectedValue(new Error("Worker purge failed"));
		await expectActionFailure(() => purgeCacheScopeAction({ data: input }), "Worker purge failed");
	});

	it.each(["model-info", "model-providers", "model-telemetry"] as const)("purges the %s section", async (scope) => {
		vi.mocked(fetchInternalWebApi).mockResolvedValue({ success: true, scope, targetId: modelId } as never);
		await purgeCacheScopeAction({ data: { scope, targetId: modelId } });
		expect(fetchInternalWebApi).toHaveBeenCalledWith("/api/internal/cache/purge", "test-session", {
			method: "POST", body: JSON.stringify({ scope, targetId: modelId }),
		});
	});

	it("requires an authenticated admin session before requesting a purge", async () => {
		vi.mocked(getServerAccountContext).mockResolvedValue({ accessToken: null } as Awaited<ReturnType<typeof getServerAccountContext>>);
		await expectActionFailure(() => purgeCacheScopeAction({ data: input }), "Sign in again");
		expect(fetchInternalWebApi).not.toHaveBeenCalled();
	});

	it("keeps gateway invalidation when the Worker purge fails", async () => {
		vi.mocked(fetchInternalWebApi).mockRejectedValue(new Error("Worker purge failed"));
		const previousGatewayToken = process.env.GATEWAY_INTERNAL_TEST_TOKEN;
		process.env.GATEWAY_INTERNAL_TEST_TOKEN = "test-gateway-token";
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
		const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

		try {
			const result = await revalidatePublicModelCatalogueAction();

			expect(result.ok).toBe(false);
			expect(result.message).toContain("Web API cache purge failed: Server action failed.");
			expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/internal/cache/purge"), expect.objectContaining({ body: JSON.stringify({ tags: ["models"] }) }));
		} finally {
			log.mockRestore();
			fetchMock.mockRestore();
			if (previousGatewayToken === undefined) delete process.env.GATEWAY_INTERNAL_TEST_TOKEN;
			else process.env.GATEWAY_INTERNAL_TEST_TOKEN = previousGatewayToken;
		}
	});
});
