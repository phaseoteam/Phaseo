import { beforeEach, describe, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({ login: vi.fn(), me: vi.fn(), models: vi.fn() }));
vi.mock("@cursor/sdk", () => ({ AuthenticationError: class extends Error {}, Cursor: { auth: { login: sdk.login }, me: sdk.me, models: { list: sdk.models } }, Agent: {}, JsonlLocalAgentStore: class {} }));
import { cursorAccountStatus, cursorModels, cursorSignIn } from "./cursorAccounts";
beforeEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
describe("Cursor managed accounts", () => {
	it("uses encrypted-profile credentials without saving native plaintext login", async () => {
		const open = vi.fn(async () => {}); const controller = new AbortController();
		sdk.login.mockImplementation(async options => { expect(options.store).toBeNull(); expect(options.signal).toBe(controller.signal); await options.openBrowser("https://cursor.com/login?challenge=fixture"); return { apiKey: "fixture-only" }; });
		await expect(cursorSignIn(open, controller.signal)).resolves.toEqual({ apiKey: "fixture-only" }); expect(open).toHaveBeenCalledWith("https://cursor.com/login?challenge=fixture");
	});
	it("rejects credential-bearing and foreign browser URLs", async () => {
		const open = vi.fn(async () => {});
		for (const url of ["https://cursor.com.evil.example/login", "https://user:password@cursor.com/login", "http://cursor.com/login"]) {
			sdk.login.mockImplementation(async options => { await options.openBrowser(url); }); await expect(cursorSignIn(open, new AbortController().signal)).rejects.toThrow("unexpected sign-in URL");
		}
		expect(open).not.toHaveBeenCalled();
	});
	it("does not report authentication or discover models without the selected key", async () => {
		await expect(cursorAccountStatus()).resolves.toMatchObject({ authenticated: false }); expect(sdk.me).not.toHaveBeenCalled();
		sdk.me.mockResolvedValue({ userEmail: "fixture@example.invalid" }); await expect(cursorAccountStatus("fixture-only")).resolves.toMatchObject({ authenticated: true, identity: "fixture@example.invalid" }); expect(sdk.me).toHaveBeenCalledWith({ apiKey: "fixture-only" });
		sdk.models.mockResolvedValue([{ id: "model", displayName: "Model", description: "Description" }]); await expect(cursorModels("fixture-only")).resolves.toEqual([{ id: "model", name: "Model", description: "Description" }]);
	});
	it("bounds read-only status calls without turning a timeout into signed-out status", async () => {
		vi.useFakeTimers(); try { sdk.me.mockImplementation(() => new Promise(() => {})); const operation = cursorAccountStatus("fixture-only"); const rejected = expect(operation).rejects.toThrow("30 seconds"); await vi.advanceTimersByTimeAsync(30_000); await rejected; } finally { vi.useRealTimers(); }
	});
});
