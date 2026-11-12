import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceRuntime } from "./workspaceRuntime";

describe("harness maintenance admission", () => {
	it("keeps affected input queued and permits other harnesses until explicitly resumed", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-maintenance-runtime-")), run = vi.fn(async () => {});
		const runtime = new WorkspaceRuntime(directory, () => ({ run, cancel: async () => {} }));
		try {
			const id = (await runtime.command({ type: "create-task", harness: "codex", model: "default", mode: "code" })).tasks[0].id;
			const release = runtime.beginHarnessMaintenance("codex");
			expect(() => runtime.beginHarnessMaintenance("codex")).toThrow("update to finish");
			await runtime.command({ type: "send", id, text: "Retained instruction" });
			await vi.waitFor(() => expect(runtime.store.getTask(id).status).toBe("failed"));
			expect(runtime.store.getTask(id).queue[0].text).toBe("Retained instruction"); expect(run).not.toHaveBeenCalled();
			const other = (await runtime.command({ type: "create-task", harness: "claude", model: "default", mode: "code" })).tasks.find(value => value.harness === "claude")!;
			await runtime.command({ type: "send", id: other.id, text: "Other harness" }); await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
			release(); expect(run).toHaveBeenCalledTimes(1);
			await runtime.command({ type: "resume", id }); await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
		} finally { await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
	});
	it("rejects maintenance during active turns and account sign-in, and rejects sign-in during maintenance", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-maintenance-runtime-")); let finish: (() => void) | undefined;
		const run = vi.fn(async () => { await new Promise<void>(resolve => { finish = resolve; }); });
		const runtime = new WorkspaceRuntime(directory, () => ({ run, cancel: async () => { finish?.(); } }));
		try {
			runtime.store.saveAccount({ id: "owned", name: "Owned", harness: "codex", kind: "native", configured: true, configDirectory: directory });
			const releaseSignIn = runtime.beginAccountSignIn("owned"); expect(() => runtime.beginHarnessMaintenance("codex")).toThrow("sign-in"); releaseSignIn();
			const releaseUpdate = runtime.beginHarnessMaintenance("codex"); expect(() => runtime.beginAccountSignIn("owned")).toThrow("update to finish"); releaseUpdate();
			const id = (await runtime.command({ type: "create-task", harness: "codex", model: "default", mode: "code" })).tasks[0].id;
			await runtime.command({ type: "send", id, text: "Owned active turn" }); await vi.waitFor(() => expect(run).toHaveBeenCalled());
			expect(() => runtime.beginHarnessMaintenance("codex")).toThrow("tasks before updating");
		} finally { await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
	});
});
