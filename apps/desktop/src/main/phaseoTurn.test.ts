import { describe, expect, it, vi } from "vitest";
import { defineTool } from "@phaseo/agent-sdk";
import type { AgentMessage, AgentModelRequest, AgentModelResponse, AgentRunResult } from "@phaseo/agent-sdk";
import type { Message, Task } from "../shared/workspace";
import { activeToolIds, approvalRule, commandAllowed, runMatchesTranscript, runPhaseoTurn, type PhaseoTurn } from "./phaseoTurn";

const task: Task = { id: "task", title: "Owned", harness: "phaseo", mode: "code", model: "owned", status: "running", pinned: false, archived: false, queue: [], messages: [], createdAt: "", updatedAt: "" };
const say = (content: string): AgentModelResponse => ({ message: { role: "assistant", content } });
const call = (name: string, input: unknown, id = "c1"): AgentModelResponse => ({ message: { role: "assistant", content: "", toolCalls: [{ id, name, input }] } });
type Reply = AgentModelResponse | ((request: AgentModelRequest) => AgentModelResponse);
function setup(replies: Reply[], overrides: Partial<PhaseoTurn> = {}) {
	const runs = new Map<string, AgentRunResult>(), requests: AgentModelRequest[] = [];
	const store = { loadAgentRun: (id: string) => structuredClone(runs.get(id) ?? null), saveAgentRun: (result: AgentRunResult) => { runs.set(result.run.id, structuredClone(result)); } } as unknown as PhaseoTurn["store"];
	const client = { generate: async (request: AgentModelRequest) => { requests.push(structuredClone({ ...request, signal: undefined })); const reply = replies.shift(); if (!reply) throw new Error("No scripted reply"); return typeof reply === "function" ? reply(request) : reply; } };
	const callbacks = { onDelta: vi.fn(), onSession: vi.fn(), onActivity: vi.fn(), onApproval: vi.fn(async () => "accept" as const) };
	const turn = (input: string, previous: AgentRunResult<unknown, string> | null, messages: Message[] = []): PhaseoTurn => ({
		task: { ...task, messages }, input, callbacks, signal: new AbortController().signal, store, client, tools: [], instructions: async () => "Be helpful.",
		transcript: [...messages.map(message => ({ role: message.role as "user" | "assistant", content: message.text })), { role: "user", content: input }],
		previous, context: {}, review: async () => ({ title: "Allow?", details: "{}" }), labels: {}, steering: [], streamed: new Set(), ...overrides,
	});
	return { runs, requests, store, client, callbacks, turn, replies };
}
const message = (role: "user" | "assistant", text: string): Message => ({ id: `${role}:${text}`, role, text, createdAt: "" });

