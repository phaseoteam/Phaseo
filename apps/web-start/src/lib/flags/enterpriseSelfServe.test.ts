export {};

const mockGate = jest.fn();
const mockIsAdminViewer = jest.fn();

jest.mock("server-only", () => ({}));
jest.mock("flags/next", () => ({
	flag: ({ key }: { key: string }) => () => mockGate(key),
}));
jest.mock("@/lib/statsig/server", () => ({
	getStatsigFlagsAdapter: () => ({ featureGate: jest.fn(), experiment: jest.fn() }),
}));
jest.mock("./identify", () => ({ identify: jest.fn() }));
jest.mock("@/lib/auth/getViewerRole", () => ({ isAdminViewer: mockIsAdminViewer }));

describe("Enterprise self-service rollout", () => {
	const originalEnvironment = process.env.NODE_ENV;
	let enabled: () => Promise<boolean>;

	beforeEach(async () => {
		jest.resetModules();
		mockGate.mockReset();
		mockIsAdminViewer.mockReset();
		Object.defineProperty(process.env, "NODE_ENV", { value: "production", configurable: true, writable: true });
		enabled = (await import("./index")).enterpriseSelfServePreviewEnabled;
	});

	afterAll(() => {
		Object.defineProperty(process.env, "NODE_ENV", { value: originalEnvironment, configurable: true, writable: true });
	});

	it("allows a passing customer without consulting the internal-admin role", async () => {
		mockGate.mockResolvedValue(true);
		await expect(enabled()).resolves.toBe(true);
		expect(mockGate).toHaveBeenCalledWith("enterprise_self_serve_preview");
		expect(mockIsAdminViewer).not.toHaveBeenCalled();
	});

	it("keeps non-targeted production users out", async () => {
		mockGate.mockResolvedValue(false);
		await expect(enabled()).resolves.toBe(false);
	});

	it("fails closed if gate evaluation fails", async () => {
		mockGate.mockRejectedValue(new Error("Statsig unavailable"));
		await expect(enabled()).resolves.toBe(false);
	});
});
