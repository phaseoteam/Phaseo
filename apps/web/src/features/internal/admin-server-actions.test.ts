import { fetchInternalAuthStatus } from "@/lib/fetchers/internal/fetchInternalAuthStatus";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAdminCatalogList } from "@/lib/fetchers/internal/fetchAdminCatalog";
import { fetchInternalProviderApplications, fetchProviderModelRequests } from "@/lib/fetchers/internal/fetchInternalProviderCatalogReviews";
import { fetchAccountWebApi, fetchInternalWebApi } from "@/lib/web-api/client";
import * as auditActions from "@/app/[locale]/(dashboard)/internal/audit/actions";
import * as auditAdvancedActions from "@/app/[locale]/(dashboard)/internal/audit/actions-advanced";
import * as modelDockActions from "@/app/(dashboard)/internal/data/modelAdminDockActions";
import * as modelActions from "@/app/[locale]/(dashboard)/models/actions";
import * as providerReviewActions from "@/app/[locale]/(dashboard)/settings/internal/provider-review/actions";

jest.mock("@/lib/fetchers/internal/fetchInternalAuthStatus", () => ({ fetchInternalAuthStatus: jest.fn() }));
jest.mock("@/lib/fetchers/internal/serverAccountContext", () => ({ getServerAccountContext: jest.fn() }));
jest.mock("@/lib/fetchers/internal/fetchAdminCatalog", () => ({ fetchAdminCatalogList: jest.fn() }));
jest.mock("@/lib/fetchers/internal/fetchInternalProviderCatalogReviews", () => ({ fetchInternalProviderApplications: jest.fn(), fetchProviderModelRequests: jest.fn() }));
jest.mock("@/lib/web-api/client", () => ({
	fetchAccountWebApi: jest.fn(),
	fetchInternalWebApi: jest.fn(),
	WebApiError: class WebApiError extends Error {},
}));

type AuthStatus = Awaited<ReturnType<typeof fetchInternalAuthStatus>>;

const modules = {
	"internal/audit/actions": auditActions,
	"internal/audit/actions-advanced": auditAdvancedActions,
	"internal/data/modelAdminDockActions": modelDockActions,
	"models/actions": modelActions,
	"settings/internal/provider-review/actions": providerReviewActions,
} as Record<string, Record<string, unknown>>;

const exportedActions = Object.entries(modules).flatMap(([moduleName, exports]) =>
	Object.entries(exports)
		.filter(([, value]) => typeof value === "function")
		.map(([name, action]) => [`${moduleName}#${name}`, action as (...args: unknown[]) => Promise<unknown>] as const),
);

// Arguments shaped loosely like the real ones; the guard must refuse before any of them matter.
const argument = { modelId: "openai/gpt-6", requestId: "r", runId: "r", modelSlug: "m", providerSlug: "p", decision: "approved", expectedUpdatedAt: "", passed: true, name: "x", providerApiModelId: "p", resultId: "r" };

function expectNothingRelayed() {
	expect(fetchAccountWebApi).not.toHaveBeenCalled();
	expect(fetchInternalWebApi).not.toHaveBeenCalled();
	expect(fetchAdminCatalogList).not.toHaveBeenCalled();
	expect(fetchInternalProviderApplications).not.toHaveBeenCalled();
	expect(fetchProviderModelRequests).not.toHaveBeenCalled();
}

describe("internal and admin server actions", () => {
	beforeEach(() => {
		jest.resetAllMocks();
		jest.mocked(getServerAccountContext).mockResolvedValue({ accessToken: "session" } as Awaited<ReturnType<typeof getServerAccountContext>>);
	});

	it("covers every exported action", () => {
		expect(exportedActions.length).toBeGreaterThanOrEqual(26);
	});

	it.each([
		["anonymous", { signedIn: false, isAdmin: false, role: null }],
		["signed-in non-admin", { signedIn: true, isAdmin: false, role: "user" }],
	])("refuses a %s caller in every action before calling the API", async (_label, status) => {
		jest.mocked(fetchInternalAuthStatus).mockResolvedValue(status as AuthStatus);
		for (const [name, action] of exportedActions) {
			const outcome = await action(name.endsWith("searchAdminModelsForDockAction") ? "gpt" : argument).then(
				(value) => ({ value }),
				(error: unknown) => ({ error: error instanceof Error ? error.message : String(error) }),
			);
			// Actions that report failures as values say "Unauthorized"; the rest throw it.
			const message = "error" in outcome ? outcome.error : (outcome.value as { error?: string } | null)?.error;
			expect([name, message]).toEqual([name, "Unauthorized"]);
		}
		expectNothingRelayed();
	});

	it("still relays an admin's request", async () => {
		jest.mocked(fetchInternalAuthStatus).mockResolvedValue({ signedIn: true, isAdmin: true, role: "admin" } as AuthStatus);
		jest.mocked(fetchAccountWebApi).mockResolvedValue({ success: true });
		await expect(auditActions.createModel({ modelId: "openai/gpt-6", name: "GPT-6" })).resolves.toEqual({ success: true });
		expect(fetchAccountWebApi).toHaveBeenCalledTimes(1);
	});
});
