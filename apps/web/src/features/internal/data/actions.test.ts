import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchInternalAuthStatus } from "@/lib/fetchers/internal/fetchInternalAuthStatus";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi, fetchInternalWebApi } from "@/lib/web-api/client";
import {
	revalidateModelApiInfoTags,
	revalidateModelDataOnlyTags,
	revalidateModelDataTags,
} from "@/lib/cache/revalidateDataTags";
import {
	deleteModelAction,
	revalidateSingleModelAllAction,
	revalidateSingleModelApiInfoAction,
	revalidateSingleModelDataAction,
} from "@/features/internal/data/actions";

vi.mock("@/lib/indexnow", () => ({
	getIndexNowModelUrls: vi.fn(() => []),
	getIndexNowProviderUrls: vi.fn(() => []),
	submitIndexNowUrls: vi.fn(),
}));
vi.mock("@/lib/fetchers/internal/serverAccountContext", () => ({ getServerAccountContext: vi.fn() }));
vi.mock("@/lib/fetchers/internal/fetchInternalAuthStatus", () => ({ fetchInternalAuthStatus: vi.fn() }));
vi.mock("@/lib/web-api/client", () => ({ fetchAccountWebApi: vi.fn(), fetchInternalWebApi: vi.fn() }));
vi.mock("@/lib/cache/revalidateDataTags", () => ({
	revalidateModelApiInfoTags: vi.fn(),
	revalidateModelDataOnlyTags: vi.fn(),
	revalidateModelDataTags: vi.fn(),
}));

type AuthStatus = Awaited<ReturnType<typeof fetchInternalAuthStatus>>;

const modelId = "openai/gpt-6";

// The server function middleware logs the real error and sends the browser a generic one.
async function expectUnauthorized(run: () => Promise<unknown>) {
	const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
	try {
		await expect(run()).rejects.toThrow();
		expect(log).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ message: expect.stringContaining("Unauthorized") }));
	} finally {
		log.mockRestore();
	}
}

function expectNoSideEffects() {
	expect(revalidateModelDataOnlyTags).not.toHaveBeenCalled();
	expect(revalidateModelApiInfoTags).not.toHaveBeenCalled();
	expect(revalidateModelDataTags).not.toHaveBeenCalled();
	expect(fetchInternalWebApi).not.toHaveBeenCalled();
	expect(fetchAccountWebApi).not.toHaveBeenCalled();
}

describe("internal data actions admin guard", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		vi.mocked(getServerAccountContext).mockResolvedValue({ accessToken: "test-session" } as Awaited<ReturnType<typeof getServerAccountContext>>);
	});

	it.each([
		["anonymous", { signedIn: false, isAdmin: false, role: null }],
		["signed-in non-admin", { signedIn: true, isAdmin: false, role: "user" }],
	])("rejects a %s caller before expiring any cache", async (_label, status) => {
		vi.mocked(fetchInternalAuthStatus).mockResolvedValue(status as AuthStatus);

		await expectUnauthorized(() => revalidateSingleModelDataAction({ data: modelId }));
		await expectUnauthorized(() => revalidateSingleModelApiInfoAction({ data: modelId }));
		await expectUnauthorized(() => revalidateSingleModelAllAction({ data: modelId }));
		await expectUnauthorized(() => deleteModelAction({ data: modelId }));

		expectNoSideEffects();
	});

	it("lets an admin expire the model data cache", async () => {
		vi.mocked(fetchInternalAuthStatus).mockResolvedValue({ signedIn: true, isAdmin: true, role: "admin" } as AuthStatus);
		vi.mocked(fetchInternalWebApi).mockResolvedValue({ revalidated: [] } as never);

		await expect(revalidateSingleModelDataAction({ data: modelId })).resolves.toEqual({ ok: true, message: "Model data cache revalidated." });

		expect(revalidateModelDataOnlyTags).toHaveBeenCalledWith({ modelId });
		expect(fetchInternalWebApi).toHaveBeenCalledWith("/api/internal/revalidate", "test-session", expect.objectContaining({ method: "POST" }));
	});
});
