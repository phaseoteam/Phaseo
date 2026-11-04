import { revalidatePath } from "next/cache";
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
} from "@/app/[locale]/(dashboard)/internal/data/actions";

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/indexnow", () => ({
	getIndexNowModelUrls: jest.fn(() => []),
	getIndexNowProviderUrls: jest.fn(() => []),
	submitIndexNowUrls: jest.fn(),
}));
jest.mock("@/app/(dashboard)/models/actions", () => ({ updateModel: jest.fn() }));
jest.mock("@/lib/fetchers/internal/serverAccountContext", () => ({ getServerAccountContext: jest.fn() }));
jest.mock("@/lib/fetchers/internal/fetchInternalAuthStatus", () => ({ fetchInternalAuthStatus: jest.fn() }));
jest.mock("@/lib/web-api/client", () => ({ fetchAccountWebApi: jest.fn(), fetchInternalWebApi: jest.fn() }));
jest.mock("@/lib/cache/revalidateDataTags", () => ({
	revalidateModelApiInfoTags: jest.fn(),
	revalidateModelDataOnlyTags: jest.fn(),
	revalidateModelDataTags: jest.fn(),
}));

type AuthStatus = Awaited<ReturnType<typeof fetchInternalAuthStatus>>;

const modelId = "openai/gpt-6";

function expectNoSideEffects() {
	expect(revalidateModelDataOnlyTags).not.toHaveBeenCalled();
	expect(revalidateModelApiInfoTags).not.toHaveBeenCalled();
	expect(revalidateModelDataTags).not.toHaveBeenCalled();
	expect(revalidatePath).not.toHaveBeenCalled();
	expect(fetchInternalWebApi).not.toHaveBeenCalled();
	expect(fetchAccountWebApi).not.toHaveBeenCalled();
}

describe("internal data actions admin guard", () => {
	beforeEach(() => {
		jest.resetAllMocks();
		jest.mocked(getServerAccountContext).mockResolvedValue({ accessToken: "test-session" } as Awaited<ReturnType<typeof getServerAccountContext>>);
	});

	it.each([
		["anonymous", { signedIn: false, isAdmin: false, role: null }],
		["signed-in non-admin", { signedIn: true, isAdmin: false, role: "user" }],
	])("rejects a %s caller before expiring any cache", async (_label, status) => {
		jest.mocked(fetchInternalAuthStatus).mockResolvedValue(status as AuthStatus);

		await expect(revalidateSingleModelDataAction(modelId)).rejects.toThrow("Unauthorized");
		await expect(revalidateSingleModelApiInfoAction(modelId)).rejects.toThrow("Unauthorized");
		await expect(revalidateSingleModelAllAction(modelId)).rejects.toThrow("Unauthorized");
		await expect(deleteModelAction(modelId)).rejects.toThrow("Unauthorized");

		expectNoSideEffects();
	});

	it("lets an admin expire the model data cache", async () => {
		jest.mocked(fetchInternalAuthStatus).mockResolvedValue({ signedIn: true, isAdmin: true, role: "admin" } as AuthStatus);
		jest.mocked(fetchInternalWebApi).mockResolvedValue({ revalidated: [] } as never);

		await expect(revalidateSingleModelDataAction(modelId)).resolves.toEqual({ ok: true, message: "Model data cache revalidated." });

		expect(revalidateModelDataOnlyTags).toHaveBeenCalledWith({ modelId });
		expect(revalidatePath).toHaveBeenCalledWith(`/models/${modelId}`);
		expect(fetchInternalWebApi).toHaveBeenCalledWith("/api/internal/revalidate", "test-session", expect.objectContaining({ method: "POST" }));
	});
});
