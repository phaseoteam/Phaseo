import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AgentAdapter, AgentCallbacks } from "./agentAdapter";
import { WorkspaceRuntime } from "./workspaceRuntime";
import { defaultPreferences } from "../shared/preferences";
import { inboxReason } from "../shared/inbox";

type Turn = (text: string, callbacks: AgentCallbacks) => Promise<void> | void;
/** A runtime whose agent plays `turns` in order and whose Autopilot model gives `replies` in order, each priced at `nanos`. */
function setup(turns: Turn[], replies: string[], { enabled = true, nanos = 1_000_000 } = {}) {
	const directory = mkdtempSync(path.join(tmpdir(), "phaseo-autopilot-"));
	const prompts: string[] = [];
	const adapter = (): AgentAdapter => ({ run: async (_task, _cwd, text, callbacks) => { prompts.push(text); const turn = turns.shift(); if (!turn) throw new Error("No scripted turn"); await turn(text, callbacks); }, cancel: async () => {} });
	const runtime = new WorkspaceRuntime(directory, adapter);
	runtime.store.savePreferences({ ...defaultPreferences, autopilot: enabled, autopilotModel: "openai/gpt-6-mini" });
	const asked: string[] = [];
	runtime.askAutopilotModel = vi.fn(async (_model, request, onUsage) => {
		asked.push(request.user);
		onUsage({ prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, pricing: { total_nanos: nanos, currency: "USD" } });
		return replies.shift();
	});
	const done = async () => { await runtime.close(); rmSync(directory, { recursive: true, force: true }); };
	return { runtime, prompts, asked, done };
}
const answer = (text: string): Turn => (_input, callbacks) => { callbacks.onDelta("answer", text); };
const working = (text: string): Turn => (_input, callbacks) => { callbacks.onActivity?.({ id: "edit", type: "tool", title: "Edit file", text: "src/app.ts", status: "completed" }); callbacks.onDelta("answer", text); };
const start = async (runtime: WorkspaceRuntime, capNanos: number | null = null) => {
	const state = await runtime.command({ type: "create-task", harness: "codex", model: "default", mode: "code", autopilot: { capNanos } });
	const id = state.tasks[0].id;
	await runtime.command({ type: "send", id, text: "Add dark mode" });
	return id;
};
const titles = (runtime: WorkspaceRuntime, id: string) => (runtime.store.getTask(id).activities ?? []).map(activity => activity.title);

