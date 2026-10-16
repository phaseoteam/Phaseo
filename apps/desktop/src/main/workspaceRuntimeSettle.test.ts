import { describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { WorkspaceRuntime } from "./workspaceRuntime";
import type { ProjectSettings } from "../shared/projectSettings";

const day = 86_400_000;

function setup(settings: ProjectSettings) {
	const directory = mkdtempSync(path.join(tmpdir(), "phaseo-settle-"));
	const runtime = new WorkspaceRuntime(directory, () => ({ run: async () => {}, cancel: async () => {} }));
	const root = runtime.store.addProject(path.join(directory, "root")); mkdirSync(root.directory, { recursive: true });
	root.settings = settings; runtime.store.saveProject(root);
	const tree = runtime.store.addProject(path.join(directory, "tree")); mkdirSync(tree.directory, { recursive: true });
	tree.worktree = { sourceProjectId: root.id, branch: "fix", baseCommit: "abc" }; runtime.store.saveProject(tree);
	const chat = (projectId: string, patch: Record<string, unknown> = {}) => {
		const at = new Date(Date.now() - 10 * day).toISOString(), id = `chat-${Math.random().toString(36).slice(2)}`;
		runtime.store.saveTask({ id, projectId, title: "Chat", harness: "codex", model: "default", mode: "code", status: "completed", pinned: false, archived: false, messages: [], queue: [], createdAt: at, updatedAt: at, ...patch }, true);
		return id;
	};
	return { directory, runtime, root, tree, chat };
}

describe("settling Code chats", () => {
	it("closes idle terminals and runs the settle script in the chat's own worktree, once per settle", async () => {
		const { directory, runtime, tree, root, chat } = setup({ scripts: [{ id: "clean", name: "Clean up", command: "echo settled-output", icon: "configure", runOnWorktreeCreate: false, runOnSettle: true }] });
		const closeIdle = vi.fn(async () => 0); runtime.closeIdleTerminals = closeIdle;
		try {
			const id = chat(tree.id), shared = chat(root.id);
			await runtime.command({ type: "settle", id });
			await vi.waitFor(() => expect(runtime.store.getTask(id).activities?.[0]).toMatchObject({ title: "Settle script: Clean up", status: "completed" }), { timeout: 15_000 });
			expect(closeIdle).toHaveBeenCalledWith(id);
			expect(runtime.store.getTask(id).activities![0].text).toMatch(/\$ echo settled-output[\s\S]*settled-output[\s\S]*Exited with code 0/);
			// Still settled, and in its place: recording the script is not activity.
			expect(runtime.store.getTask(id).settledOverride).toBe("settled");
			await runtime.command({ type: "settle", id });
			await new Promise(resolve => setTimeout(resolve, 200));
			expect(runtime.store.getTask(id).activities).toHaveLength(1);
			// A chat in the project's main checkout never runs it.
			await runtime.command({ type: "settle", id: shared });
			await vi.waitFor(() => expect(closeIdle).toHaveBeenCalledWith(shared));
			await new Promise(resolve => setTimeout(resolve, 200));
			expect(runtime.store.getTask(shared).activities ?? []).toEqual([]);
		} finally { await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
	}, 30_000);

	it("auto-settles with the project's own settings, which worktrees share", async () => {
		const { directory, runtime, root, tree, chat } = setup({ autoSettleAfterDays: null });
		try {
			const kept = chat(tree.id);
			runtime.settleIdleThreads();
			expect(runtime.store.getTask(kept).settledOverride).toBeUndefined();
			runtime.updateProject({ id: root.id, settings: { autoSettleAfterDays: 7 } });
			expect(runtime.store.getTask(kept).settledOverride).toBe("settled");
			expect(() => runtime.updateProject({ id: tree.id, settings: {} })).toThrow("Worktrees use their project's settings");
			expect(runtime.updateProject({ id: root.id, name: "Renamed", settings: {} }).projects.find(project => project.id === root.id)).toMatchObject({ name: "Renamed" });
			expect(runtime.store.getProjects().find(project => project.id === root.id)?.settings).toBeUndefined();
		} finally { await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
	});
});
