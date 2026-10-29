import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { emptyStages } from "../../shared/factory/stages";
import type { AgentProfile, WorkItem } from "../../shared/factory/types";
import type { AgentCallbacks } from "../agentAdapter";
import type { Task } from "../../shared/workspace";
import { WorkspaceRuntime } from "../workspaceRuntime";
import type { RunHandlers } from "./runner";
import { StageThreads, activityLine } from "./stageThreads";

const agent: AgentProfile = { id: "codex:default:gpt-test", harness: "codex", label: "GPT Test", model: "gpt-test", billing: "subscription", connectionId: "codex:default", efforts: ["low", "high"], effortSetting: "reasoningEffort", effort: "high" };
const item = { id: "acme/app#3", source: "github", repo: "acme/app", number: 3, kind: "pull", state: "open", title: "Fix totals", body: "", author: { login: "someone" }, labels: [], url: "https://github.com/acme/app/pull/3", createdAt: 0, updatedAt: 0, comments: 0, priority: "normal", stages: emptyStages() } satisfies WorkItem;

/** A runtime whose agents answer through `answer`, with a clone folder and a worktree folder for the item. */
function setup(answer: (task: Task, callbacks: AgentCallbacks, signal: { cancelled: Promise<void> }) => Promise<void>) {
	const directory = mkdtempSync(path.join(tmpdir(), "phaseo-factory-stage-"));
	const clone = path.join(directory, "clone"), worktree = path.join(directory, "worktree");
	mkdirSync(clone); mkdirSync(worktree);
	const runtime = new WorkspaceRuntime(path.join(directory, "workspace"), () => {
		let cancel!: () => void;
		const cancelled = new Promise<void>(resolve => { cancel = resolve; });
		return { run: (task, _cwd, _text, callbacks) => answer(task, callbacks, { cancelled }), cancel: async () => { cancel(); } };
	});
	const parents = new Map<string, string>();
	const threads = new StageThreads(runtime, { get: id => parents.get(id), set: (id, thread) => { parents.set(id, thread); } });
	const finished: Parameters<RunHandlers["finish"]>[0][] = [], lines: string[] = [];
	const handlers: RunHandlers = { log: line => { lines.push(`${line.kind}: ${line.text}`); }, session: vi.fn(), finish: result => { finished.push(result); } };
	const start = (runId: string) => threads.start({ item, runId, agent, stage: "review", workspace: { dir: worktree, branch: "factory/pr-3", clone }, proof: path.join(worktree, ".factory", "proof", runId), prompt: "Review the pull request.", changedBefore: [], handlers });
	const close = async () => { threads.close(); await runtime.close(); rmSync(directory, { recursive: true, force: true }); };
	return { runtime, threads, parents, finished, lines, handlers, start, close, clone, worktree };
}

