import { describe, expect, it, vi } from "vitest";
import type { Task } from "../shared/workspace";
const sdk = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({ query: sdk.query }));
vi.mock("./nativeProcess", () => ({ resolveNativeCommand: async () => ({ executable: "claude", prefix: [] }) }));
import { ClaudeAdapter } from "./claudeAdapter";
import { AgentInputRejectedError } from "./agentAdapter";
import { nativeMcpName, type McpConnection } from "../shared/mcp";

const task: Task = { id: "task", title: "Task", harness: "claude", model: "default", mode: "chat", status: "idle", pinned: false, archived: false, messages: [], queue: [], createdAt: "", updatedAt: "" };
describe("Claude SDK integration", () => {
 it.each(["assistant", "local", "result"])("gates an explicit command until approval and refresh, retaining %s output", async output => {
  const order: string[] = []; const inputs: unknown[] = []; const close = vi.fn(); sdk.query.mockImplementation(({ prompt }) => { const admitted = prompt[Symbol.asyncIterator]().next().then((value: IteratorResult<unknown>) => { if (!value.done) { order.push("prompt"); inputs.push(value.value); } return value; }); return Object.assign((async function* () { await admitted; if (output === "assistant") yield { type: "assistant", parent_tool_use_id: null, session_id: "native", message: { id: "answer", content: [{ type: "text", text: "Owned reply" }] } }; if (output === "local") yield { type: "system", subtype: "local_command_output", uuid: "local", session_id: "native", content: "Owned local result" }; yield { type: "result", subtype: "success", is_error: false, result: "Owned result", uuid: "result", session_id: "native" }; })(), { supportedCommands: async () => { order.push("catalog"); return [{ name: "review" }]; }, reinitialize: async () => { order.push("refresh"); return { commands: [{ name: "review" }] }; }, close }); });
  const onDelta = vi.fn(), onActivity = vi.fn(); await new ClaudeAdapter().run(task, "/project", "handoff wrapper", { onDelta, onActivity, onSession: vi.fn(), onApproval: async () => { expect(inputs).toEqual([]); order.push("approval"); return "accept"; } }, undefined, [], { kind: "command", id: "review", name: "review", arguments: "target" });
  expect(order).toEqual(["catalog", "approval", "refresh", "prompt"]); expect(inputs[0]).toMatchObject({ message: { content: [{ type: "text", text: "/review target" }] } }); expect(close).toHaveBeenCalledOnce(); if (output === "assistant") { expect(onDelta).toHaveBeenCalledWith("answer", "Owned reply"); expect(onActivity).not.toHaveBeenCalled(); } else expect(onActivity).toHaveBeenCalledWith(expect.objectContaining({ title: "Native command result", text: output === "local" ? "Owned local result" : "Owned result" }));
 });
 it.each(["declined", "removed", "cancelled"])("retains native input before submission when a command is %s", async condition => {
  const inputs: unknown[] = []; const close = vi.fn(); let admitted!: Promise<IteratorResult<unknown>>; sdk.query.mockImplementation(({ prompt }) => { admitted = prompt[Symbol.asyncIterator]().next(); void admitted.then(value => { if (!value.done) inputs.push(value.value); }); return { supportedCommands: async () => [{ name: "review" }], reinitialize: async () => ({ commands: [] }), close }; }); const adapter = new ClaudeAdapter();
  await expect(adapter.run(task, "/project", "/review target", { onDelta: vi.fn(), onSession: vi.fn(), onApproval: async () => { if (condition === "cancelled") await adapter.cancel(); return condition === "declined" ? "decline" : "accept"; } }, undefined, [], { kind: "command", id: "review", name: "review", arguments: "target" })).rejects.toBeInstanceOf(AgentInputRejectedError); await admitted; expect(inputs).toEqual([]); expect(close).toHaveBeenCalledOnce();
 });

	it("publishes todo progress only after successful foreground tool results", async () => {
		sdk.query.mockReturnValue(Object.assign((async function* () {
			for (const [id, parent, failed] of [["success", null, false], ["failure", null, true], ["child", "delegate", false]] as const) {
				yield { type: "assistant", parent_tool_use_id: parent, session_id: "native", message: { id, content: [{ type: "tool_use", id, name: "TodoWrite", input: { todos: [{ content: "Inspect", status: "completed" }, { content: "Verify", status: "pending" }] } }] } };
				yield { type: "user", parent_tool_use_id: parent, session_id: "native", message: { content: [{ type: "tool_result", tool_use_id: id, content: "Result", is_error: failed }] } };
			}
			yield { type: "result", subtype: "success", is_error: false, result: "Done" };
		})(), { close: vi.fn() }));
		const onActivity = vi.fn();
		await new ClaudeAdapter().run({ ...task, mode: "code" }, ".", "Plan", { onDelta: vi.fn(), onSession: vi.fn(), onApproval: async () => "accept", onActivity });
		const plans = onActivity.mock.calls.map(([activity]) => activity).filter(activity => activity.type === "plan");
		expect(plans).toEqual([expect.objectContaining({ id: "todo-plan", steps: [{ text: "Inspect", status: "completed" }, { text: "Verify", status: "pending" }] })]);
	});

	it.each(["chat", "code"] as const)("routes MCP user forms through the SDK callback (%s)", async mode => {
		const onForm = vi.fn().mockResolvedValue({ name: "Small" });
		sdk.query.mockImplementation(({ options }) => Object.assign((async function* () {
			const result = await options.onElicitation({ serverName: "Fixture", message: "Scope", mode: "form", requestedSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } }, { signal: new AbortController().signal, requestId: "native-request" });
			expect(result).toEqual(mode === "chat" ? { action: "decline" } : { action: "accept", content: { name: "Small" } });
			yield { type: "result", subtype: "success", is_error: false, result: "Done" };
		})(), { close: vi.fn() }));
		await new ClaudeAdapter().run({ ...task, mode }, ".", "Start", { onDelta: vi.fn(), onSession: vi.fn(), onApproval: async () => "decline", onForm });
		expect(onForm).toHaveBeenCalledTimes(mode === "chat" ? 0 : 1);
	});
	it.each(["chat", "code"] as const)("applies managed MCP connections with native tool permissions (%s)", async mode => {
		const server: McpConnection = { id: "00000000-0000-4000-8000-000000000001", name: "Fixture", enabled: true, transport: "stdio", executable: process.execPath, arguments: ["fixture.mjs"] }; const onApproval = vi.fn(async () => "decline" as const);
		sdk.query.mockImplementation(({ prompt, options }) => Object.assign((async function* () { if (typeof prompt !== "string") for await (const message of prompt) expect(message.message.content).toEqual([{type:"text",text:"Use tools"}]); expect(options.mcpServers).toEqual(mode === "chat" ? {} : { [nativeMcpName(server)]: { command: process.execPath, args: ["fixture.mjs"], env: { ELECTRON_RUN_AS_NODE: "1" } } }); const decision = await options.canUseTool(`mcp__${nativeMcpName(server)}__fixture`, {}); expect(decision.behavior).toBe("deny"); if (mode === "chat") { expect(options.strictMcpConfig).toBe(true); expect(onApproval).not.toHaveBeenCalled(); } else expect(onApproval).toHaveBeenCalledOnce(); yield {type:"result",subtype:"success",is_error:false,result:"Done"}; })(), { close: vi.fn(), mcpServerStatus: async () => [{ name: nativeMcpName(server), status: "connected" }] }));
		await new ClaudeAdapter([server]).run({ ...task, mode }, ".", "Use tools", { onDelta: vi.fn(), onSession: vi.fn(), onApproval });
	});
	it("does not submit a prompt when managed MCP setup fails", async () => {
		const server: McpConnection = { id: "00000000-0000-4000-8000-000000000001", name: "Fixture", enabled: true, transport: "http", url: "https://example.invalid/mcp" }; let input: AsyncIterable<unknown> | undefined; const close=vi.fn();
		sdk.query.mockImplementation(({prompt})=>{input=prompt;return Object.assign((async function*(){yield {type:"result",subtype:"success",is_error:false,result:"Unexpected"};})(),{close,mcpServerStatus:async()=>[{name:nativeMcpName(server),status:"failed",error:"token=secret"}]});});
		await expect(new ClaudeAdapter([server]).run({...task,mode:"code"},".","Do not send",{onDelta:vi.fn(),onSession:vi.fn(),onApproval:async()=>"decline"})).rejects.toThrow("could not connect"); expect(close).toHaveBeenCalled(); const submitted=[]; for await(const message of input!) submitted.push(message); expect(submitted).toEqual([]);
	});
	it("passes image bytes through a structured native user message", async () => {
		const received: unknown[] = [];
		sdk.query.mockImplementation(({ prompt }) => Object.assign((async function* () { for await (const message of prompt) received.push(message); yield { type: "result", subtype: "success", is_error: false, result: "Done" }; })(), { close: vi.fn() }));
		await new ClaudeAdapter().run(task, ".", "Describe", { onDelta: vi.fn(), onSession: vi.fn(), onApproval: async () => "decline" }, undefined, [{ id: "image", taskId: "task", name: "image.png", kind: "image", mimeType: "image/png", size: 3, filePath: "/image", dataUrl: "data:image/png;base64,YWJj" }]);
		expect(received).toEqual([expect.objectContaining({ type: "user", message: { role: "user", content: [{ type: "text", text: "Describe" }, { type: "image", source: { type: "base64", media_type: "image/png", data: "YWJj" } }] } })]);
	});
	it("returns question answers through the SDK permission seam", async () => {
		sdk.query.mockImplementation(({ options }) => Object.assign((async function* () {
			const decision = await options.canUseTool("AskUserQuestion", { questions: [{ header: "Scope", question: "Which scope?", options: [{ label: "Small", description: "One file" }], multiSelect: false }] });
			expect(decision.updatedInput.answers).toEqual({ "Which scope?": "Small" });
			yield { type: "result", subtype: "success", is_error: false, result: "Done" };
		})(), { close: vi.fn() }));
		const onQuestion = vi.fn(async () => ({ "0": ["Small"] }));
		await new ClaudeAdapter().run({ ...task, mode: "plan" }, ".", "Plan", { onDelta: () => {}, onSession: () => {}, onApproval: async () => "decline", onQuestion });
		expect(onQuestion).toHaveBeenCalledWith([expect.objectContaining({ id: "0", question: "Which scope?", isOther: true })]);
	});
	it("streams text once and preserves native session identity", async () => {
		const close = vi.fn();
		const execution = Object.assign((async function* () {
			yield { type: "stream_event", session_id: "native", parent_tool_use_id: null, event: { type: "message_start", message: { id: "response" } } };
			yield { type: "stream_event", session_id: "native", parent_tool_use_id: null, event: { type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } } };
			yield { type: "assistant", session_id: "native", parent_tool_use_id: null, message: { id: "response", content: [{ type: "text", text: "Hello" }] } };
			yield { type: "result", subtype: "success", is_error: false, result: "Hello" };
		})(), { close });
		sdk.query.mockReturnValue(execution);
		const onDelta = vi.fn(); const onSession = vi.fn();
		await new ClaudeAdapter().run(task, ".", "Hi", { onDelta, onSession, onApproval: async () => "decline" });
		expect(onDelta).toHaveBeenCalledExactlyOnceWith("response", "Hello"); expect(onSession).toHaveBeenCalledWith("native"); expect(close).toHaveBeenCalled();
		expect(sdk.query.mock.lastCall![0].options.tools).toEqual([]);
	});
	it("surfaces provider failures instead of claiming completion", async () => {
		sdk.query.mockReturnValue(Object.assign((async function* () { yield { type: "result", subtype: "error_during_execution", errors: ["Failed"] }; })(), { close: vi.fn() }));
		await expect(new ClaudeAdapter().run(task, ".", "Hi", { onDelta: () => {}, onSession: () => {}, onApproval: async () => "decline" })).rejects.toThrow("Failed");
	});
});