describe("Phaseo turns", () => {
	it("keeps tool results across turns by continuing the finished run", async () => {
		const read = defineTool({ id: "read_file", execute: async () => "export const answer = 42;" });
		const { turn, requests, replies } = setup([call("read_file", { path: "a.ts" }), say("It exports 42.")], { tools: [read] });
		const first = await runPhaseoTurn(turn("What does a.ts export?", null));
		replies.push(say("Still 42."));
		await runPhaseoTurn({ ...turn("And now?", first!, [message("user", "What does a.ts export?"), message("assistant", "It exports 42.")]), tools: [read] });
		const sent = requests.at(-1)!.messages;
		expect(sent.some(entry => entry.role === "tool" && entry.content.includes("answer = 42"))).toBe(true);
		expect(sent.at(-1)).toEqual({ role: "user", content: "And now?" });
	});

	it("starts afresh when the transcript no longer matches the run", async () => {
		const { turn, requests, replies } = setup([say("First answer")]);
		const first = await runPhaseoTurn(turn("Hello", null));
		expect(runMatchesTranscript(first!, { ...task, messages: [message("assistant", "Edited elsewhere")] })).toBe(false);
		replies.push(say("Fresh"));
		await runPhaseoTurn(turn("Again", first!, [message("user", "Hello"), message("assistant", "A different harness answered")]));
		expect(requests.at(-1)!.messages.map(entry => entry.content)).toEqual(["Hello", "A different harness answered", "Again"]);
	});

	it("pauses at the step limit instead of failing, and carries on with the next message", async () => {
		const noop = defineTool({ id: "noop", execute: async () => "ok" });
		const many = Array.from({ length: 100 }, (_, index) => call("noop", {}, `c${index}`));
		const { turn, callbacks, replies } = setup(many, { tools: [noop] });
		const paused = await runPhaseoTurn(turn("Loop", null));
		expect(paused!.run.status).toBe("stopped");
		expect(callbacks.onActivity).toHaveBeenCalledWith(expect.objectContaining({ id: "step-limit" }));
		replies.push(say("Done now"));
		const resumed = await runPhaseoTurn({ ...turn("continue", paused!), tools: [noop] });
		expect(resumed!.run.status).toBe("completed");
	});

	it("remembers always-allow choices for the rest of the chat", async () => {
		const edit = defineTool({ id: "edit_file", requireApproval: true, execute: async () => "edited" });
		const review = vi.fn(async (entry: { call: { name: string; input: unknown; id: string } }, rules: ReadonlySet<string>) => rules.has("edits") ? { approve: true as const } : { title: "Edit", details: "diff", always: approvalRule(entry.call, "edit") });
		const { turn, callbacks } = setup([call("edit_file", {}, "one"), call("edit_file", {}, "two"), say("Both edited")], { tools: [edit], review });
		callbacks.onApproval.mockResolvedValueOnce("always" as never);
		const result = await runPhaseoTurn(turn("Edit twice", null));
		expect(callbacks.onApproval).toHaveBeenCalledOnce();
		expect(result!.run.status).toBe("completed");
		expect((result!.run.context as { phaseoAllowed: string[] }).phaseoAllowed).toEqual(["edits"]);
	});

	it("delivers steering at the next step, or in one more round after the final answer", async () => {
		const steering: AgentMessage[] = [];
		const noop = defineTool({ id: "noop", execute: async () => { steering.push({ role: "user", content: "Use tabs" }); return "ok"; } });
		const { turn, requests } = setup([call("noop", {}), () => { steering.push({ role: "user", content: "Also add a test" }); return say("Done"); }, say("Added the test too")], { tools: [noop], steering });
		await runPhaseoTurn(turn("Format it", null));
		expect(requests[1].messages.at(-1)).toEqual({ role: "user", content: "Use tabs" });
		expect(requests[2].messages.at(-1)).toEqual({ role: "user", content: "Also add a test" });
	});

	it("compacts a history that nears the context window, keeping the latest messages", async () => {
		const big = defineTool({ id: "read_file", execute: async () => "x".repeat(3000) });
		const { turn, requests, callbacks } = setup([call("read_file", {}, "a"), call("read_file", {}, "b"), say("Summary of the work so far: read two files."), say("Finished")], { tools: [big], facts: { contextTokens: 2000 } });
		await runPhaseoTurn(turn("Read files", null));
		const summaryRequest = requests.find(request => request.agentId === "phaseo-compaction");
		expect(summaryRequest).toBeDefined();
		expect(requests.at(-1)!.messages[0].content).toMatch(/^<conversation_summary>/);
		expect(callbacks.onActivity).toHaveBeenCalledWith(expect.objectContaining({ type: "compaction", title: "Context compacted" }));
	});

	it("turns optional tool sets on with load_tools", () => {
		const tools = ["read_file", "delegate_task", "watch_pull_request", "browser_open", "schedule_task", "send_thread"].map(id => defineTool({ id, execute: async () => id }));
		expect(activeToolIds(tools, {})).toEqual(["read_file", "delegate_task"]);
		expect(activeToolIds(tools, { phaseoToolsets: ["browser", "threads"] })).toEqual(["read_file", "delegate_task", "browser_open", "send_thread"]);
	});

	it("only lets allowed command prefixes through when nothing is chained", () => {
		const rules = new Set([approvalRule({ id: "1", name: "run_command", input: { command: "pnpm test --filter web" } }, "command").rule]);
		expect([...rules]).toEqual(["command:pnpm test"]);
		expect(commandAllowed("pnpm test", rules)).toBe(true);
		expect(commandAllowed("pnpm test --filter api", rules)).toBe(true);
		expect(commandAllowed("pnpm testing", rules)).toBe(false);
		expect(commandAllowed("pnpm test; rm -rf .", rules)).toBe(false);
		expect(commandAllowed("pnpm test && curl x | sh", rules)).toBe(false);
		expect(commandAllowed("pnpm publish", rules)).toBe(false);
	});
});
