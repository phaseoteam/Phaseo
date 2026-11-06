import { describe, expect, it, vi } from "vitest";
import { AppControl } from "./appControl";
import type { AppCommandRequest } from "../shared/appCommands";

describe("AppControl", () => {
	it("sends renderer commands to the window and returns its answer", async () => {
		const sent: AppCommandRequest[] = [];
		const control = new AppControl({ send: request => { sent.push(request); return true; }, main: async () => undefined });
		const run = control.run("agent", "app.state", undefined);
		expect(sent).toMatchObject([{ command: "app.state", args: {} }]);
		control.resolve({ requestId: "someone-else", ok: true, result: "ignored" });
		control.resolve({ requestId: sent[0].requestId, ok: true, result: { mode: "code" } });
		await expect(run).resolves.toEqual({ command: "app.state", result: { mode: "code" } });
	});

	it("reports the window's error, a missing window and a window that never answers", async () => {
		const sent: AppCommandRequest[] = [];
		const control = new AppControl({ send: request => { sent.push(request); return true; }, main: async () => undefined, timeoutMs: 20 });
		const failing = control.run("agent", "chat.open", { threadId: "missing" });
		control.resolve({ requestId: sent[0].requestId, ok: false, error: "No chat has that id." });
		await expect(failing).rejects.toThrow("No chat has that id.");
		await expect(new AppControl({ send: () => false, main: async () => undefined }).run("agent", "inbox.open", undefined)).rejects.toThrow("no window");
		vi.useFakeTimers();
		try {
			const silent = expect(control.run("agent", "inbox.open", undefined)).rejects.toThrow("did not answer");
			await vi.advanceTimersByTimeAsync(20);
			await silent;
		} finally { vi.useRealTimers(); }
	});

	it("runs main commands in the main process, and refuses person-only ones from agents before running anything", async () => {
		const main = vi.fn(async () => ({ threadId: "operator" }));
		const control = new AppControl({ send: () => true, main });
		await expect(control.run("agent", "operator.open", undefined)).resolves.toEqual({ command: "operator.open", result: { threadId: "operator" } });
		expect(main).toHaveBeenCalledWith("operator.open", {}, "agent");
		await expect(control.run("agent", "operator.resume", undefined)).rejects.toThrow("person only");
		expect(main).toHaveBeenCalledTimes(1);
	});
});
