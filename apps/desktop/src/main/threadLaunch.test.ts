import { describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { WorkspaceRuntime } from "./workspaceRuntime";
import { MissionService } from "./missionService";
import type { AgentAdapter } from "./agentAdapter";
import { threadTools, validateDelegate, validateLaunch, validateLaunchBatch } from "./threadTools";
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

describe("delegate_task isolation", () => {
	it("gives each worktree child its own checkout and branch from the parent's commit, once per requestId", async () => withRuntime(async (runtime, directory, run) => {
		const { root, git } = repository(directory), source = runtime.store.addProject(root);
		writeFileSync(path.join(root, "file.txt"), "Uncommitted\n");
		const parentId = await caller(runtime, "code", "full-access", source.id), tools = runtime.threadTools(parentId);
		const [first, again] = await Promise.all([tools.delegate({ requestId: "fix", title: "Fix the parser", prompt: "Fix it", isolation: "worktree" }), tools.delegate({ requestId: "fix", title: "Fix the parser", prompt: "Fix it", isolation: "worktree" })]);
		expect(again.id).toBe(first.id);
		expect(first.worktree?.branch).toMatch(/^phaseo\/fix-the-parser-[0-9a-f]{6}$/);
		const project = runtime.store.getProjects().find(value => value.id === first.worktree!.projectId)!;
		expect(project.worktree).toMatchObject({ sourceProjectId: source.id, branch: first.worktree!.branch, baseCommit: git(["rev-parse", "HEAD"]) });
		expect(readFileSync(path.join(project.directory, "file.txt"), "utf8").replace(/\r\n/g, "\n")).toBe("Committed\n");
		expect(runtime.store.getTask(first.id)).toMatchObject({ projectId: project.id, delegation: { parentTaskId: parentId, requestId: "fix" } });
		expect((await tools.delegate({ requestId: "fix", title: "Fix the parser", prompt: "Fix it", isolation: "worktree" })).worktree).toEqual(first.worktree);
		const named = await tools.delegate({ requestId: "docs", title: "Docs", prompt: "Write", isolation: "worktree", branch: "feature/docs" });
		expect(named.worktree?.branch).toBe("feature/docs");
		const shared = await tools.delegate({ requestId: "shared", title: "Shared", prompt: "Look" });
		expect(shared).not.toHaveProperty("worktree"); expect(runtime.store.getTask(shared.id).projectId).toBe(source.id);
		expect(await tools.wait(first.id, 0)).toMatchObject({ timedOut: true, worktree: first.worktree });
		expect(await tools.wait(shared.id, 0)).not.toHaveProperty("worktree");
		await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(3));
		const noProject = runtime.threadTools(await caller(runtime));
		await expect(noProject.delegate({ requestId: "x", title: "X", prompt: "X", isolation: "worktree" })).rejects.toThrow("no project");
		expect(() => validateDelegate({ requestId: "x", title: "X", prompt: "X", branch: "a" })).toThrow("branch needs isolation worktree.");
		expect(() => validateLaunch({ requestId: "x", title: "X", prompt: "X", isolation: "worktree" })).toThrow("isolation applies to delegate_task");
	}));
});

describe("html_render", () => {
	it("puts the page on the running turn and refuses once the turn has ended", async () => withRuntime(async (runtime, _directory, run) => {
		runtime.htmlPreview = async request => ({ width: request.width, contentHeight: 120, capturedHeight: 120, consoleMessages: [], image: { mimeType: "image/png", data: "QUJD" } });
		const id = await caller(runtime, "chat");
		await runtime.command({ type: "send", id, text: "Chart it" });
		await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
		const html = run.mock.calls[0][3].threads!.html!;
		expect(await html.render({ html: "<svg></svg>", title: "Sales", height: 200 })).toMatchObject({ shown: true, title: "Sales" });
		await vi.waitFor(() => expect(runtime.store.getTask(id).activities?.find(activity => activity.htmlRender)).toMatchObject({ type: "tool", text: "<svg></svg>", htmlRender: { title: "Sales", height: 200 } }));
		const tools = threadTools(runtime.threadTools(id), { images: false });
		expect(await tools.find(tool => tool.id === "html_preview")!.execute({ html: "<p>x</p>" })).toEqual({ width: 720, contentHeight: 120, capturedHeight: 120, consoleMessages: [] });
		await runtime.command({ type: "cancel", id });
		await expect(html.render({ html: "<p>", title: "Late", height: 100 })).rejects.toThrow("only while this chat's turn is running");
	}));
});