describe("Autopilot runtime", () => {
	it("stays off until it is turned on in Settings, and runs with Full access", async () => {
		const { runtime, done } = setup([], [], { enabled: false });
		try {
			await expect(runtime.command({ type: "create-task", harness: "codex", model: "default", mode: "code", autopilot: { capNanos: null } })).rejects.toThrow("Settings → Experimental");
			const state = await runtime.command({ type: "create-task", harness: "codex", model: "default", mode: "code", permissionMode: "supervised" });
			await expect(runtime.command({ type: "update-task", id: state.tasks[0].id, autopilot: { capNanos: null } })).rejects.toThrow("Settings → Experimental");
			runtime.store.savePreferences({ ...defaultPreferences, autopilot: true });
			await runtime.command({ type: "update-task", id: state.tasks[0].id, autopilot: { capNanos: 5_000_000_000 } });
			expect(runtime.store.getTask(state.tasks[0].id)).toMatchObject({ permissionMode: "full-access", autopilot: { capNanos: 5_000_000_000 } });
			// Narrower permissions end Autopilot; turning it off keeps Full access.
			await runtime.command({ type: "update-task", id: state.tasks[0].id, permissionMode: "accept-edits" });
			expect(runtime.store.getTask(state.tasks[0].id).autopilot).toBeUndefined();
			await runtime.command({ type: "update-task", id: state.tasks[0].id, autopilot: { capNanos: null } });
			await runtime.command({ type: "update-task", id: state.tasks[0].id, autopilot: null });
			expect(runtime.store.getTask(state.tasks[0].id)).toMatchObject({ permissionMode: "full-access" });
			expect(runtime.store.getTask(state.tasks[0].id).autopilot).toBeUndefined();
		} finally { await done(); }
	});

	it("answers the agent's question, then hands back once the model judges the task done", async () => {
		let picked: Record<string, string[]> | undefined;
		const asks: Turn = async (_input, callbacks) => {
			picked = await callbacks.onQuestion!([{ id: "theme", header: "Theme", question: "Which default theme?", options: [{ label: "Follow the system", value: "system" }, { label: "Dark", value: "dark" }] }]);
			callbacks.onActivity?.({ id: "edit", type: "tool", title: "Edit file", text: "theme.ts", status: "completed" });
			callbacks.onDelta("answer", "Dark mode added, following the system theme.");
		};
		const { runtime, asked, done } = setup([asks], ['{"decision":"answer","answers":{"theme":["Follow the system"]},"reason":"Least surprising default."}', '{"status":"done","summary":"Dark mode follows the system theme."}']);
		try {
			const id = await start(runtime);
			await vi.waitFor(() => expect(runtime.store.getTask(id).autopilot?.handback?.reason).toBe("done"));
			expect(picked).toEqual({ theme: ["system"] });
			expect(asked[0]).toContain("Add dark mode");
			expect(titles(runtime, id)).toEqual(expect.arrayContaining(["Question answered", "Autopilot answered", "Autopilot finished"]));
			// The Inbox's log keeps both decisions, with what was answered.
			expect(runtime.store.autopilotLog().map(entry => [entry.taskId, entry.title, entry.text])).toEqual([[id, "Autopilot finished", "Dark mode follows the system theme."], [id, "Autopilot answered", "Theme: system\nLeast surprising default."]]);
			// Both calls are billed to the chat.
			expect(runtime.store.getTask(id).usageTotals).toEqual({ tokens: 240, costNanos: 2_000_000 });
			expect(inboxReason(runtime.store.getTask(id))).toBe("Task completed");
		} finally { await done(); }
	});

	it("sends the next instruction until the task is done", async () => {
		const { runtime, prompts, done } = setup([working("Added the toggle."), working("Tests pass.")], ['{"status":"continue","message":"Now run the tests and fix any failures.","reason":"Untested."}', '{"status":"done","summary":"Toggle added and tested."}']);
		try {
			const id = await start(runtime);
			await vi.waitFor(() => expect(runtime.store.getTask(id).autopilot?.handback?.reason).toBe("done"));
			expect(prompts).toHaveLength(2);
			expect(prompts[1]).toContain("Now run the tests and fix any failures.");
			const followUp = runtime.store.getTask(id).messages.find(message => message.role === "user" && message.autopilot);
			expect(followUp?.text).toBe("Now run the tests and fix any failures.");
			expect(titles(runtime, id)).toEqual(expect.arrayContaining(["Autopilot: keep going", "Autopilot finished"]));
			// The person's next message clears the handback.
			await runtime.command({ type: "update-task", id, autopilot: null }).then(() => runtime.command({ type: "update-task", id, autopilot: { capNanos: null } }));
		} finally { await done(); }
	});

	it("hands back when it needs the person, and when follow-ups stop making progress", async () => {
		const blocked = setup([working("Which staging URL?")], ['{"status":"blocked","summary":"Needs the staging URL."}']);
		try {
			const id = await start(blocked.runtime);
			await vi.waitFor(() => expect(blocked.runtime.store.getTask(id).autopilot?.handback).toMatchObject({ reason: "blocked", summary: "Needs the staging URL." }));
			expect(inboxReason(blocked.runtime.store.getTask(id))).toBe("Autopilot needs you");
			await blocked.runtime.command({ type: "send", id, text: "Use staging.example.com" });
			expect(blocked.runtime.store.getTask(id).autopilot?.handback).toBeUndefined();
		} finally { await blocked.done(); }
		const keepGoing = '{"status":"continue","message":"Keep going.","reason":"Not done."}';
		const spinning = setup([answer("Thinking."), answer("Still thinking."), answer("Still thinking.")], [keepGoing, keepGoing, keepGoing]);
		try {
			const id = await spinning.runtime.command({ type: "create-task", harness: "codex", model: "default", mode: "code", autopilot: { capNanos: null } }).then(state => state.tasks[0].id);
			await spinning.runtime.command({ type: "send", id, text: "Add dark mode" });
			await vi.waitFor(() => expect(spinning.runtime.store.getTask(id).autopilot?.handback?.reason).toBe("stalled"));
			expect(spinning.prompts).toHaveLength(3);
		} finally { await spinning.done(); }
	});

	it("leaves the question with the person when the model escalates or its answer is invalid", async () => {
		let release: (() => void) | undefined;
		const asks: Turn = async (_input, callbacks) => {
			void callbacks.onQuestion!([{ id: "key", header: "Region", question: "Which region?", options: [{ label: "EU", value: "eu" }] }]);
			await new Promise<void>(resolve => { release = resolve; });
		};
		const { runtime, done } = setup([asks], ['{"decision":"answer","answers":{"key":["Mars"]},"reason":"Guess."}']);
		try {
			const id = await start(runtime);
			await vi.waitFor(() => expect(titles(runtime, id)).toContain("Autopilot passed this to you"));
			expect(runtime.store.getTask(id).questions).toHaveLength(1);
			expect(runtime.store.getTask(id).status).toBe("waiting");
		} finally { release?.(); await done(); }
	});

	it("stops at its spend cap, counting its own calls", async () => {
		const keepGoing = '{"status":"continue","message":"Keep going.","reason":"Not done."}';
		const { runtime, prompts, done } = setup([working("One."), working("Two."), working("Three.")], [keepGoing, keepGoing, keepGoing], { nanos: 6_000_000 });
		try {
			const id = await start(runtime, 10_000_000);
			await vi.waitFor(() => expect(runtime.store.getTask(id).autopilot?.handback?.reason).toBe("cap"));
			expect(runtime.store.getTask(id).autopilot?.handback?.summary).toContain("$0.01 spend cap");
			expect(prompts).toHaveLength(2);
			expect(inboxReason(runtime.store.getTask(id))).toBe("Spend cap reached");
			expect(runtime.store.autopilotLog()[0]).toMatchObject({ taskId: id, title: "Autopilot reached its spend cap" });
			// Raising the cap clears the stop.
			await runtime.command({ type: "update-task", id, autopilot: { capNanos: 50_000_000 } });
			expect(runtime.store.getTask(id).autopilot?.handback).toBeUndefined();
		} finally { await done(); }
	});
});
