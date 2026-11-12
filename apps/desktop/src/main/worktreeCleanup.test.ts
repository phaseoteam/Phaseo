import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Project } from "../shared/workspace";
import type { TaskOverview } from "../shared/workspaceOverview";
import { defaultWorktreeCleanup } from "../shared/preferences";
import { validateWorktreeCleanupRequest } from "../shared/worktreeCleanup";
import { planWorktreeCleanup } from "./worktreeCleanup";

const day = 86_400_000, now = Date.parse("2026-10-27T12:00:00Z"), old = new Date(now - 40 * day).toISOString();
let directory: string, source: Project;
const projects: Project[] = [];
const git = (args: string[], cwd: string) => execFileSync("git", args, { cwd, windowsHide: true, stdio: "pipe" }).toString().trim();
/** A worktree on `branch`, optionally with a commit that is pushed, or not. */
function worktree(name: string, commit?: "pushed" | "local") {
	const checkout = path.join(directory, "worktrees", name);
	git(["worktree", "add", "-b", name, checkout, "main"], source.directory);
	if (commit) { writeFileSync(path.join(checkout, `${name}.txt`), "work\n"); git(["add", "."], checkout); git(["commit", "-m", name], checkout); if (commit === "pushed") git(["push", "-u", "origin", name], checkout); }
	const project: Project = { id: name, name: `repo · ${name}`, directory: checkout, createdAt: old, worktree: { sourceProjectId: "source", branch: name, baseCommit: "x" } };
	projects.push(project); return project;
}
const chat = (projectId: string, patch: Partial<TaskOverview> = {}) => ({ id: `${projectId}-chat`, projectId, status: "completed", archived: false, updatedAt: old, createdAt: old, ...patch }) as TaskOverview;

beforeAll(() => {
	directory = mkdtempSync(path.join(tmpdir(), "phaseo-worktree-cleanup-"));
	const remote = path.join(directory, "remote.git"), root = path.join(directory, "repo"); mkdirSync(root);
	git(["init", "--bare", "-b", "main", remote], directory);
	git(["init", "-b", "main"], root); git(["config", "user.name", "Fixture"], root); git(["config", "user.email", "fixture@example.invalid"], root); git(["config", "commit.gpgsign", "false"], root);
	writeFileSync(path.join(root, "a.txt"), "one\n"); git(["add", "."], root); git(["commit", "-m", "First"], root);
	git(["remote", "add", "origin", remote], root); git(["push", "-u", "origin", "main"], root); git(["remote", "set-head", "origin", "main"], root);
	source = { id: "source", name: "repo", directory: root, createdAt: old }; projects.push(source);
}, 30000);
afterAll(() => { rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });

describe("worktree cleanup rules", () => {
	it("removes only what the rules pick and keeps anything with work that exists only here", async () => {
		const unchanged = worktree("unchanged"), dirty = worktree("dirty"), local = worktree("local", "local"), merged = worktree("merged", "local"), settled = worktree("settled", "pushed"), running = worktree("running"), moved = worktree("moved"); worktree("orphan");
		writeFileSync(path.join(dirty.directory, "notes.txt"), "draft\n");
		git(["switch", "-c", "elsewhere"], moved.directory);
		const tasks = [chat(unchanged.id), chat(dirty.id), chat(local.id), chat(merged.id), chat(settled.id, { settledOverride: "settled", settledAt: new Date(now - 8 * day).toISOString() }), chat(running.id, { status: "running" }), chat(moved.id)];
		const head = git(["rev-parse", "HEAD"], merged.directory);
		const entries = await planWorktreeCleanup({ projects, tasks, rules: { ...defaultWorktreeCleanup, afterDays: null }, now, blocked: () => undefined, merged: async (_root, branch, sha) => branch === "merged" && sha === head });
		const outcome = Object.fromEntries(entries.map(entry => [entry.projectId, `${entry.outcome}: ${entry.reason}`]));
		expect(outcome).toEqual({
			unchanged: "remove: No commits beyond main",
			dirty: "keep: Has uncommitted changes (1 file)",
			local: "keep: Not settled",
			merged: "remove: Its pull request was merged",
			settled: "remove: Settled for 8 days",
			running: "keep: A chat is running or has queued messages",
			moved: "keep: Its branch changed",
			orphan: "remove: No chat uses it any more",
		});
	}, 60000);

	it("never removes unpushed commits for inactivity, and respects what holds a worktree", async () => {
		const stale = projects.find(project => project.id === "local")!;
		const [inactive] = await planWorktreeCleanup({ projects, tasks: [chat(stale.id)], rules: { ...defaultWorktreeCleanup, afterDays: 30 }, now, blocked: () => undefined, merged: async () => false, only: new Set([stale.id]) });
		expect(inactive).toMatchObject({ outcome: "keep", reason: "Has 1 commit not pushed" });
		const [held] = await planWorktreeCleanup({ projects, tasks: [], rules: defaultWorktreeCleanup, now, blocked: () => "A terminal is open in it", only: new Set(["unchanged"]) });
		expect(held).toMatchObject({ outcome: "keep", reason: "A terminal is open in it" });
		const off = await planWorktreeCleanup({ projects, tasks: [chat("unchanged")], rules: { ...defaultWorktreeCleanup, unchanged: false, onMerge: false, afterDays: null, settledAfterDays: null }, now, blocked: () => undefined, only: new Set(["unchanged"]) });
		expect(off[0].outcome).toBe("keep");
	}, 60000);

	it("validates requests", () => {
		expect(validateWorktreeCleanupRequest({ type: "remove", projectIds: ["a", "a", "b"] })).toEqual({ type: "remove", projectIds: ["a", "b"] });
		expect(() => validateWorktreeCleanupRequest({ type: "remove", projectIds: [1] })).toThrow();
	});
});
