import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({ initialize: vi.fn(), gate: vi.fn(), construct: vi.fn(), shutdown: vi.fn() }));
vi.mock("@statsig/js-client", () => ({ StatsigClient: class {
	constructor(...args: unknown[]) { sdk.construct(...args); }
	initializeAsync = sdk.initialize;
	getFeatureGate = sdk.gate;
	shutdown = sdk.shutdown;
} }));
import { loadDesktopFlags } from "./DesktopFlags";

describe("desktop feature flags", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubEnv("VITE_STATSIG_CLIENT_KEY", "client-owned-fixture");
		vi.stubGlobal("localStorage", { getItem: () => "owned-anonymous-id", setItem: vi.fn() });
		vi.stubGlobal("window", { addEventListener: vi.fn() });
		sdk.initialize.mockResolvedValue(undefined);
	});
	afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
	it("does not initialize without a public client key", async () => {
		vi.stubEnv("VITE_STATSIG_CLIENT_KEY", "");
		expect(await loadDesktopFlags()).toEqual({ browserSuggestions: true });
		expect(sdk.construct).not.toHaveBeenCalled();
	});
	it.each([true, false])("uses a recognized remote gate: %s", async value => {
		sdk.gate.mockReturnValue({ value, details: { reason: "Network:Recognized" } });
		expect(await loadDesktopFlags()).toEqual({ browserSuggestions: value });
		expect(sdk.gate).toHaveBeenCalledWith("desktop_browser_suggestions");
		expect(sdk.initialize).toHaveBeenCalledWith({ timeoutMs: 2000 });
		expect(sdk.construct).toHaveBeenCalledWith("client-owned-fixture", expect.objectContaining({ userID: "owned-anonymous-id" }), expect.objectContaining({ loggingEnabled: "disabled", includeCurrentPageUrlWithEvents: false }));
	});
	it.each(["NoValues", "Network:Unrecognized"])("preserves suggestions when the gate is unavailable: %s", async reason => {
		sdk.gate.mockReturnValue({ value: false, details: { reason } });
		expect(await loadDesktopFlags()).toEqual({ browserSuggestions: true });
	});
});
