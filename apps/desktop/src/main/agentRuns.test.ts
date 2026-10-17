import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createAgent, defineTool, type AgentMessage, type AgentRunResult, type AgentToolExecutionResult } from "@phaseo/agent-sdk";
import { WorkspaceStore } from "./workspaceStore";
import type { Task } from "../shared/workspace";

const created = "2026-10-17T00:00:00.000Z";
function withStore(run: (store: WorkspaceStore, raw: DatabaseSync, filename: string) => void | Promise<void>) {
	const directory = mkdtempSync(path.join(tmpdir(), "phaseo-runs-")), filename = path.join(directory, "workspace.sqlite");
	const store = new WorkspaceStore(filename);
	return Promise.resolve(run(store, (store as unknown as { db: DatabaseSync }).db, filename)).finally(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
}
const task = (id: string, extra: Partial<Task> = {}) => ({ id, title: id, harness: "phaseo", model: "m", mode: "code", status: "idle", pinned: false, archived: false, queue: [], messages: [], createdAt: created, updatedAt: created, ...extra }) as Task;
const rows = (raw: DatabaseSync, table: string) => Number((raw.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count);
/** What a load returns for a saved result: tool output only on the resumed step, no step items. */
function persisted(result: AgentRunResult) {
	const last = result.run.stepCount - 1, strip = (values: AgentToolExecutionResult[] = []) => values.map(({ result: _result, preliminaryResults: _preliminary, ...value }) => value);
	return { run: result.run, messages: result.run.messages, steps: result.steps.map(step => step.index === last ? step : { ...step, toolResults: step.toolResults && strip(step.toolResults) }), stepResults: result.stepResults?.map(({ items: _items, ...step }) => step.stepIndex === last ? step : { ...step, toolResults: strip(step.toolResults) }) };
}
const view = (result: AgentRunResult | null) => result && { run: result.run, messages: result.messages, steps: result.steps, stepResults: result.stepResults };
function synthetic(id: string, count: number): AgentRunResult {
	const messages: AgentMessage[] = [{ role: "user", content: "go" }];
	for (let index = 0; index < count; index++) messages.push({ role: "assistant", content: `step ${index}`, toolCalls: [{ id: `c${index}`, name: "read", input: { path: `f${index}` } }] }, { role: "tool", toolCallId: `c${index}`, name: "read", content: "x".repeat(2000) + index });
	return { run: { id, agentId: "a", status: "running", input: "go", messages, createdAt: created, updatedAt: created, stepCount: count }, steps: [], stepResults: [], output: undefined, messages, items: [] };
}

describe("agent runs", () => {
	it("loads what each save stored and writes only new messages, through approvals and a restart", () => withStore(async (first, _raw, filename) => {
		let store = first;
		const big = "x".repeat(1024 * 1024), before: number[] = [], after: number[] = [];
		let steps = 0, mismatches = 0;
		const state = {
			load: async (id: string) => store.loadAgentRun(id) as AgentRunResult<unknown, string> | null,
			save: async (result: AgentRunResult<unknown, string>) => {
				before.push(JSON.stringify(result).length);
				const expected = structuredClone(persisted(result as AgentRunResult));
				after.push(store.saveAgentRun(result as AgentRunResult, "chat"));
				try { expect(view(store.loadAgentRun(result.run.id))).toEqual(expected); } catch (error) { mismatches++; throw error; }
			},
		};
		const client = { async generate() {
			steps++;
			if (steps <= 5) return { message: { role: "assistant" as const, content: `reading part ${steps}`, toolCalls: [{ id: `c${steps}`, name: "project_files", input: { path: "big.txt", action: "read" } }] } };
			if (steps === 6) return { message: { role: "assistant" as const, content: "", toolCalls: [{ id: "w1", name: "write", input: { text: "one" } }, { id: "w2", name: "write", input: { text: "two" } }] } };
			return { message: { role: "assistant" as const, content: "done" } };
		} };
		const agent = createAgent<string, unknown>({ id: "phaseo-desktop", model: "m", maxSteps: 40, tools: [
			defineTool({ id: "project_files", description: "x", parameters: { type: "object" }, async execute() { return { content: big, hash: "h" }; } }),
			defineTool({ id: "write", description: "x", parameters: { type: "object" }, requireApproval: true, async execute(input: unknown) { return input; } }),
		] });
		const paused = await agent.run({ client, state, input: "q", messages: [{ role: "user", content: "q" }] });
		expect(paused.run.status).toBe("waiting_for_human");
		expect(store.agentRunStatus(paused.run.id)).toEqual({ status: "waiting_for_human", stepCount: 6 });
		store.close(); store = new WorkspaceStore(filename);
		try {
		const loaded = store.loadAgentRun(paused.run.id)!;
		const result = await agent.continueRun({ client, state, run: loaded as AgentRunResult<unknown, string>, approvals: ["w1", "w2"] });
		expect(result.run.status).toBe("completed"); expect(mismatches).toBe(0);
		expect(store.agentRunStatus(result.run.id)).toEqual({ status: "completed", stepCount: 7 });
		expect(view(store.loadAgentRun(result.run.id))).toEqual(structuredClone(persisted(result as AgentRunResult)));
		const toolBytes = 5 * 1024 * 1024, mb = (values: number[]) => values.map(value => (value / 1e6).toFixed(2)).join(", ");
		// A save writes the new tool output, and the head repeats only the latest step's; before, each rewrote the whole run.
		expect(Math.max(...after)).toBeLessThan(2.2 * 1024 * 1024);
		expect(after.reduce((sum, value) => sum + value, 0)).toBeLessThan(toolBytes * 2.2);
		const disk = Number(((store as unknown as { db: DatabaseSync }).db.prepare("SELECT sum(length(data)) AS bytes FROM agent_run_messages").get() as { bytes: number }).bytes);
		console.log(`saves=${after.length}; before MB/save: ${mb(before)} (total ${(before.reduce((a, b) => a + b, 0) / 1e6).toFixed(1)}); after MB/save: ${mb(after)} (total ${(after.reduce((a, b) => a + b, 0) / 1e6).toFixed(1)}); messages on disk ${(disk / 1e6).toFixed(3)} MB`);
		} finally { store.close(); first.close = () => {}; }
	}));

	it("rewrites only changed positions when history is cloned, replaced or shortened", () => withStore((store, raw) => {
		const run = synthetic("r", 40);
		store.saveAgentRun(run);
		expect(rows(raw, "agent_run_messages")).toBe(81);
		// A resumed run is a structured clone: nothing but the head is written.
		const head = Buffer.byteLength(JSON.stringify({ run: { ...run.run, messages: undefined }, steps: [], stepResults: [] }));
		expect(store.saveAgentRun(structuredClone(run))).toBeLessThanOrEqual(head + 64);
		// Compaction: a summary replaces the first 60 messages.
		const compacted = structuredClone(run);
		compacted.run.messages = [{ role: "user", content: "summary" }, ...compacted.run.messages.slice(61)];
		compacted.messages = compacted.run.messages;
		const written = store.saveAgentRun(compacted);
		expect(rows(raw, "agent_run_messages")).toBe(21);
		expect(store.loadAgentRun("r")!.messages).toEqual(compacted.run.messages);
		// Positions 1..20 moved, so they are rewritten; nothing past the new end survives.
		expect(written).toBeGreaterThan(10 * 2000);
		const appended = structuredClone(compacted); appended.run.messages.push({ role: "assistant", content: "next" }); appended.messages = appended.run.messages;
		expect(store.saveAgentRun(appended)).toBeLessThan(head + 200);
		expect(store.loadAgentRun("r")!.messages).toEqual(appended.run.messages);
	}));

	it("undoes a failed save without leaving its cache behind", () => withStore(store => {
		const run = synthetic("r", 3);
		store.saveAgentRun(run);
		run.run.messages.push({ role: "user", content: "lost" });
		expect(() => store.batch(() => { store.saveAgentRun(run); throw new Error("stop"); })).toThrow("stop");
		expect(store.loadAgentRun("r")!.messages).toHaveLength(7);
		store.saveAgentRun(run);
		expect(store.loadAgentRun("r")!.messages.at(-1)).toEqual({ role: "user", content: "lost" });
	}));

	it("keeps only a task's latest run and deletes runs with their task", () => withStore((store, raw) => {
		store.saveTask(task("chat", { nativeSessionId: "unlinked" }));
		store.saveTask(task("other"));
		store.saveAgentRun(synthetic("first", 2), "chat");
		store.saveAgentRun(synthetic("kept", 2), "other");
		expect(store.agentRunStatus("first")).toEqual({ status: "running", stepCount: 2 });
		store.saveAgentRun(synthetic("second", 2), "chat");
		expect(store.loadAgentRun("first")).toBeNull(); expect(store.agentRunStatus("first")).toBeNull();
		// A run saved before its task was known is found through nativeSessionId.
		store.saveAgentRun(synthetic("unlinked", 2));
		store.deleteTasks(["chat"]);
		expect(store.agentRunStatus("second")).toBeNull(); expect(store.agentRunStatus("unlinked")).toBeNull();
		expect(store.agentRunStatus("kept")).not.toBeNull();
		expect(rows(raw, "agent_run_messages")).toBe(5);
		expect(store.agentRunStatus("missing")).toBeNull(); expect(store.loadAgentRun("missing")).toBeNull();
	}));

	it("drops version 4 run rows and keeps the chats", () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-runs-")), filename = path.join(directory, "workspace.sqlite");
		try {
			let store = new WorkspaceStore(filename);
			store.saveTask(task("chat", { messages: [{ id: "u", role: "user", text: "Keep me", createdAt: created }] }));
			store.close();
			const raw = new DatabaseSync(filename);
			raw.exec("CREATE TABLE agent_runs (id TEXT PRIMARY KEY, data TEXT NOT NULL)");
			raw.prepare("INSERT INTO agent_runs VALUES ('old', ?)").run(JSON.stringify(synthetic("old", 2)));
			raw.close();
			store = new WorkspaceStore(filename);
			expect(store.getTask("chat").messages.map(message => message.text)).toEqual(["Keep me"]);
			expect(store.loadAgentRun("old")).toBeNull();
			expect((store as unknown as { db: DatabaseSync }).db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'agent_runs'").get()).toBeUndefined();
			store.close();
		} finally { rmSync(directory, { recursive: true, force: true }); }
	});
});