describe("answering a child's questions", () => {
	it("ends the parent's wait, reads the question and answers it as the person would, never secrets", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-questions-")), answered: Record<string, string[]>[] = [];
		const factory = (): AgentAdapter => ({ run: async (task, _cwd, _text, callbacks) => {
			if (!task.delegation) { await new Promise<void>(() => undefined); return; }
			answered.push(await callbacks.onQuestion!([{ id: "colour", header: "Colour", question: "Which colour?", options: [{ label: "Red" }, { label: "Blue", value: "blue" }] }]));
			await callbacks.onQuestion!([{ id: "token", header: "Token", question: "Paste the token", isSecret: true }]);
		}, cancel: async () => undefined });
		const runtime = new WorkspaceRuntime(path.join(directory, "workspace"), factory);
		try {
			const parentId = await caller(runtime), tools = runtime.threadTools(parentId);
			const child = await tools.delegate({ requestId: "ask", title: "Ask", prompt: "Ask me" });
			const waited = await tools.wait(child.id, 60_000);
			expect(waited.timedOut).toBe(false);
			expect(waited.pendingQuestions).toHaveLength(1);
			const requestId = waited.pendingQuestions![0];
			expect(await tools.pendingQuestions!(child.id, "list")).toEqual({ requestIds: [requestId] });
			expect(await tools.pendingQuestions!(child.id, "read", requestId)).toEqual({ requestId, questions: [{ id: "colour", header: "Colour", question: "Which colour?", allowsOwnAnswer: false, required: true, options: [{ label: "Red", value: "Red" }, { label: "Blue", value: "blue" }] }] });
			await expect(tools.pendingQuestions!(child.id, "answer", requestId, { colour: ["green"] })).rejects.toThrow("Choose one of the options.");
			expect(await tools.pendingQuestions!(child.id, "answer", requestId, { colour: ["blue"] })).toMatchObject({ answered: true });
			expect(answered).toEqual([{ colour: ["blue"] }]);
			await vi.waitFor(() => expect(runtime.store.getTask(child.id).questions).toHaveLength(1));
			const secret = runtime.store.getTask(child.id).questions![0].id;
			expect(await tools.pendingQuestions!(child.id, "list")).toEqual({ requestIds: [] });
			await expect(tools.pendingQuestions!(child.id, "answer", secret, { token: ["x"] })).rejects.toThrow("The person answers this question");
			const other = runtime.threadTools(await caller(runtime));
			await expect(other.pendingQuestions!(child.id, "list")).rejects.toThrow("outside");
		} finally { await runtime.close(); rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
	});
});

describe("move_to_worktree", () => {
	it("moves the chat to a new worktree, drops the folder's native session and continues there", async () => withRuntime(async (runtime, directory, run) => {
		const { root, git } = repository(directory), source = runtime.store.addProject(root);
		const id = await caller(runtime, "code", "full-access", source.id), tools = runtime.threadTools(id);
		const before = runtime.store.getTask(id); before.nativeSessionId = "old-session"; runtime.store.saveTask(before);
		const moved = await tools.moveToWorktree!({ branch: "feature/moved", runSetup: false, continuationPrompt: "Carry on" });
		expect(moved).toMatchObject({ branch: "feature/moved", continuation: true });
		const project = runtime.store.getProjects().find(value => value.id === moved.projectId)!;
		expect(project.worktree).toMatchObject({ sourceProjectId: source.id, branch: "feature/moved", baseCommit: git(["rev-parse", "HEAD"]) });
		expect(runtime.store.getTask(id)).toMatchObject({ projectId: project.id, handoffFrom: "codex" });
		expect(runtime.store.getTask(id).nativeSessionId).toBeUndefined();
		await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
		expect(run.mock.calls[0][1]).toBe(project.directory);
		expect(run.mock.calls[0][2]).toBe("Carry on");
		await expect(tools.moveToWorktree!({ branch: "feature/again", runSetup: false })).rejects.toThrow("already works in a worktree");
		await expect(runtime.threadTools(await caller(runtime)).moveToWorktree!({ branch: "x", runSetup: false })).rejects.toThrow("no project");
	}));
});