describe("stage threads", () => {
	it("runs a stage as a stage child of the item's thread in its worktree, and finishes with the parsed report", async () => {
		const { runtime, parents, finished, lines, handlers, start, close, clone, worktree } = setup(async (_task, callbacks) => {
			callbacks.onActivity?.({ id: "read", type: "tool", title: "Read", text: "src/totals.ts", status: "completed" });
			callbacks.onDelta?.("answer", "Summary: Rounds before summing.\nVerdict: Findings\nRisk: high - every price");
		});
		try {
			await start("run-1");
			const parentId = parents.get(item.id)!;
			const parent = runtime.store.getTask(parentId);
			expect(parent).toMatchObject({ title: "#3 Fix totals", mode: "code", permissionMode: "full-access", harness: "codex", model: "gpt-test" });
			expect(parent.pullRequests).toEqual([expect.objectContaining({ repository: "acme/app", number: 3 })]);
			await vi.waitFor(() => expect(finished).toHaveLength(1));
			const child = runtime.store.getOverview().tasks.find(task => task.delegation?.parentTaskId === parentId)!;
			expect(child.delegation).toEqual({ parentTaskId: parentId, requestId: "run-1", kind: "stage" });
			expect(child).toMatchObject({ title: "Review · #3", parentId });
			expect(runtime.store.getTask(child.id)).toMatchObject({ reasoningEffort: "high", permissionMode: "full-access" });
			// The child works in the item's worktree, registered as a worktree project of the clone's project.
			const projects = runtime.store.getProjects(), source = projects.find(project => project.directory === path.resolve(clone))!;
			expect(projects.find(project => project.id === child.projectId)).toMatchObject({ directory: path.resolve(worktree), worktree: { sourceProjectId: source.id, branch: "factory/pr-3" } });
			expect(handlers.session).toHaveBeenCalledWith(child.id);
			expect(finished[0]).toMatchObject({ status: "succeeded", summary: "Rounds before summing.", report: { verdict: "Findings", risk: { level: "high", why: "every price" } } });
			expect(lines).toEqual(expect.arrayContaining(["tool: Read src/totals.ts", expect.stringMatching(/^text: Summary: Rounds before summing\./)]));
			// The child's result goes to the work item, never into the item's thread.
			expect(runtime.store.getTask(parentId).queue).toEqual([]);
		} finally { await close(); }
	});

	it("never delivers a stage's result to the parent when the parent's own turn ends first", async () => {
		let release!: () => void;
		const held = new Promise<void>(resolve => { release = resolve; });
		const { runtime, parents, finished, start, close } = setup(async task => { if (task.delegation?.kind === "stage") await held; });
		try {
			await start("run-2");
			const parentId = parents.get(item.id)!;
			await runtime.command({ type: "send", id: parentId, text: "What's going on?" });
			await vi.waitFor(() => expect(runtime.store.getTask(parentId).status).toBe("completed"));
			release();
			await vi.waitFor(() => expect(finished).toHaveLength(1));
			await new Promise(resolve => setTimeout(resolve, 400));
			expect(runtime.store.getTask(parentId).queue).toEqual([]);
			expect(runtime.store.getTask(parentId).messages.filter(message => message.role === "user")).toHaveLength(1);
		} finally { release(); await close(); }
	});

	it("stops the child thread when the run is stopped, and finishes as cancelled", async () => {
		const { runtime, parents, finished, start, close } = setup(async (_task, _callbacks, { cancelled }) => cancelled);
		try {
			const process = await start("run-3");
			const parentId = parents.get(item.id)!;
			const child = () => runtime.store.getOverview().tasks.find(task => task.delegation?.parentTaskId === parentId)!;
			await vi.waitFor(() => expect(child().status).toBe("running"));
			process.stop();
			await vi.waitFor(() => expect(finished).toEqual([expect.objectContaining({ status: "cancelled" })]));
			expect(child().status).toBe("interrupted");
		} finally { await close(); }
	});

	it("carries a stopped run on in its thread without taking the old interruption as the new run's end", async () => {
		let first = true;
		const { runtime, parents, finished, handlers, start, threads, close, worktree, clone } = setup(async (_task, callbacks, { cancelled }) => {
			if (first) { first = false; return cancelled; }
			callbacks.onDelta?.("again", "Summary: Picked it up.\nVerdict: No findings");
		});
		try {
			const process = await start("run-6");
			const parentId = parents.get(item.id)!;
			await vi.waitFor(() => expect(runtime.store.getOverview().tasks.find(task => task.delegation?.parentTaskId === parentId)?.status).toBe("running"));
			process.stop();
			await vi.waitFor(() => expect(finished).toEqual([expect.objectContaining({ status: "cancelled" })]));
			const threadId = vi.mocked(handlers.session).mock.calls[0]![0];
			expect(runtime.store.getTask(threadId).status).toBe("interrupted");
			await threads.start({ item, runId: "run-7", agent, stage: "review", workspace: { dir: worktree, branch: "factory/pr-3", clone }, proof: path.join(worktree, "proof"), prompt: "Carry on.", resume: threadId, changedBefore: [], handlers });
			await vi.waitFor(() => expect(finished).toHaveLength(2));
			expect(finished[1]).toMatchObject({ status: "succeeded", report: { verdict: "No findings" } });
		} finally { await close(); }
	});

	it("carries a reply on at the effort chosen now, and an archived thread can't carry one on", async () => {
		const { runtime, finished, handlers, start, threads, close, worktree, clone } = setup(async (_task, callbacks) => { callbacks.onDelta?.("answer", "Summary: Done.\nVerdict: No findings"); });
		try {
			await start("run-11");
			await vi.waitFor(() => expect(finished).toHaveLength(1));
			const threadId = vi.mocked(handlers.session).mock.calls[0]![0];
			expect(runtime.store.getTask(threadId).reasoningEffort).toBe("high");
			const lower = { ...agent, effort: "low" };
			expect(threads.canResume(threadId, lower)).toBe(true);
			await threads.start({ item, runId: "run-12", agent: lower, stage: "review", workspace: { dir: worktree, branch: "factory/pr-3", clone }, proof: path.join(worktree, "proof"), prompt: "Again, lightly.", resume: threadId, changedBefore: [], handlers });
			await vi.waitFor(() => expect(finished).toHaveLength(2));
			expect(runtime.store.getTask(threadId).reasoningEffort).toBe("low");
			await runtime.command({ type: "update-task", id: threadId, archived: true });
			expect(threads.canResume(threadId, lower)).toBe(false);
		} finally { await close(); }
	});

	it("tells a stop of the queued brief apart from the interruption before it", async () => {
		// A thread interrupted earlier, whose new brief stays queued: the stand-in host never starts it.
		const task = { id: "t", harness: agent.harness, model: agent.model, status: "interrupted", interruptedAt: new Date(Date.now() - 60_000).toISOString(), queue: [] as { id: string; text: string }[], messages: [], activities: [], revision: 1, archived: false } as unknown as Task;
		let changed = () => {};
		const host = {
			store: { getTask: () => task, getTaskTail: () => task, getOverview: () => ({ tasks: [{ id: "t", revision: task.revision }] }), getProjects: () => [], addProject: (directory: string) => ({ id: directory, name: "clone", directory }), saveProject: () => {} },
			command: async (command: { type: string; text?: string }) => { if (command.type === "send") { task.queue.push({ id: "brief", text: command.text!, createdAt: new Date().toISOString() }); task.revision = (task.revision ?? 0) + 1; } return {}; },
			createThread: () => { throw new Error("unused"); }, startStageThread: () => { throw new Error("unused"); },
			onThreadsChange: (listener: () => void) => { changed = listener; return () => {}; },
		} as unknown as ConstructorParameters<typeof StageThreads>[0];
		const threads = new StageThreads(host, { get: () => "t", set: () => {} });
		const finished: Parameters<RunHandlers["finish"]>[0][] = [];
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-factory-queued-"));
		try {
			await threads.start({ item, runId: "run-10", agent, stage: "review", workspace: { dir: directory, branch: "factory/pr-3", clone: directory }, proof: path.join(directory, "proof"), prompt: "Carry on.", resume: "t", changedBefore: [], handlers: { log: () => {}, session: () => {}, finish: result => { finished.push(result); } } });
			changed();
			// The earlier interruption doesn't end the new run.
			expect(finished).toEqual([]);
			// Stopping the thread in Code while the brief is queued does.
			task.interruptedAt = new Date().toISOString(); task.revision = (task.revision ?? 0) + 1;
			changed();
			await vi.waitFor(() => expect(finished).toEqual([expect.objectContaining({ status: "cancelled" })]));
		} finally { threads.close(); rmSync(directory, { recursive: true, force: true }); }
	});

	it("carries a reply on in the run's own thread, and one failure ends the run as failed to carry on", async () => {
		let fail = true;
		const { runtime, finished, handlers, start, threads, close, worktree, clone } = setup(async (_task, callbacks) => {
			if (fail) throw new Error("The model is overloaded");
			callbacks.onDelta?.("again", "Summary: Fine now.\nVerdict: No findings");
		});
		try {
			await start("run-4");
			await vi.waitFor(() => expect(finished).toHaveLength(1));
			expect(finished[0]).toMatchObject({ status: "failed", summary: "The model is overloaded", crashed: true });
			const threadId = vi.mocked(handlers.session).mock.calls[0]![0];
			fail = false;
			await threads.start({ item, runId: "run-5", agent, stage: "review", workspace: { dir: worktree, branch: "factory/pr-3", clone }, proof: path.join(worktree, "proof"), prompt: "Carry on.", resume: threadId, changedBefore: [], handlers });
			await vi.waitFor(() => expect(finished).toHaveLength(2));
			expect(finished[1]).toMatchObject({ status: "succeeded", report: { verdict: "No findings" } });
			expect(vi.mocked(handlers.session).mock.calls[1]![0]).toBe(threadId);
			expect(runtime.store.getTask(threadId).messages.filter(message => message.role === "user").map(message => message.text)).toEqual(["Review the pull request.", "Carry on."]);
		} finally { await close(); }
	});

	it("logs tools by their title and first line, and leaves reasoning and usage in the thread", () => {
		expect(activityLine({ id: "a", type: "tool", title: "Run", text: "pnpm test\n12 passed", status: "completed" }, 1)).toEqual({ at: 1, kind: "tool", text: "Run pnpm test" });
		expect(activityLine({ id: "b", type: "tool", title: "Edit", text: "src/a.ts", status: "failed" }, 1)?.kind).toBe("error");
		expect(activityLine({ id: "c", type: "reasoning", title: "Reasoning", text: "…" })).toBeUndefined();
		expect(activityLine({ id: "d", type: "usage", title: "Usage", text: "{}" })).toBeUndefined();
	});
});
