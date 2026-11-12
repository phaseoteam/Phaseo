import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchInternalAuthStatus } from "@/lib/fetchers/internal/fetchInternalAuthStatus";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAdminCatalogList } from "@/lib/fetchers/internal/fetchAdminCatalog";
import { fetchInternalProviderApplications, fetchProviderModelRequests } from "@/lib/fetchers/internal/fetchInternalProviderCatalogReviews";
import { fetchAccountWebApi, fetchInternalWebApi } from "@/lib/web-api/client";
import * as auditActions from "@/features/internal/audit/actions";
import * as auditAdvancedActions from "@/features/internal/audit/actions-advanced";
import * as modelDockActions from "@/features/internal/data/modelAdminDockActions";
import * as modelActions from "@/features/models/actions";
import * as providerReviewActions from "@/features/settings/internal/provider-review/actions";

vi.mock("@/lib/fetchers/internal/fetchInternalAuthStatus", () => ({ fetchInternalAuthStatus: vi.fn() }));
vi.mock("@/lib/fetchers/internal/serverAccountContext", () => ({ getServerAccountContext: vi.fn() }));
vi.mock("@/lib/fetchers/internal/fetchAdminCatalog", () => ({ fetchAdminCatalogList: vi.fn() }));
vi.mock("@/lib/fetchers/internal/fetchInternalProviderCatalogReviews", () => ({ fetchInternalProviderApplications: vi.fn(), fetchProviderModelRequests: vi.fn() }));
vi.mock("@/lib/web-api/client", () => ({
	fetchAccountWebApi: vi.fn(),
	fetchInternalWebApi: vi.fn(),
	WebApiError: class WebApiError extends Error {},
}));

type AuthStatus = Awaited<ReturnType<typeof fetchInternalAuthStatus>>;
type ServerFn = ((input: { data: unknown }) => Promise<unknown>) & { url?: unknown };

const modules = {
	"internal/audit/actions": auditActions,
	"internal/audit/actions-advanced": auditAdvancedActions,
	"internal/data/modelAdminDockActions": modelDockActions,
	"models/actions": modelActions,
	"settings/internal/provider-review/actions": providerReviewActions,
} as Record<string, Record<string, unknown>>;

// Every server function the five modules export.
const exportedActions = Object.entries(modules).flatMap(([moduleName, exports]) =>
	Object.entries(exports)
		.filter(([, value]) => typeof value === "function")
		.map(([name, action]) => [`${moduleName}#${name}`, action as ServerFn] as const),
);

// Arguments shaped loosely like the real ones; the check must refuse before any of them matter.
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
		vi.resetAllMocks();
		vi.mocked(getServerAccountContext).mockResolvedValue({ accessToken: "session" } as Awaited<ReturnType<typeof getServerAccountContext>>);
	});

	it("covers every exported action", () => {
		expect(exportedActions.length).toBeGreaterThanOrEqual(26);
	});

	it.each([
		["anonymous", { signedIn: false, isAdmin: false, role: null }],
		["signed-in non-admin", { signedIn: true, isAdmin: false, role: "user" }],
	])("refuses a %s caller in every action before calling the API", async (_label, status) => {
		vi.mocked(fetchInternalAuthStatus).mockResolvedValue(status as AuthStatus);
		// The server function middleware logs the real error and sends the browser a generic one.
		const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
		try {
			for (const [name, action] of exportedActions) {
				const data = name.endsWith("searchAdminModelsForDockAction") ? "gpt" : name.endsWith("Id") || name.includes("deleteProviderModel") || name.includes("deleteBenchmarkResult") || name.includes("deleteModel") || name.includes("fetchCompleteModelData") ? "openai/gpt-6" : argument;
				log.mockClear();
				await expect(action({ data }), name).rejects.toThrow();
				expect(log, name).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ message: expect.stringContaining("Unauthorized") }));
			}
		} finally {
			log.mockRestore();
		}
		expectNothingRelayed();
	});

	it("still relays an admin's request", async () => {
		vi.mocked(fetchInternalAuthStatus).mockResolvedValue({ signedIn: true, isAdmin: true, role: "admin" } as AuthStatus);
		vi.mocked(fetchAccountWebApi).mockResolvedValue({ success: true });
		await expect(auditActions.createModel({ data: { modelId: "openai/gpt-6", name: "GPT-6" } })).resolves.toEqual({ success: true });
		expect(fetchAccountWebApi).toHaveBeenCalledTimes(1);
	});
});