describe("add_project and clone_project", () => {
	it("adds an existing folder once and clones beside this chat's checkout, with full access outside Plan only", async () => withRuntime(async (runtime, directory) => {
		const { root } = repository(directory), source = runtime.store.addProject(root);
		const id = await caller(runtime, "code", "full-access", source.id), tools = runtime.threadTools(id);
		const folder = path.join(directory, "notes"); mkdirSync(folder);
		const added = await tools.addProject!(folder);
		expect(added).toEqual({ id: expect.any(String), name: "notes", path: folder });
		expect(await tools.addProject!(folder)).toEqual({ ...added, alreadyAdded: true });
		await expect(tools.addProject!(path.join(directory, "missing"))).rejects.toThrow("not a folder");
		await expect(tools.addProject!("relative/folder")).rejects.toThrow("absolute path");
		const clone = vi.fn(async (_url: string, parent: string) => { const target = path.join(parent, "cloned"); mkdirSync(target); return target; }); runtime.cloneRepository = clone;
		const cloned = await tools.cloneProject!("https://github.com/owner/cloned.git");
		expect(clone).toHaveBeenCalledWith("https://github.com/owner/cloned.git", directory);
		expect(runtime.store.getProjects().find(project => project.id === cloned.id)?.directory).toBe(path.join(directory, "cloned"));
		await expect(runtime.threadTools(await caller(runtime)).cloneProject!("https://github.com/owner/other.git")).rejects.toThrow("pass parentPath");
		for (const [mode, permission] of [["plan", "full-access"], ["code", "supervised"]] as const) await expect(runtime.threadTools(await caller(runtime, mode, permission, source.id)).addProject!(folder)).rejects.toThrow("full access outside Plan mode");
	}));
});

describe("attachments on delegate_task, launch_thread and send_thread", () => {
	it("sends project files with the prompt, owned by the receiving chat, and refuses Chat mode and bad files", async () => withRuntime(async (runtime, directory, run) => {
		const { root } = repository(directory), project = runtime.store.addProject(root);
		writeFileSync(path.join(root, "log.txt"), "Stack trace\n");
		const id = await caller(runtime, "code", "full-access", project.id), tools = runtime.threadTools(id);
		const child = await tools.delegate({ requestId: "logs", title: "Logs", prompt: "Read the log", attachments: ["log.txt"] });
		await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
		expect(run.mock.calls[0][5]).toEqual([expect.objectContaining({ name: "log.txt", taskId: child.id, text: "Stack trace\n" })]);
		const launched = await tools.launch!({ requestId: "other", title: "Other", prompt: "Look", attachments: [path.join(root, "log.txt")] });
		expect(runtime.store.getTask(launched.id).queue[0]?.attachments ?? runtime.store.getTask(launched.id).messages[0]?.attachments).toEqual([expect.objectContaining({ name: "log.txt", taskId: launched.id })]);
		await tools.send!(child.id, "And this", ["file.txt"]);
		expect(runtime.store.getTask(child.id).queue.at(-1)).toMatchObject({ text: "And this", attachments: [expect.objectContaining({ name: "file.txt", taskId: child.id })] });
		await expect(tools.send!(child.id, "Missing", ["missing.txt"])).rejects.toThrow("missing.txt:");
		const chat = runtime.threadTools(await caller(runtime, "chat", "full-access", project.id));
		await expect(chat.delegate({ requestId: "x", title: "X", prompt: "Read", attachments: ["log.txt"] })).rejects.toThrow("Chat mode has no file access");
		expect(() => validateDelegate({ requestId: "r", title: "T", prompt: "P", attachments: Array.from({ length: 11 }, (_, index) => `${index}.txt`) })).toThrow("up to 10");
	}));
});

describe("search_threads", () => {
	it("finds chats by title across the workspace without their messages, and says which ones this chat can read", async () => withRuntime(async runtime => {
		const parentId = await caller(runtime), tools = runtime.threadTools(parentId);
		const other = await caller(runtime); await runtime.command({ type: "update-task", id: other, title: "Billing refactor" });
		const stored = runtime.store.getTask(other); stored.messages.push({ id: "secret", role: "user", text: "Private billing notes", createdAt: new Date().toISOString() }); runtime.store.saveTask(stored);
		const launched = await tools.launch!({ requestId: "b", title: "Billing tests", prompt: "Work" });
		const found = tools.search!("billing");
		expect(found.map(entry => [entry.id, entry.readable])).toEqual(expect.arrayContaining([[other, false], [launched.id, true]]));
		expect(JSON.stringify(found)).not.toContain("Private billing notes");
		expect(tools.search!("private notes")).toEqual([]);
		expect(() => tools.read(other)).toThrow("outside");
	}));
});

