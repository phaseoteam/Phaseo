import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Account } from "../shared/workspace";
const native = vi.hoisted(() => ({ spawn: vi.fn(), resolve: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: native.spawn }));
vi.mock("./grokLaunch", () => ({ resolveGrokCommand: native.resolve }));
import { grokSignIn } from "./grokSignIn";
const account: Account = { id: "grok", name: "Grok", harness: "grok", kind: "native", configured: false, configDirectory: "/owned/profile" };
function fixture() { const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() }); native.spawn.mockReturnValue(child); return child; }
describe("Grok browser sign-in ownership", () => {
	beforeEach(() => { vi.clearAllMocks(); native.resolve.mockResolvedValue({ executable: "/owned/grok", prefix: [] }); });
	afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
	it("uses native OAuth and an isolated profile, without persisting output", async () => {
		vi.stubEnv("XAI_API_KEY", "fixture-other-account"); const child = fixture();
		const login = grokSignIn(account, new AbortController().signal); await vi.waitFor(() => expect(child.listenerCount("exit")).toBe(1));
		expect(native.spawn).toHaveBeenCalledWith("/owned/grok", ["--no-auto-update", "login", "--oauth"], expect.objectContaining({ cwd: account.configDirectory, shell: false, env: expect.objectContaining({ GROK_HOME: account.configDirectory, XAI_API_KEY: undefined }) }));
		child.stdout.write("private authentication output"); child.emit("exit", 0); await login; expect(child.kill).toHaveBeenCalled();
	});
	it("cancels immediately without depending on a process exit", async () => {
		const child = fixture(); const controller = new AbortController(); const login = grokSignIn(account, controller.signal); const rejected = expect(login).rejects.toThrow("cancelled");
		await vi.waitFor(() => expect(child.listenerCount("exit")).toBe(1)); controller.abort(); await rejected; expect(child.kill).toHaveBeenCalled();
	});
	it("does not launch after cancellation during discovery", async () => {
		let resolve!: (value: { executable: string; prefix: string[] }) => void; native.resolve.mockReturnValueOnce(new Promise(done => { resolve = done; }));
		const controller = new AbortController(); const login = grokSignIn(account, controller.signal); const rejected = expect(login).rejects.toThrow("cancelled"); controller.abort(); resolve({ executable: "/owned/grok", prefix: [] }); await rejected; expect(native.spawn).not.toHaveBeenCalled();
	});
	it.each(["exit", "error"])("rejects unsuccessful native completion (%s)", async failure => {
		const child = fixture(); const login = grokSignIn(account, new AbortController().signal); const rejected = expect(login).rejects.toThrow(failure === "exit" ? "did not complete" : "could not start");
		await vi.waitFor(() => expect(child.listenerCount("exit")).toBe(1)); if (failure === "exit") child.emit("exit", 1); else child.emit("error", new Error("private diagnostics")); await rejected; expect(child.kill).toHaveBeenCalled();
	});
	it("ends a stalled OAuth attempt at its deadline", async () => {
		vi.useFakeTimers(); const child = fixture(); const login = grokSignIn(account, new AbortController().signal); const rejected = expect(login).rejects.toThrow("timed out"); await Promise.resolve(); await vi.advanceTimersByTimeAsync(10 * 60 * 1000); await rejected; expect(child.kill).toHaveBeenCalled();
	});
});
