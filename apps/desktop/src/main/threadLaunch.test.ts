import { describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { WorkspaceRuntime } from "./workspaceRuntime";
import { MissionService } from "./missionService";
import type { AgentAdapter } from "./agentAdapter";
import { validateLaunchBatch } from "./threadTools";
import { defaultPreferences } from "../shared/preferences";
import { threadToolLabel } from "../shared/orchestration";
import { IssueIsPullRequestError, type IssueDetails } from "../shared/issueView";

/** Each run blocks until cancelled, so launched chats stay active while the test inspects them. */
function gated() {
	const run = vi.fn<AgentAdapter["run"]>();
	return { run, factory: (): AgentAdapter => { let release: (() => void) | undefined; return { run: async (...args) => { run(...args); await new Promise<void>(resolve => { release = resolve; }); }, cancel: async () => { release?.(); } }; } };
}
async function withRuntime(test: (runtime: WorkspaceRuntime, directory: string, run: ReturnType<typeof gated>["run"]) => Promise<void>) {
	const directory = mkdtempSync(path.join(tmpdir(), "phaseo-launch-")), { run, factory } = gated(), runtime = new WorkspaceRuntime(path.join(directory, "workspace"), factory);
	try { await test(runtime, directory, run); } finally { await runtime.close(); rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
}
const caller = async (runtime: WorkspaceRuntime, mode: "chat" | "plan" | "code" = "code", permissionMode: "supervised" | "full-access" = "full-access", projectId?: string) => {
	const before = new Set(runtime.store.getOverview().tasks.map(task => task.id));
	return (await runtime.command({ type: "create-task", harness: "codex", model: "owned", mode, permissionMode, projectId })).tasks.find(task => !before.has(task.id))!.id;
};
function repository(directory: string) {
	const root = path.join(directory, "repository"); mkdirSync(root);
	const git = (args: string[]) => execFileSync("git", args, { cwd: root, windowsHide: true, stdio: "pipe" }).toString().trim();
	git(["init", "-b", "fixture"]); git(["config", "user.name", "Fixture"]); git(["config", "user.email", "fixture@example.invalid"]); git(["config", "commit.gpgsign", "false"]);
	writeFileSync(path.join(root, "file.txt"), "Committed\n"); git(["add", "file.txt"]); git(["commit", "-m", "Fixture"]);
	return { root, git };
}

describe("launch_thread", () => {
	it("creates an idempotent top-level chat the launcher can read, wait for and message", async () => withRuntime(async (runtime, _directory, run) => {
		const parentId = await caller(runtime), tools = runtime.threadTools(parentId);
		const launched = await tools.launch!({ requestId: "review", title: "Review", prompt: "Review the repository" });
		expect(launched).toEqual({ id: expect.any(String), title: "Review" });
		expect((await tools.launch!({ requestId: "review", title: "Other", prompt: "Other" })).id).toBe(launched.id);
		await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
		expect(run.mock.calls[0][2]).toBe("Review the repository");
		const stored = runtime.store.getTask(launched.id);
		expect(stored).toMatchObject({ launch: { byTaskId: parentId, requestId: "review" }, mode: "code", permissionMode: "full-access", model: "owned" });
		expect(stored.delegation).toBeUndefined(); expect(stored.parentId).toBeUndefined();
		expect(runtime.store.getOverview().tasks.find(task => task.id === launched.id)?.launch).toEqual({ byTaskId: parentId, requestId: "review" });
		expect(runtime.store.taskHistory({ query: "", archived: false, offset: 0, limit: 50 }).tasks.map(task => task.id)).toContain(launched.id);
		expect(tools.list().map(task => task.id)).toContain(launched.id);
		expect(tools.read(launched.id).thread.id).toBe(launched.id);
		expect(await tools.wait(launched.id, 0)).toMatchObject({ timedOut: true, thread: { status: "running" } });
		expect(await tools.wait(launched.id, 0)).not.toHaveProperty("deliveryQueued");
		await tools.send!(launched.id, "Also check tests");
		expect(runtime.store.getTask(launched.id).queue.map(item => item.text)).toEqual(["Also check tests"]);
		await tools.interrupt(launched.id);
		expect(runtime.store.getTask(launched.id).status).toBe("interrupted");
		// Another chat's launches stay private.
		const other = runtime.threadTools(await caller(runtime));
		expect(() => other.read(launched.id)).toThrow("outside"); await expect(other.send!(launched.id, "Hi")).rejects.toThrow("outside");
	}));
	it("requires full access outside Plan mode and never widens mode or permissions", async () => withRuntime(async runtime => {
		const request = { requestId: "a", title: "A", prompt: "Work" };
		await expect(runtime.threadTools(await caller(runtime, "code", "supervised")).launch!(request)).rejects.toThrow("full access outside Plan mode");
		await expect(runtime.threadTools(await caller(runtime, "plan")).launch!(request)).rejects.toThrow("full access outside Plan mode");
		const chat = runtime.threadTools(await caller(runtime, "chat"));
		await expect(chat.launch!({ ...request, mode: "code" })).rejects.toThrow("cannot use code mode");
		const narrow = await runtime.threadTools(await caller(runtime)).launch!({ ...request, mode: "plan", permissionMode: "supervised" });
		expect(runtime.store.getTask(narrow.id)).toMatchObject({ mode: "plan", permissionMode: "supervised" });
		expect(runtime.store.getTask((await chat.launch!(request)).id).mode).toBe("chat");
		await expect(runtime.threadTools(await caller(runtime)).launch!({ ...request, model: "default" })).rejects.toThrow("explicit model");
		expect(runtime.store.getOverview().tasks.filter(task => task.launch)).toHaveLength(2);
	}));
	it("counts running launches toward the active-agent limit", async () => withRuntime(async runtime => {
		runtime.store.savePreferences({ ...defaultPreferences, maxActiveAgents: 1 });
		const tools = runtime.threadTools(await caller(runtime));
		await tools.launch!({ requestId: "a", title: "A", prompt: "Work" });
		await expect(tools.launch!({ requestId: "b", title: "B", prompt: "Work" })).rejects.toThrow("Agents running at once");
		await expect(tools.delegate({ requestId: "c", title: "C", prompt: "Work" })).rejects.toThrow("Agents running at once");
	}));
	it("leaves launched chats running when the launcher is stopped or archived", async () => withRuntime(async (runtime, _directory, run) => {
		const parentId = await caller(runtime), tools = runtime.threadTools(parentId);
		const launched = await tools.launch!({ requestId: "independent", title: "Independent", prompt: "Work" });
		const child = await tools.delegate({ requestId: "owned", title: "Owned", prompt: "Work" });
		await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
		await runtime.command({ type: "cancel", id: parentId });
		expect(runtime.store.getTask(child.id).status).toBe("interrupted");
		expect(runtime.store.getTask(launched.id).status).toBe("running");
		await runtime.command({ type: "update-task", id: parentId, archived: true });
		expect(runtime.store.getTask(launched.id)).toMatchObject({ status: "running", archived: false });
	}));
	it("resolves project, worktree and existing-worktree workspaces", async () => withRuntime(async (runtime, directory) => {
		const { root, git } = repository(directory), source = runtime.store.addProject(root), other = runtime.store.addProject(mkdtempSync(path.join(directory, "other-")));
		const parentId = await caller(runtime, "code", "full-access", source.id), tools = runtime.threadTools(parentId);
		expect((await tools.launch!({ requestId: "same", title: "Same", prompt: "Work" })).projectId).toBe(source.id);
		expect(await tools.launch!({ requestId: "none", title: "None", prompt: "Work", workspace: { strategy: "none" } })).not.toHaveProperty("projectId");
		expect((await tools.launch!({ requestId: "project", title: "Project", prompt: "Work", workspace: { strategy: "project", projectId: other.id } })).projectId).toBe(other.id);
		await expect(tools.launch!({ requestId: "bad", title: "Bad", prompt: "Work", workspace: { strategy: "existing_worktree", projectId: other.id } })).rejects.toThrow("not a worktree");
		const created = await tools.launch!({ requestId: "worktree", title: "Worktree", prompt: "Work", workspace: { strategy: "worktree", branch: "feature/launched" } });
		expect(created.worktree?.branch).toBe("feature/launched");
		const project = runtime.store.getProjects().find(value => value.id === created.projectId)!;
		expect(project.worktree).toMatchObject({ sourceProjectId: source.id, branch: "feature/launched", baseCommit: git(["rev-parse", "HEAD"]) });
		expect(project.directory).toBe(created.worktree!.directory);
		expect(git(["branch", "--list", "feature/launched"])).toContain("feature/launched");
		expect((await tools.launch!({ requestId: "worktree", title: "Worktree", prompt: "Work", workspace: { strategy: "worktree", branch: "feature/launched" } })).id).toBe(created.id);
		const reused = await tools.launch!({ requestId: "existing", title: "Existing", prompt: "Work", workspace: { strategy: "existing_worktree", projectId: project.id } });
		expect(reused).toMatchObject({ projectId: project.id, worktree: { branch: "feature/launched" } });
		expect(tools.projects!()).toEqual(expect.arrayContaining([expect.objectContaining({ id: source.id, current: true, directory: "repository" }), expect.objectContaining({ id: project.id, worktree: expect.objectContaining({ branch: "feature/launched", sourceProjectId: source.id }) })]));
		expect(tools.projects!("repository").map(value => value.id)).toContain(source.id);
		await expect(runtime.threadTools(await caller(runtime)).launch!({ requestId: "w", title: "W", prompt: "Work", workspace: { strategy: "worktree", branch: "feature/x" } })).rejects.toThrow("no project");
	}));
});

describe("launch_threads", () => {
	it("validates every entry before creating any, then reports each result", async () => withRuntime(async runtime => {
		expect(() => validateLaunchBatch({ threads: [{ requestId: "a", title: "A", prompt: "A" }, { requestId: "a", title: "B", prompt: "B" }] })).toThrow("distinct requestId");
		expect(() => validateLaunchBatch({ threads: Array.from({ length: 21 }, (_, index) => ({ requestId: `${index}`, title: "T", prompt: "P" })) })).toThrow("1 to 20");
		expect(() => validateLaunchBatch({ threads: [{ requestId: "a", title: "A", prompt: "A", workspace: { strategy: "elsewhere" } }] })).toThrow("threads[0]");
		const tools = runtime.threadTools(await caller(runtime));
		await expect(tools.launchBatch!([{ requestId: "a", title: "A", prompt: "A" }, { requestId: "b", title: "B", prompt: "B", workspace: { strategy: "project", projectId: "missing" } }])).rejects.toThrow("Nothing was launched. b:");
		expect(runtime.store.getOverview().tasks.filter(task => task.launch)).toHaveLength(0);
		runtime.store.savePreferences({ ...defaultPreferences, maxActiveAgents: 2 });
		await expect(tools.launchBatch!(["a", "b", "c"].map(id => ({ requestId: id, title: id, prompt: id })))).rejects.toThrow("would exceed the limit");
		const { results } = await tools.launchBatch!([{ requestId: "a", title: "A", prompt: "A" }, { requestId: "b", title: "B", prompt: "B", mode: "chat" }]);
		expect(results.map(result => "title" in result && result.title)).toEqual(["A", "B"]);
		expect((await tools.launchBatch!([{ requestId: "a", title: "A", prompt: "A" }])).results[0]).toEqual(results[0]);
	}));
});

describe("organize_thread", () => {
	it("pins, renames and archives owned and launched chats only, stopping what it archives", async () => withRuntime(async (runtime, _directory, run) => {
		const parentId = await caller(runtime), tools = runtime.threadTools(parentId);
		expect(await tools.organize!(parentId, "pin")).toMatchObject({ id: parentId, pinned: true });
		const launched = await tools.launch!({ requestId: "l", title: "Launched", prompt: "Work" });
		expect(await tools.organize!(launched.id, "rename", "Renamed")).toMatchObject({ title: "Renamed" });
		await expect(tools.organize!(launched.id, "rename")).rejects.toThrow("Invalid chat title");
		await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
		const grandchild = await runtime.threadTools(launched.id).delegate({ requestId: "g", title: "Grandchild", prompt: "Work" });
		await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
		expect(await tools.organize!(launched.id, "archive")).toMatchObject({ status: "interrupted", archived: true });
		expect(runtime.store.getTask(grandchild.id).status).toBe("interrupted");
		expect(await tools.organize!(launched.id, "unarchive")).toMatchObject({ archived: false });
		await expect(tools.organize!(parentId, "archive")).rejects.toThrow("cannot archive itself");
		const unrelated = await caller(runtime);
		await expect(tools.organize!(unrelated, "pin")).rejects.toThrow("outside");
		await expect(tools.organize!(grandchild.id, "pin")).rejects.toThrow("outside");
		expect(threadToolLabel("organize_thread", { action: "archive" })).toBe("Archive chat");
		expect(threadToolLabel("organize_thread", { action: "pin" })).toBe("Organise chat");
		expect(threadToolLabel("launch_thread")).toBe("Launch chat");
	}));
});

describe("pull request tools", () => {
	it("link, watch, unwatch and unlink on this chat and chats it started, with the UI's rules", async () => withRuntime(async (runtime, directory) => {
		const { root, git } = repository(directory); git(["remote", "add", "origin", "https://github.com/owned/repo.git"]);
		const projectId = runtime.store.addProject(root).id, parentId = await caller(runtime, "code", "full-access", projectId), tools = runtime.threadTools(parentId);
		expect(await tools.pullRequest!(undefined, "link", { url: "https://github.com/owned/repo/pull/42" })).toEqual({ repository: "owned/repo", number: 42, url: "https://github.com/owned/repo/pull/42", alreadyLinked: false });
		expect(await tools.pullRequest!(parentId, "link", { number: 42 })).toMatchObject({ repository: "owned/repo", alreadyLinked: true });
		expect(runtime.store.getTask(parentId).pullRequests).toEqual([expect.objectContaining({ source: "agent" })]);
		expect(await tools.pullRequest!(undefined, "watch", { repository: "other/repo", number: 7 })).toMatchObject({ repository: "other/repo", number: 7, watching: true, wasWatching: false });
		expect(runtime.pullRequestWatchTargets().map(target => target.link.number)).toEqual([7]);
		expect(await tools.pullRequest!(undefined, "unwatch", { number: 7 })).toMatchObject({ watching: false, wasWatching: true });
		expect(await tools.pullRequest!(undefined, "unlink", { url: "https://github.com/owned/repo/pull/42" })).toMatchObject({ wasLinked: true });
		expect(await tools.pullRequest!(undefined, "unlink", { number: 42 })).toMatchObject({ wasLinked: false });
		await expect(tools.pullRequest!(undefined, "link", { url: "https://example.com/pull/1" })).rejects.toThrow("not a GitHub pull request");
		const child = await tools.delegate({ requestId: "c", title: "Child", prompt: "Work", background: true });
		await expect(runtime.threadTools(child.id).pullRequest!(undefined, "watch", { number: 3 })).rejects.toThrow("delegated agent");
		expect(await tools.pullRequest!(child.id, "link", { number: 3 })).toMatchObject({ repository: "owned/repo", number: 3 });
		const unrelated = await caller(runtime);
		await expect(tools.pullRequest!(unrelated, "link", { number: 3 })).rejects.toThrow("outside");
	}));
	it("lists links with their stacks, and writes and reads guides through the checkout of each repository", async () => withRuntime(async (runtime, directory) => {
		const { root, git } = repository(directory); git(["remote", "add", "origin", "https://github.com/owned/repo.git"]);
		const projectId = runtime.store.addProject(root).id, parentId = await caller(runtime, "code", "full-access", projectId), tools = runtime.threadTools(parentId);
		await tools.pullRequest!(undefined, "link", { number: 1 }); await tools.pullRequest!(undefined, "link", { number: 2 });
		const snapshot = { title: "One", state: "open" as const, draft: false, mergeable: "MERGEABLE" as const, checks: "passing" as const, review: "none" as const, additions: 1, deletions: 1, author: "a", head: "one", base: "main", updatedAt: "2026-10-16T00:00:00Z" };
		runtime.store.syncPullRequestSnapshot("owned/repo", 1, snapshot); runtime.store.syncPullRequestSnapshot("owned/repo", 2, { ...snapshot, title: "Two", head: "two", base: "one" });
		const listed = await tools.pullRequestList!(undefined);
		expect(listed.chains).toEqual([{ kind: "derived", numbers: [1, 2] }]);
		expect(listed.pullRequests.find(entry => entry.number === 2)).toMatchObject({ source: "agent", state: "open", title: "Two", headBranch: "two", baseBranch: "one", stack: { kind: "derived", position: 2, size: 2 } });
		const calls: string[] = [];
		runtime.pullRequestGuideTools = { write: async (cwd, repo, number) => { calls.push(`${cwd}|${repo}#${number}`); return number === 2 ? "running" : "started"; }, read: async () => ({ guide: { headSha: "a".repeat(40), generatedAt: "2026-10-16T00:00:00Z", model: "m", stops: [] }, running: false, currentHeadSha: "b".repeat(40) }) };
		expect(await tools.writePullRequestGuides!([{ number: 1 }, { url: "https://github.com/owned/repo/pull/2" }, { repository: "other/repo", number: 3 }])).toEqual({ guides: [
			{ repository: "owned/repo", number: 1, url: "https://github.com/owned/repo/pull/1", outcome: "started", detail: null },
			{ repository: "owned/repo", number: 2, url: "https://github.com/owned/repo/pull/2", outcome: "running", detail: null },
			{ repository: "other/repo", number: 3, url: "https://github.com/other/repo/pull/3", outcome: "failed", detail: expect.stringContaining("No project in this workspace is a checkout of other/repo") },
		] });
		expect(calls).toEqual([`${root}|owned/repo#1`, `${root}|owned/repo#2`]);
		expect(await tools.readPullRequestGuide!({ number: 1 })).toMatchObject({ repository: "owned/repo", number: 1, run: null, stale: true, currentHeadSha: "b".repeat(40) });
	}));
});

describe("scheduled-task tools", () => {
	it("creates, lists, updates, runs and deletes missions through the mission service", async () => withRuntime(async (runtime, _directory, run) => {
		let now = Date.now(); const service = new MissionService(runtime, () => now);
		try {
			const parentId = await caller(runtime), tools = runtime.threadTools(parentId);
			const created = await tools.schedule!({ title: "Nightly", prompt: "Check builds", schedule: { type: "daily", time: "02:30", weekdays: [] } });
			expect(created).toMatchObject({ title: "Nightly", templateTaskId: parentId, enabled: true, nextRunAt: expect.any(String), lastStatus: "never" });
			const paused = await tools.schedule!({ title: "Paused", prompt: "Later", schedule: { type: "interval", minutes: 30 }, enabled: false });
			expect(paused).toMatchObject({ enabled: false }); expect(paused.nextRunAt).toBeUndefined();
			expect(tools.scheduled!().map(mission => mission.id).toSorted()).toEqual([created.id, paused.id].toSorted());
			now += 1000;
			expect(await tools.updateSchedule!(created.id, { title: "Hourly", schedule: { type: "interval", minutes: 60 }, enabled: false })).toMatchObject({ title: "Hourly", prompt: "Check builds", schedule: { type: "interval", minutes: 60 }, enabled: false });
			await expect(tools.updateSchedule!(created.id, {})).rejects.toThrow("Choose");
			const ran = await tools.runSchedule!(created.id);
			expect(ran).toMatchObject({ lastStatus: "running", runCount: 1, lastTaskId: expect.any(String) });
			await vi.waitFor(() => expect(run).toHaveBeenCalledOnce()); expect(run.mock.calls[0][2]).toBe("Check builds");
			// A run takes the scheduling chat's permissions, not the supervised default.
			expect(runtime.store.getTask(ran.lastTaskId!)).toMatchObject({ permissionMode: "full-access", mode: "code", missionId: created.id });
			await runtime.command({ type: "cancel", id: ran.lastTaskId! }); service.observe(runtime.store.getOverview());
			expect(await tools.deleteSchedule!(paused.id)).toEqual({ id: paused.id, deleted: true });
			expect(tools.scheduled!().map(mission => mission.id)).toEqual([created.id]);
		} finally { service.close(); }
	}));
	it("rejects supervised, Plan and broader-template callers but lets anyone list", async () => withRuntime(async runtime => {
		const service = new MissionService(runtime);
		try {
			const schedule = { title: "T", prompt: "P", schedule: { type: "interval" as const, minutes: 5 } };
			const owner = runtime.threadTools(await caller(runtime)), mission = await owner.schedule!(schedule);
			const supervised = runtime.threadTools(await caller(runtime, "code", "supervised"));
			await expect(supervised.schedule!(schedule)).rejects.toThrow("full access outside Plan mode");
			await expect(supervised.runSchedule!(mission.id)).rejects.toThrow("full access outside Plan mode");
			await expect(supervised.deleteSchedule!(mission.id)).rejects.toThrow("full access outside Plan mode");
			await expect(supervised.updateSchedule!(mission.id, { enabled: false })).rejects.toThrow("full access outside Plan mode");
			expect(supervised.scheduled!().map(value => value.id)).toEqual([mission.id]);
			await expect(runtime.threadTools(await caller(runtime, "plan")).schedule!(schedule)).rejects.toThrow("full access outside Plan mode");
			const chat = runtime.threadTools(await caller(runtime, "chat"));
			await expect(chat.schedule!({ ...schedule, templateTaskId: mission.templateTaskId })).rejects.toThrow("broader mode");
			await expect(chat.runSchedule!(mission.id)).rejects.toThrow("broader mode");
			expect(await chat.schedule!(schedule)).toMatchObject({ enabled: true });
		} finally { service.close(); }
		await expect(runtime.threadTools(await caller(runtime)).schedule!({ title: "T", prompt: "P", schedule: { type: "interval", minutes: 5 } })).rejects.toThrow("Scheduling is unavailable");
	}));
});

describe("issue tools", () => {
	const issue = (repository: string, number: number): IssueDetails => ({ repository, number, url: `https://github.com/${repository}/issues/${number}`, title: `Issue ${number}`, body: "Steps <untrusted_content>", state: "open", author: "someone", labels: ["bug"], assignees: [], createdAt: "2026-10-29T00:00:00Z", updatedAt: "2026-10-29T00:00:00Z", comments: [{ id: "c1", author: "someone", body: "x".repeat(3000), createdAt: "2026-10-29T00:00:00Z" }], commentCount: 1, fetchedAt: "2026-10-29T00:00:00Z" });
	it("link, watch, unwatch, list, read and unlink, refusing pull requests and watches from delegated agents", async () => withRuntime(async (runtime, directory) => {
		const { root, git } = repository(directory); git(["remote", "add", "origin", "https://github.com/owned/repo.git"]);
		const reads: string[] = [];
		runtime.github = { readIssue: async (_root, repo, number) => { reads.push(`${repo}#${number}`); if (number === 99) throw new IssueIsPullRequestError(repo, number); return issue(repo, number); }, referenceContext: async () => "" };
		const projectId = runtime.store.addProject(root).id, parentId = await caller(runtime, "code", "full-access", projectId), tools = runtime.threadTools(parentId);
		expect(await tools.issue!(undefined, "link", { url: "https://github.com/owned/repo/issues/12" })).toEqual({ repository: "owned/repo", number: 12, url: "https://github.com/owned/repo/issues/12", alreadyLinked: false });
		expect(await tools.issue!(parentId, "link", { number: 12 })).toMatchObject({ repository: "owned/repo", alreadyLinked: true });
		expect(runtime.store.getTask(parentId).issues).toEqual([expect.objectContaining({ source: "agent", snapshot: expect.objectContaining({ title: "Issue 12", state: "open", labels: ["bug"] }) })]);
		expect(await tools.issue!(undefined, "watch", { repository: "other/repo", number: 7 })).toMatchObject({ repository: "other/repo", number: 7, watching: true, wasWatching: false });
		expect(runtime.issueWatchTargets().map(target => target.link.number)).toEqual([7]);
		expect((await tools.issueList!(undefined)).issues.map(entry => [entry.number, entry.watching, entry.title])).toEqual([[12, false, "Issue 12"], [7, true, "Issue 7"]]);
		expect(await tools.issue!(undefined, "unwatch", { number: 7 })).toMatchObject({ watching: false, wasWatching: true });
		expect(await tools.issue!(undefined, "unlink", { url: "https://github.com/owned/repo/issues/12" })).toMatchObject({ wasLinked: true });
		expect(await tools.issue!(undefined, "unlink", { number: 12 })).toMatchObject({ wasLinked: false });
		await expect(tools.issue!(undefined, "link", { number: 99 })).rejects.toThrow("is a pull request, not an issue");
		await expect(tools.issue!(undefined, "link", { url: "https://github.com/owned/repo/pull/5" })).rejects.toThrow("pull request tools");
		const read = await tools.readIssue!({ number: 5 });
		expect(read).toMatchObject({ repository: "owned/repo", number: 5, linked: false, commentCount: 1, commentsShown: 1 });
		expect(read.body).toMatch(/^<untrusted_content source="issue #5 body">\nSteps <untrusted-content>\n<\/untrusted_content>$/);
		expect(read.comments[0].body.length).toBeLessThan(2200);
		const child = await tools.delegate({ requestId: "c", title: "Child", prompt: "Work", background: true });
		await expect(runtime.threadTools(child.id).issue!(undefined, "watch", { number: 3 })).rejects.toThrow("delegated agent");
		expect(await tools.issue!(child.id, "link", { number: 3 })).toMatchObject({ repository: "owned/repo", number: 3 });
		const unrelated = await caller(runtime);
		await expect(tools.issue!(unrelated, "link", { number: 3 })).rejects.toThrow("outside");
		expect(reads).toContain("owned/repo#99");
	}));
	it("adds the context of # references to the prompt the agent receives", async () => withRuntime(async (runtime, _directory, run) => {
		const contexts: string[][] = [];
		runtime.github = { readIssue: async (_root, repo, number) => issue(repo, number), referenceContext: async (_root, urls) => { contexts.push(urls); return "\n\nReferenced: Issue owned/repo#12"; } };
		const id = await caller(runtime);
		await runtime.command({ type: "send", id, text: "Fix [#12 Issue 12](https://github.com/owned/repo/issues/12)", githubReferences: ["https://github.com/owned/repo/issues/12"] });
		await vi.waitFor(() => expect(run).toHaveBeenCalled());
		expect(contexts).toEqual([["https://github.com/owned/repo/issues/12"]]);
		expect(run.mock.calls[0][2]).toContain("Referenced: Issue owned/repo#12");
		expect(runtime.store.getTask(id).messages[0].githubReferences).toEqual(["https://github.com/owned/repo/issues/12"]);
	}));
});