describe("configure_thread", () => {
	it("reads a child's settings and changes its model and mode only while stopped and never beyond this chat", async () => withRuntime(async (runtime, _directory, run) => {
		runtime.discoverThreadModels = async () => [{ id: "owned", name: "Owned" }, { id: "stronger", name: "Stronger", options: [{ id: "effort", label: "Effort", type: "select", options: [{ id: "high", label: "High" }] }] }];
		const parentId = await caller(runtime, "code", "supervised"), tools = runtime.threadTools(parentId);
		const child = await tools.delegate({ requestId: "c", title: "Child", prompt: "Work", mode: "plan" });
		expect(await tools.configure!(child.id)).toMatchObject({ harness: "codex", model: "owned", mode: "plan", permissionMode: "supervised", modelOptions: {} });
		await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
		await expect(tools.configure!(child.id, { model: "stronger" })).rejects.toThrow("is working");
		await tools.interrupt(child.id);
		await expect(tools.configure!(child.id, { permissionMode: "full-access" })).rejects.toThrow("broader permissions");
		await expect(tools.configure!(child.id, { model: "invented" })).rejects.toThrow("not available");
		await expect(tools.configure!(child.id, { model: "stronger", modelOptions: { effort: "max" } })).rejects.toThrow("does not offer effort=max");
		expect(await tools.configure!(child.id, { model: "stronger", modelOptions: { effort: "high" }, mode: "code" })).toMatchObject({ model: "stronger", modelOptions: { effort: "high" }, mode: "code" });
		const approval = (threadTools(tools).find(value => value.id === "configure_thread") as unknown as { requireApproval: (raw: unknown) => boolean }).requireApproval;
		expect([approval({ id: child.id }), approval({ id: child.id, model: "owned" })]).toEqual([false, true]);
		await expect(runtime.threadTools(await caller(runtime)).configure!(child.id)).rejects.toThrow("outside");
	}));
});

describe("queue controls", () => {
	it("reorders a launched chat's queue, refuses steering an idle chat, and restarts a running one with a new prompt", async () => withRuntime(async (runtime, _directory, run) => {
		const parentId = await caller(runtime), tools = runtime.threadTools(parentId);
		const launched = await tools.launch!({ requestId: "q", title: "Queue", prompt: "First" });
		await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
		await tools.send!(launched.id, "Second"); await tools.send!(launched.id, "Third");
		const [second, third] = tools.queue!(launched.id);
		expect((await tools.editQueue!(launched.id, third.id, undefined, "up")).queue).toEqual([third.id, second.id]);
		await expect(tools.editQueue!(launched.id, second.id, "Text", "down")).rejects.toThrow("Pass text only to edit");
		await tools.send!(launched.id, "Start over", undefined, true);
		// The stopped turn has ended, the new prompt starts the next turn and the queued prompts keep their order behind it.
		await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
		expect(run.mock.calls[1][2]).toBe("Start over");
		expect(tools.queue!(launched.id).map(item => item.text)).toEqual(["Third", "Second"]);
		await tools.interrupt(launched.id);
		await expect(tools.editQueue!(launched.id, tools.queue!(launched.id)[0].id, undefined, "steer")).rejects.toThrow("not running");
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
		// The store refuses unread before a finished turn, and naming needs a title model; both reach the agent as errors.
		await expect(tools.organize!(launched.id, "mark_unread")).rejects.toThrow("no finished turn");
		await expect(tools.organize!(launched.id, "regenerate_title")).rejects.toThrow(/title|Sign in/);
		const organize = threadTools(tools).find(value => value.id === "organize_thread") as unknown as { requireApproval: (raw: unknown) => boolean };
		expect(["pin", "mark_unread", "regenerate_title", "archive"].map(action => organize.requireApproval({ id: launched.id, action }))).toEqual([false, false, true, true]);
		expect(threadToolLabel("organize_thread", { action: "regenerate_title" })).toBe("Name chat with a model");
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
			const bound = await tools.schedule!({ title: "Here", prompt: "Post here", schedule: { type: "interval", minutes: 30 }, enabled: false, postInThisChat: true });
			expect(bound).toMatchObject({ templateTaskId: parentId, threadTaskId: parentId });
			await expect(tools.schedule!({ title: "Elsewhere", prompt: "No", schedule: { type: "interval", minutes: 30 }, templateTaskId: paused.id, postInThisChat: true })).rejects.toThrow("omit templateTaskId");
			await tools.deleteSchedule!(bound.id);
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
