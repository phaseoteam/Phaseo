import { buildAnonymousStatsigUser, EMPTY_STATSIG_PROFILE } from "./shared";

const mockStatsig = {
	initialize: jest.fn().mockResolvedValue(undefined),
	syncConfigSpecs: jest.fn().mockResolvedValue(undefined),
	getFeatureGateWithExposureLoggingDisabledSync: jest.fn(),
	getExperimentWithExposureLoggingDisabledSync: jest.fn(),
	getClientInitializeResponse: jest.fn(),
};

jest.mock("statsig-node-lite", () => ({ __esModule: true, default: mockStatsig }));
jest.mock("@/lib/server/currentRequest", () => ({ currentRequestCookie: jest.fn(() => "stable-id") }));
jest.mock("@/compat/wait-until", () => ({ waitUntil: jest.fn() }));
jest.mock("@/lib/fetchers/internal/serverAccountContext", () => ({ getServerAccountContext: jest.fn() }));
jest.mock("@/lib/web-api/client", () => ({ fetchAccountWebApi: jest.fn() }));

const ORIGINAL_ENV = { ...process.env };

async function loadServer(env: Record<string, string | undefined> = {}) {
	jest.resetModules();
	process.env = { ...ORIGINAL_ENV, STATSIG_SERVER_KEY: undefined, STATSIG_SERVER_API_KEY: undefined, STATSIG_ENVIRONMENT_TIER: undefined, PHASEO_ENV: undefined, ...env };
	const [server, { getServerAccountContext }, { fetchAccountWebApi }] = await Promise.all([
		import("./server"),
		import("@/lib/fetchers/internal/serverAccountContext"),
		import("@/lib/web-api/client"),
	]);
	return { ...server, getServerAccountContext: jest.mocked(getServerAccountContext), fetchAccountWebApi: jest.mocked(fetchAccountWebApi) };
}

describe("server feature flag identity", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	afterAll(() => {
		process.env = ORIGINAL_ENV;
	});

	it("builds anonymous identity without an account API request", async () => {
		const { getServerStatsigUser, getServerAccountContext, fetchAccountWebApi } = await loadServer();
		getServerAccountContext.mockResolvedValue({ accessToken: null, obfuscateInfo: null, workspaceId: null });
		await expect(getServerStatsigUser()).resolves.toEqual(buildAnonymousStatsigUser("stable-id"));
		expect(fetchAccountWebApi).not.toHaveBeenCalled();
	});

	it("preserves remote identity validation and workspace targeting for signed-in users", async () => {
		const { getServerStatsigUser, getServerAccountContext, fetchAccountWebApi } = await loadServer();
		getServerAccountContext.mockResolvedValue({ accessToken: "test-token", obfuscateInfo: null, workspaceId: "workspace-id" });
		fetchAccountWebApi.mockResolvedValue({ signedIn: true, user: { id: "user-id", email: "user@example.test" }, profile: EMPTY_STATSIG_PROFILE });
		const user = await getServerStatsigUser();
		expect(fetchAccountWebApi).toHaveBeenCalledWith("/api/account/auth/statsig", "test-token");
		expect(user.userID).toBe("user-id");
		expect(user.customIDs?.workspaceID).toBe("workspace-id");
	});
});

describe("server gate checks", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	afterAll(() => {
		process.env = ORIGINAL_ENV;
	});

	it("keeps gates off and never initialises Statsig without a server key", async () => {
		const { checkStatsigGate, getStatsigExperiment } = await loadServer();
		await expect(checkStatsigGate({ userID: "user-id" }, "batch_api")).resolves.toBe(false);
		await expect(getStatsigExperiment({ userID: "user-id" }, "new_landing_page")).resolves.toBeNull();
		expect(mockStatsig.initialize).not.toHaveBeenCalled();
	});

	it("initialises once with the deployment tier and checks gates without exposure logging", async () => {
		const { checkStatsigGate } = await loadServer({ STATSIG_SERVER_KEY: "secret-key", PHASEO_ENV: "preview" });
		mockStatsig.getFeatureGateWithExposureLoggingDisabledSync.mockReturnValue({ value: true });
		await expect(checkStatsigGate({ userID: "user-id" }, "batch_api")).resolves.toBe(true);
		await expect(checkStatsigGate({ userID: "user-id" }, "batch_api")).resolves.toBe(true);
		expect(mockStatsig.initialize).toHaveBeenCalledTimes(1);
		expect(mockStatsig.initialize).toHaveBeenCalledWith("secret-key", expect.objectContaining({ environment: { tier: "staging" } }));
		expect(mockStatsig.getFeatureGateWithExposureLoggingDisabledSync).toHaveBeenCalledWith({ userID: "user-id" }, "batch_api");
	});

	it("defaults to the production tier when the deployment is not configured", async () => {
		const { checkStatsigGate } = await loadServer({ STATSIG_SERVER_KEY: "secret-key", NODE_ENV: "production" });
		mockStatsig.getFeatureGateWithExposureLoggingDisabledSync.mockReturnValue({ value: false });
		await expect(checkStatsigGate({ userID: "user-id" }, "batch_api")).resolves.toBe(false);
		expect(mockStatsig.initialize).toHaveBeenCalledWith("secret-key", expect.objectContaining({ environment: { tier: "production" } }));
	});

	it("rejects a missing user instead of evaluating for nobody", async () => {
		const { checkStatsigGate } = await loadServer({ STATSIG_SERVER_KEY: "secret-key" });
		await expect(checkStatsigGate(null, "batch_api")).rejects.toThrow("missing user");
	});
});
