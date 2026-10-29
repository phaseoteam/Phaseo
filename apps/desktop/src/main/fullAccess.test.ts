import { expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { WorkspaceRuntime } from "./workspaceRuntime";

it("full access accepts tool approvals without creating approval cards", async () => {
	const directory = mkdtempSync(path.join(tmpdir(), "phaseo-full-access-"));
	let decision: string | undefined;
	const runtime = new WorkspaceRuntime(directory, () => ({
		run: async (_task, _cwd, _text, callbacks) => { decision = await callbacks.onApproval("owned-tool", "Owned fixture, no command execution"); callbacks.onDelta("reply", "Done"); },
		cancel: async () => {},
	}));
	try {
		const state = await runtime.command({ type: "create-task", harness: "codex", model: "fixture", mode: "code", permissionMode: "full-access" });
		const id = state.tasks[0].id;
		await runtime.command({ type: "send", id, text: "Owned test" });
		await vi.waitFor(() => expect(runtime.store.getTask(id).status).toBe("completed"));
		expect(decision).toBe("accept"); expect(runtime.store.getTask(id).approvals ?? []).toEqual([]);
	} finally { await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
});
