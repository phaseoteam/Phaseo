import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createGitWorktree, removeGitWorktree } from "./gitWorktrees";
import { WorkspaceRuntime } from "./workspaceRuntime";
import { WorkspaceStore } from "./workspaceStore";

function fixture() {
	const directory = mkdtempSync(path.join(tmpdir(), "phaseo-worktrees-")); const root = path.join(directory, "repository"); mkdirSync(root);
	const git = (args: string[], cwd = root) => execFileSync("git", args, { cwd, windowsHide: true, stdio: "pipe" }).toString().trim();
	git(["init", "-b", "fixture"]); git(["config", "user.name", "Fixture"]); git(["config", "user.email", "fixture@example.invalid"]); git(["config", "commit.gpgsign", "false"]); git(["config", "core.autocrlf", "false"]);
	writeFileSync(path.join(root, "file.txt"), "Committed\n"); git(["add", "file.txt"]); git(["commit", "-m", "Fixture"]);
	return { directory, root, git };
}
function removeCleanWorktree(value: ReturnType<typeof fixture>, directory: string) {
	if (value.git(["status", "--porcelain"], directory)) throw new Error("Refusing to remove a dirty fixture worktree.");
	value.git(["worktree", "remove", directory]); value.git(["worktree", "prune"]);
}
describe("desktop Git worktrees", () => {
	it.each(["tracked", "untracked"])("refuses %s changes and retains history and branches after clean removal", async kind => {
		const value = fixture(); const workspaceDirectory = path.join(value.directory, "workspace"); const runtime = new WorkspaceRuntime(workspaceDirectory); let checkout: string | undefined;
		try {
			const source = runtime.store.addProject(value.root); const created = await runtime.createWorktree(source.id, `feature/remove-${kind}`, "HEAD"); const project = created.workspace.projects.find(value => value.id === created.projectId)!; checkout = project.directory;
			const task = runtime.store.apply({ type: "create-task", projectId: project.id, harness: "codex", model: "default", mode: "code" }); task.messages = [{ id: "history", role: "user", text: "Retained conversation", createdAt: "" }]; runtime.store.saveTask(task);
			const filename = path.join(checkout, kind === "tracked" ? "file.txt" : "notes.txt"); writeFileSync(filename, "Working changes\n");
			await expect(runtime.removeWorktree(project.id)).rejects.toThrow("tracked and untracked"); expect(readFileSync(filename, "utf8")).toBe("Working changes\n");
			if (kind === "tracked") writeFileSync(filename, "Committed\n"); else rmSync(filename);
			if (kind === "tracked") {
				await expect(removeGitWorktree(value.root, path.join(workspaceDirectory, "worktrees"), checkout, async () => { writeFileSync(filename, "Tool shutdown changes\n"); })).rejects.toThrow("tools were stopping");
				expect(readFileSync(filename, "utf8")).toBe("Tool shutdown changes\n"); writeFileSync(filename, "Committed\n");
			}
			await expect(removeGitWorktree(value.root, path.join(workspaceDirectory, "worktrees"), value.root)).rejects.toThrow("desktop-managed");
			const removed = await runtime.removeWorktree(project.id); expect(removed.projects.find(value => value.id === project.id)?.worktree?.removedAt).toBeTruthy(); expect(existsSync(checkout)).toBe(false); checkout = undefined;
			expect(removed.tasks.some(value => value.id === task.id)).toBe(true); expect(runtime.store.getTask(task.id).messages).toEqual(task.messages); expect(value.git(["branch", "--list", `feature/remove-${kind}`])).toContain(`feature/remove-${kind}`);
			await expect(runtime.command({ type: "create-task", projectId: project.id, harness: "codex", model: "default", mode: "code" })).rejects.toThrow("unavailable"); await expect(runtime.command({ type: "send", id: task.id, text: "Do not execute" })).rejects.toThrow("unavailable");
		} finally { await runtime.close(); if (checkout) { const filename = path.join(checkout, kind === "tracked" ? "file.txt" : "notes.txt"); if (kind === "tracked") writeFileSync(filename, "Committed\n"); else rmSync(filename, { force: true }); removeCleanWorktree(value, checkout); } rmSync(value.directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
	}, 30000);
	it("blocks active terminals and tasks even through a project alias", async () => {
		const value = fixture(); const runtime = new WorkspaceRuntime(path.join(value.directory, "workspace"), () => ({ run: async () => { await new Promise<void>(resolve => { finish = resolve; }); }, cancel: async () => { finish?.(); } })); let finish: (() => void) | undefined; let checkout: string | undefined;
		try {
			const source = runtime.store.addProject(value.root); const created = await runtime.createWorktree(source.id, "feature/active", "HEAD"); const project = created.workspace.projects.find(value => value.id === created.projectId)!; checkout = project.directory;
			let finishEdit!: () => void; const edit = runtime.mutateProject(project.id, async () => { await new Promise<void>(resolve => { finishEdit = resolve; }); }); try { await expect(runtime.removeWorktree(project.id)).rejects.toThrow("project edits"); } finally { finishEdit(); await edit; }
			runtime.getTerminals = () => [{ cwd: checkout!, status: "running" }]; await expect(runtime.removeWorktree(project.id)).rejects.toThrow("Close worktree terminals"); runtime.getTerminals = () => [];
			const alias = path.join(value.directory, "alias"); symlinkSync(checkout, alias, process.platform === "win32" ? "junction" : "dir"); const aliasProject = runtime.store.addProject(alias);
			const state = await runtime.command({ type: "create-task", projectId: aliasProject.id, harness: "codex", model: "default", mode: "code" }); await runtime.command({ type: "send", id: state.tasks[0].id, text: "Hold task" }); await vi.waitFor(() => expect(finish).toBeDefined());
			await expect(runtime.removeWorktree(project.id)).rejects.toThrow("Stop worktree tasks"); expect(existsSync(checkout)).toBe(true);
		} finally { await runtime.close(); if (checkout) removeCleanWorktree(value, checkout); rmSync(value.directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
	}, 30000);
	it("starts from a commit while preserving source working changes", async () => {
		const value = fixture(); const directory = path.join(value.directory, "checkout"); let created = false;
		try {
			writeFileSync(path.join(value.root, "file.txt"), "Unsaved source\n");
			const commit = await createGitWorktree(value.root, directory, "feature/worktree", "HEAD"); created = true;
			expect(value.git(["rev-parse", "HEAD"], directory)).toBe(commit); expect(value.git(["branch", "--show-current"], directory)).toBe("feature/worktree"); expect(value.git(["branch", "--show-current"])).toBe("fixture");
			expect(readFileSync(path.join(directory, "file.txt"), "utf8")).toBe("Committed\n"); expect(readFileSync(path.join(value.root, "file.txt"), "utf8")).toBe("Unsaved source\n");
			await expect(createGitWorktree(value.root, path.join(value.directory, "duplicate"), "feature/worktree", "HEAD")).rejects.toThrow();
		} finally { if (created) removeCleanWorktree(value, directory); writeFileSync(path.join(value.root, "file.txt"), "Committed\n"); rmSync(value.directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
	}, 30000);
	it("validates branch names and starting refs without creating checkouts", async () => {
		const value = fixture();
		try { await expect(createGitWorktree(value.root, path.join(value.directory, "checkout"), "--force", "HEAD")).rejects.toThrow("branch"); await expect(createGitWorktree(value.root, path.join(value.directory, "checkout"), "feature/test", "--force")).rejects.toThrow("starting ref"); expect(value.git(["worktree", "list", "--porcelain"]).split("worktree ")).toHaveLength(2); }
		finally { rmSync(value.directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
	}, 30000);
	it("registers managed checkout projects durably without starting tasks", async () => {
		const value = fixture(); const workspaceDirectory = path.join(value.directory, "workspace"); const runtime = new WorkspaceRuntime(workspaceDirectory); let checkout: string | undefined; let closed = false;
		try {
			const source = runtime.store.addProject(value.root); const result = await runtime.createWorktree(source.id, "feature/managed", "fixture"); const project = result.workspace.projects.find(value => value.id === result.projectId)!; checkout = project.directory;
			expect(path.relative(path.join(workspaceDirectory, "worktrees"), project.directory).split(path.sep)).toHaveLength(1); expect(project.worktree).toEqual({ sourceProjectId: source.id, branch: "feature/managed", baseCommit: value.git(["rev-parse", "fixture"]) }); expect(result.workspace.tasks).toEqual([]);
			await runtime.close(); closed = true; const restored = new WorkspaceStore(path.join(workspaceDirectory, "workspace.sqlite")); try { expect(restored.get().projects.find(value => value.id === project.id)?.worktree).toEqual(project.worktree); } finally { restored.close(); }
		} finally { if (!closed) await runtime.close(); if (checkout) removeCleanWorktree(value, checkout); rmSync(value.directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
	}, 30000);
});
