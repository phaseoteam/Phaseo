import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Account, Task } from "../shared/workspace";
import { WorkspaceStore } from "./workspaceStore";
import { PhaseoCodingAdapter } from "./phaseoCodingAdapter";

const task: Task = { id: "task", title: "Task", harness: "phaseo", model: "model", mode: "code", status: "idle", pinned: false, archived: false, messages: [], queue: [], createdAt: "", updatedAt: "" };
const account: Account = { id: "account", name: "API", harness: "phaseo", kind: "api", configured: true, endpoint: "https://api.phaseo.app/v1" };
describe("Phaseo coding run loop", () => {
	it.each(["accept", "decline"] as const)("persists a pending edit and continues after %s", async decision => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-agent-"));
		const store = new WorkspaceStore(path.join(root, "state.sqlite"));
		try {
			const generate = vi.fn().mockResolvedValueOnce({ message: { role: "assistant", content: "", toolCalls: [{ id: "edit", name: "write_project_file", input: { path: "hello.txt", content: "Hello", expectedHash: "new" } }] } }).mockResolvedValueOnce({ message: { role: "assistant", content: "Finished" } });
			let runId = "";
			const adapter = new PhaseoCodingAdapter(() => "secret", store, () => ({ generate }));
			await adapter.run(task, root, "Create hello.txt", {
				onSession: id => { runId = id; }, onDelta: () => {}, onApproval: async () => {
					expect(store.loadAgentRun(runId)?.run.status).toBe("waiting_for_human");
					return decision;
				},
			}, account);
			expect(store.loadAgentRun(runId)?.run.status).toBe("completed");
			if (decision === "accept") expect(readFileSync(path.join(root, "hello.txt"), "utf8")).toBe("Hello");
			else expect(() => readFileSync(path.join(root, "hello.txt"))).toThrow();
			expect(JSON.stringify(store.loadAgentRun(runId))).not.toContain("secret");
		} finally { store.close(); rmSync(root, { recursive: true, force: true }); }
	});
});
