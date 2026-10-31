import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
export {};

const mockGate = vi.fn();
const mockIsAdminViewer = vi.fn();

vi.mock("@/lib/flags/flag", () => ({
	flag: ({ key }: { key: string }) => () => mockGate(key),
}));
vi.mock("@/lib/statsig/server", () => ({
	getStatsigFlagsAdapter: () => ({ featureGate: vi.fn(), experiment: vi.fn() }),
}));
vi.mock("./identify", () => ({ identify: vi.fn(), identifyWorkspaceOwner: vi.fn() }));
vi.mock("@/lib/auth/getViewerRole", () => ({ isAdminViewer: mockIsAdminViewer }));

describe("Enterprise self-service rollout", () => {
	let enabled: () => Promise<boolean>;

	beforeEach(async () => {
		vi.resetModules();
		mockGate.mockReset();
		mockIsAdminViewer.mockReset();
		vi.stubEnv("NODE_ENV", "production");
		enabled = (await import("./index")).enterpriseSelfServePreviewEnabled;
	});

	afterAll(() => {
		vi.unstubAllEnvs();
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
