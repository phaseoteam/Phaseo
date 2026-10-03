import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createGitWorktree } from "./gitWorktrees";
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
