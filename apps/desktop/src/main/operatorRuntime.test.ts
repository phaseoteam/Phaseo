import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AgentAdapter } from "./agentAdapter";
import { WorkspaceRuntime } from "./workspaceRuntime";
import { inboxReason } from "../shared/inbox";

/** A runtime whose agents answer every prompt at once, recording which chat got which prompt. */
function setup() {
	const directory = mkdtempSync(path.join(tmpdir(), "phaseo-operator-"));
	const prompts: { id: string; text: string }[] = [];
	const adapter = (): AgentAdapter => ({ run: async (task, _cwd, text, callbacks) => { prompts.push({ id: task.id, text }); callbacks.onDelta("answer", "Done."); }, cancel: async () => {} });
	const runtime = new WorkspaceRuntime(directory, adapter);
	const done = async () => { await runtime.close(); rmSync(directory, { recursive: true, force: true }); };
	return { runtime, prompts, done };
}
const chat = async (runtime: WorkspaceRuntime, mode: "chat" | "code" = "code") => {
	const before = new Set(runtime.store.getOverview().tasks.map(task => task.id));
	const state = await runtime.command({ type: "create-task", harness: "codex", model: "gpt-6", mode, permissionMode: "full-access" });
	return state.tasks.find(task => !before.has(task.id))!.id;
};
const settled = (runtime: WorkspaceRuntime, id: string) => vi.waitFor(() => expect(runtime.store.getTask(id).status).toBe("completed"));

describe("operator", () => {
	it("is one pinned, projectless chat with full access on the person's latest agent and model", async () => {
		const { runtime, done } = setup();
		try {
			expect(() => runtime.operator.open()).toThrow("Start a chat first");
			await chat(runtime);
			const opened = runtime.operator.open();
			expect(opened.created).toBe(true);
			expect(runtime.store.getTask(opened.threadId)).toMatchObject({ title: "Operator", pinned: true, harness: "codex", model: "gpt-6", mode: "code", permissionMode: "full-access", operator: { subscriptions: [] } });
			expect(runtime.store.getTask(opened.threadId).projectId).toBeUndefined();
			expect(runtime.operator.open()).toEqual({ threadId: opened.threadId, created: false });
		} finally { await done(); }
	});

	it("is woken once, with one message, by the events it subscribed to and not by others", async () => {
		const { runtime, prompts, done } = setup();
		try {
			const worker = await chat(runtime), other = await chat(runtime);
			const operator = runtime.operator.open().threadId;
			runtime.operator.tools(operator).subscribe({ kinds: ["thread.completed"], threadIds: [worker] });
			runtime.operator.observe(runtime.store.getOverview().tasks);
			await runtime.command({ type: "send", id: worker, text: "Fix the login bug" });
			await runtime.command({ type: "send", id: other, text: "Unrelated" });
			await settled(runtime, worker); await settled(runtime, other);
			runtime.operator.observe(runtime.store.getOverview().tasks);
			runtime.operator.flush();
			await settled(runtime, operator);
			const woken = prompts.filter(prompt => prompt.id === operator);
			expect(woken).toHaveLength(1);
			expect(woken[0].text).toContain("Workspace events from your subscriptions (1)");
			expect(woken[0].text).toContain(`thread ${worker}`);
			expect(woken[0].text).not.toContain(other);
			const delivered = runtime.store.getTask(operator).messages.find(message => message.notice);
			expect(delivered?.notice).toMatchObject({ kind: "event" });
		} finally { await done(); }
	});

	it("holds events while paused, stops itself, and delivers them when the person resumes it", async () => {
		const { runtime, prompts, done } = setup();
		try {
			const worker = await chat(runtime), operator = runtime.operator.open().threadId;
			runtime.operator.tools(operator).subscribe({ kinds: ["thread.completed"] });
			runtime.operator.observe(runtime.store.getOverview().tasks);
			runtime.operator.pause("person", "Paused by you.");
			await runtime.command({ type: "send", id: worker, text: "Work" });
			await settled(runtime, worker);
			runtime.operator.observe(runtime.store.getOverview().tasks);
			runtime.operator.flush();
			expect(runtime.store.getTask(operator).operator).toMatchObject({ held: [{ kind: "thread.completed", threadId: worker }], heldWake: true, paused: { reason: "person" } });
			expect(prompts.some(prompt => prompt.id === operator)).toBe(false);
			runtime.operator.resume();
			await settled(runtime, operator);
			expect(prompts.filter(prompt => prompt.id === operator)).toHaveLength(1);
			expect(runtime.store.getTask(operator).operator?.held).toEqual([]);
		} finally { await done(); }
	});

	it("pauses at its spend cap and shows in the Inbox until the cap is raised", async () => {
		const { runtime, done } = setup();
		try {
			await chat(runtime);
			const operator = runtime.operator.open().threadId, task = runtime.store.getTask(operator);
			task.usageTotals = { tokens: 1000, costNanos: 6_000_000_000 }; runtime.store.saveTask(task);
			runtime.operator.observe(runtime.store.getOverview().tasks);
			const paused = runtime.store.getTask(operator);
			expect(paused.operator?.paused?.reason).toBe("cap");
			expect(inboxReason(paused)).toBe("Operator paused");
			expect(() => runtime.operator.resume()).toThrow("Raise the cap first");
			runtime.operator.raiseCap();
			expect(runtime.operator.resume()).toEqual({ resumed: true });
		} finally { await done(); }
	});

	it("reaches every top-level chat, but not one broader than itself, and only it gets event tools", async () => {
		const { runtime, prompts, done } = setup();
		try {
			const worker = await chat(runtime), bystander = await chat(runtime);
			const operator = runtime.operator.open().threadId;
			const tools = runtime.threadTools(operator);
			expect(tools.list().map(thread => thread.id)).toEqual(expect.arrayContaining([worker, bystander, operator]));
			await tools.send!(worker, "Check the build");
			await vi.waitFor(() => expect(prompts).toContainEqual({ id: worker, text: "Check the build" }));
			// An ordinary chat still reaches only its own children and launches.
			expect(() => runtime.threadTools(bystander).read(worker)).toThrow("outside this agent's scope");
			expect(runtime.threadTools(bystander).operator).toBeUndefined();
			expect(tools.operator).toBeDefined();
			// A narrower operator cannot use a broader chat.
			const narrowed = runtime.store.getTask(operator); narrowed.permissionMode = "supervised"; runtime.store.saveTask(narrowed);
			expect(() => runtime.threadTools(operator).read(worker)).toThrow("broader mode or permissions");
		} finally { await done(); }
	});
});
