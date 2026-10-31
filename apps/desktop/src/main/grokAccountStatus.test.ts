import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
const native = vi.hoisted(() => ({ spawn: vi.fn(), resolve: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: native.spawn }));
vi.mock("./grokLaunch", () => ({ resolveGrokCommand: native.resolve }));
import { grokAccountStatus, grokAuthenticationStatus } from "./grokAccountStatus";

describe("Grok account status", () => {
	it.each([
		["You are not authenticated.\nDefault model: grok-4.6", false],
		["You are logged in with grok.com.\nAvailable models:", true],
		["Available models: grok-4.6", null],
		["You are not authenticated.\nYou are logged in with grok.com.", null],
	] as const)("uses explicit native authentication evidence (%s)", (output, authenticated) => {
		expect(grokAuthenticationStatus(output).authenticated).toBe(authenticated);
	});
	it("bounds public status to authentication and method", () => {
		expect(grokAuthenticationStatus("\u001b[32mYou are logged in with grok.com.\u001b[0m\nprivate-token")).toEqual({ checkedAt: expect.any(String), authenticated: true, method: "grok.com" });
	});
	it("reads signed-out status without creating a session or sending a prompt", async () => {
		const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() }); native.spawn.mockReturnValue(child); native.resolve.mockResolvedValue({ executable: "/owned/grok", prefix: [] });
		const checking = grokAccountStatus("/owned/project"); await vi.waitFor(() => expect(child.stdout.listenerCount("data")).toBe(1));
		child.stdout.write("You are not authenticated.\n"); child.emit("exit", 0);
		expect(await checking).toMatchObject({ authenticated: false });
		expect(native.spawn.mock.lastCall?.slice(0, 2)).toEqual(["/owned/grok", ["--no-auto-update", "models"]]); expect(child.kill).toHaveBeenCalled();
	});
	it("cancels a stalled status process", async () => {
		const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() }); native.spawn.mockReturnValue(child); native.resolve.mockResolvedValue({ executable: "/owned/grok", prefix: [] });
		const controller = new AbortController(); const checking = grokAccountStatus("/owned/project", undefined, controller.signal); const rejected = expect(checking).rejects.toThrow("cancelled");
		await vi.waitFor(() => expect(child.stdout.listenerCount("data")).toBe(1)); controller.abort(); await rejected; expect(child.kill).toHaveBeenCalled();
	});
	it.each(["oversized", "exit", "error"])("rejects unusable native status (%s)", async failure => {
		const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() }); native.spawn.mockReturnValue(child); native.resolve.mockResolvedValue({ executable: "/owned/grok", prefix: [] });
		const checking = grokAccountStatus("/owned/project"); const rejected = expect(checking).rejects.toThrow(failure === "oversized" ? "oversized" : failure === "exit" ? "did not complete" : "failed");
		await vi.waitFor(() => expect(child.stdout.listenerCount("data")).toBe(1));
		if (failure === "oversized") child.stdout.write("x".repeat(65537));
		else if (failure === "exit") { child.stdout.write("You are logged in with grok.com.\n"); child.emit("exit", 1); }
		else child.emit("error", new Error("private native diagnostics"));
		await rejected; expect(child.kill).toHaveBeenCalled();
	});
});
