import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceRuntime } from "./workspaceRuntime";
import { WorkspaceStore } from "./workspaceStore";
import { validateCommand } from "../shared/workspace";

describe("existing conversation settings", () => {
	it("uses changed settings on the next turn while preserving native identity and blocking active changes", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-task-settings-")); let release!: () => void; const turn = new Promise<void>(resolve => { release = resolve; });
		const run = vi.fn(async () => { await turn; }); const runtime = new WorkspaceRuntime(directory, () => ({ run, cancel: async () => { release(); } }));
		try {
			const created = await runtime.command({ type: "create-task", harness: "codex", model: "default", mode: "plan" }); const task = created.tasks[0]; task.nativeSessionId = "native-session"; task.messages = [{ id: "history", role: "user", text: "Previous", createdAt: "" }]; runtime.store.saveTask(task);
			await runtime.command({ type: "update-task", id: task.id, model: "new-model", mode: "code" }); await runtime.command({ type: "send", id: task.id, text: "Implement" }); await vi.waitFor(() => expect(run).toHaveBeenCalled());
			expect(run.mock.calls[0]).toEqual(expect.arrayContaining([expect.objectContaining({ model: "new-model", mode: "code", nativeSessionId: "native-session", messages: expect.arrayContaining([expect.objectContaining({ id: "history" })]) })]));
			await expect(runtime.command({ type: "update-task", id: task.id, model: "other" })).rejects.toThrow("stop"); expect(runtime.store.getTask(task.id).model).toBe("new-model"); release(); await vi.waitFor(() => expect(runtime.store.getTask(task.id).status).toBe("completed"));
		} finally { release(); await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
	});
	it("validates settings and rejects archived edits and implicit Phaseo models", () => {
		for (const update of [{ model: "" }, { model: 42 }, { mode: "unsafe" }]) expect(() => validateCommand({ type: "update-task", id: "task", ...update })).toThrow();
		const store = new WorkspaceStore(":memory:"); try {
			const task = store.apply({ type: "create-task", harness: "codex", model: "default", mode: "chat" }); store.apply({ type: "update-task", id: task.id, archived: true }); expect(() => store.apply({ type: "update-task", id: task.id, mode: "code" })).toThrow("Restore");
			task.harness = "phaseo"; task.archived = false; store.saveTask(task); expect(() => store.apply({ type: "update-task", id: task.id, model: "default" })).toThrow("Choose a model");
		} finally { store.close(); }
	});
});
