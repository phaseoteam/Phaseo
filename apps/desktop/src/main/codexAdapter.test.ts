import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import type { Task } from "../shared/workspace";

const native = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("./nativeProcess", () => ({ spawnNative: native.spawn }));
import { CodexAdapter } from "./codexAdapter";
import { AgentInputRejectedError } from "./agentAdapter";
import { nativeMcpName, type McpConnection } from "../shared/mcp";

function fixture(onRequest: (packet: { id: number; method: string; params: Record<string, unknown> }, send: (value: unknown) => void) => void) {
	const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() });
	let buffer = "";
	child.stdin.on("data", chunk => {
		buffer += chunk.toString();
		let index: number;
		while ((index = buffer.indexOf("\n")) >= 0) {
			const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
			const packet = JSON.parse(line);
			onRequest(packet, value => child.stdout.write(`${JSON.stringify(value)}\n`));
		}
	});
	native.spawn.mockResolvedValue(child); return child;
}
const task: Task = { id: "task", title: "Task", harness: "codex", model: "default", mode: "code", status: "idle", pinned: false, archived: false, messages: [], queue: [], createdAt: "", updatedAt: "" };

describe("Codex native integration", () => {
	it("answers MCP forms for the exact native thread and rejects foreign requests", async () => {
		let finish: (() => void) | undefined; const replies: unknown[] = [];
		fixture((packet, send) => {
			if (packet.method === "initialize") send({ id: packet.id, result: {} });
			if (packet.method === "thread/start") send({ id: packet.id, result: { thread: { id: "native" } } });
			if (packet.method === "turn/start") {
				send({ id: packet.id, result: { turn: { id: "turn" } } });
				for (const threadId of ["native", "foreign"]) send({ id: threadId, method: "mcpServer/elicitation/request", params: { threadId, serverName: "Fixture", message: "Scope", mode: "form", requestedSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } } });
				finish = () => send({ method: "turn/completed", params: { threadId: "native", turn: { id: "turn", status: "completed" } } });
			}
			if (["native", "foreign"].includes(String(packet.id))) replies.push(packet);
		});
		const onForm = vi.fn().mockResolvedValue({ name: "Small" }); const execution = new CodexAdapter().run(task, ".", "Start", { onDelta: vi.fn(), onSession: vi.fn(), onApproval: async () => "decline", onForm });
		await vi.waitFor(() => expect(replies).toHaveLength(2));
		expect(replies).toContainEqual(expect.objectContaining({ id: "native", result: { action: "accept", content: { name: "Small" }, _meta: null } }));
		expect(replies).toContainEqual(expect.objectContaining({ id: "foreign", error: expect.objectContaining({ message: "MCP request belongs to another task." }) }));
		expect(onForm).toHaveBeenCalledOnce(); finish!(); await execution;
	});
	it.each(["start", "resume", "fork"])("configures MCP before submitting a %s turn", async operation => {
		const connection: McpConnection = { id: "12345678-1234-1234-1234-123456789abc", name: "Fixture", enabled: true, transport: "http", url: "https://example.com/mcp" }; const methods: string[] = [];
		fixture((packet, send) => {
			methods.push(packet.method);
			if (packet.method === "initialize") send({ id: packet.id, result: {} });
			if (packet.method === `thread/${operation}`) { expect(packet.params.config).toEqual({ [`mcp_servers.${nativeMcpName(connection)}`]: { url: connection.url, enabled: true } }); send({ id: packet.id, result: { thread: { id: "native" } } }); }
			if (packet.method === "mcpServerStatus/list") { expect(packet.params.threadId).toBe("native"); expect(methods).not.toContain("turn/start"); send({ id: packet.id, result: { data: [{ name: nativeMcpName(connection), runtimeStatus: "connected" }], nextCursor: null } }); }
			if (packet.method === "turn/start") { send({ id: packet.id, result: { turn: { id: "turn" } } }); send({ method: "turn/completed", params: { threadId: "native", turn: { id: "turn", status: "completed" } } }); }
		});
		await new CodexAdapter([connection]).run({ ...task, ...(operation === "resume" ? { nativeSessionId: "source" } : operation === "fork" ? { nativeForkFrom: "source" } : {}) }, ".", "Start", { onDelta: vi.fn(), onSession: vi.fn(), onApproval: async () => "decline" });
		expect(methods.indexOf("mcpServerStatus/list")).toBeLessThan(methods.indexOf("turn/start"));
	});
	it("reports failed MCP as confirmed rejection without submitting input", async () => {
		const connection: McpConnection = { id: "12345678-1234-1234-1234-123456789abc", name: "Fixture", enabled: true, transport: "http", url: "https://example.com/mcp" }; const methods: string[] = [];
		fixture((packet, send) => { methods.push(packet.method); if (packet.method === "initialize") send({ id: packet.id, result: {} }); if (packet.method === "thread/start") send({ id: packet.id, result: { thread: { id: "native" } } }); if (packet.method === "mcpServerStatus/list") send({ id: packet.id, result: { data: [{ name: nativeMcpName(connection), runtimeStatus: "failed" }], nextCursor: null } }); });
		await expect(new CodexAdapter([connection]).run(task, ".", "Start", { onDelta: vi.fn(), onSession: vi.fn(), onApproval: async () => "decline" })).rejects.toBeInstanceOf(AgentInputRejectedError); expect(methods).not.toContain("turn/start");
	});
	it.each(["supported", "unsupported", ""])("validates model-specific reasoning before execution (%s)", async effort => {
		const methods: string[] = [];
		fixture((packet, send) => { methods.push(packet.method); if(packet.method==="initialize") send({id:packet.id,result:{}}); if(packet.method==="model/list") send({id:packet.id,result:{data:[{model:"default-model",displayName:"Model",isDefault:true,defaultReasoningEffort:"supported",supportedReasoningEfforts:[{reasoningEffort:"supported",description:"Native option"}]}],nextCursor:null}}); if(packet.method==="thread/start") send({id:packet.id,result:{thread:{id:"native"}}}); if(packet.method==="turn/start") {expect(packet.params.effort).toBe("supported");send({id:packet.id,result:{turn:{id:"turn"}}});send({method:"turn/completed",params:{threadId:"native",turn:{id:"turn",status:"completed"}}});} });
		const run=new CodexAdapter().run({...task,reasoningEffort:effort},".","Start",{onDelta:vi.fn(),onSession:vi.fn(),onApproval:async()=>"decline"}); if(effort!=="unsupported") await run; else {await expect(run).rejects.toThrow("does not support");expect(methods).not.toContain("turn/start");expect(methods).not.toContain("thread/start");}
	});
	it("rejects steering precondition errors and approvals for unrelated threads", async () => {
		let complete: (() => void) | undefined; let response: unknown;
		fixture((packet, send) => {
			if (packet.method === "initialize") send({ id: packet.id, result: {} });
			if (packet.method === "thread/start") send({ id: packet.id, result: { thread: { id: "native" } } });
			if (packet.method === "turn/start") { send({ id: packet.id, result: { turn: { id: "turn" } } }); send({ id: "foreign", method: "item/fileChange/requestApproval", params: { threadId: "other", reason: "Foreign edit" } }); complete = () => send({ method: "turn/completed", params: { threadId: "native", turn: { id: "turn", status: "completed" } } }); }
			if (packet.method === "turn/steer") send({ id: packet.id, error: { code: -32602, message: "Turn changed" } });
			if (String(packet.id) === "foreign") response = packet;
		});
		const onApproval = vi.fn(); const adapter = new CodexAdapter(); const execution = adapter.run(task, ".", "Start", { onDelta: () => {}, onSession: () => {}, onApproval });
		await vi.waitFor(() => expect(complete).toBeDefined()); await expect(adapter.steer({ id: "instruction", text: "Change direction", createdAt: "" }, [])).rejects.toMatchObject({ constructor: expect.any(Function), message: "Turn changed" });
		await vi.waitFor(() => expect(response).toMatchObject({ error: { message: "Approval belongs to another task." } })); expect(onApproval).not.toHaveBeenCalled(); complete!(); await execution;
	});
	it("steers the exact active turn with a stable client message identity", async () => {
		let complete: (() => void) | undefined;
		fixture((packet, send) => {
			if (packet.method === "initialize") send({ id: packet.id, result: {} });
			if (packet.method === "thread/start") send({ id: packet.id, result: { thread: { id: "native" } } });
			if (packet.method === "turn/start") { send({ id: packet.id, result: { turn: { id: "turn" } } }); complete = () => send({ method: "turn/completed", params: { threadId: "native", turn: { id: "turn", status: "completed" } } }); }
			if (packet.method === "turn/steer") { expect(packet.params).toMatchObject({ threadId: "native", expectedTurnId: "turn", clientUserMessageId: "instruction", input: [{ type: "text", text: "Change direction", text_elements: [] }] }); send({ id: packet.id, result: { turnId: "turn" } }); }
		});
		const adapter = new CodexAdapter(); const execution = adapter.run(task, ".", "Start", { onDelta: () => {}, onSession: () => {}, onApproval: async () => "decline" });
		await vi.waitFor(() => expect(complete).toBeDefined()); await adapter.steer({ id: "instruction", text: "Change direction", createdAt: "" }, []);
		complete!(); await execution; await expect(adapter.steer({ id: "late", text: "Late", createdAt: "" }, [])).rejects.toThrow("not ready");
	});
	it("initializes, streams native output, and waits for the completed turn", async () => {
		const methods: string[] = [];
		const child = fixture((packet, send) => {
			methods.push(packet.method);
			if (packet.method === "initialize") send({ id: packet.id, result: {} });
			if (packet.method === "thread/start") send({ id: packet.id, result: { thread: { id: "native" } } });
			if (packet.method === "turn/start") {
				expect(packet.params.input).toEqual([{ type: "text", text: "Hello", text_elements: [] }, { type: "localImage", path: "/image.png" }]);
				send({ id: packet.id, result: { turn: { id: "turn" } } });
				send({ method: "item/agentMessage/delta", params: { threadId: "other", itemId: "a", delta: "Ignored" } });
				send({ method: "item/agentMessage/delta", params: { threadId: "native", itemId: "a", delta: "Hello" } });
				send({ method: "item/completed", params: { threadId: "native", item: { id: "command", type: "commandExecution", command: "git status", aggregatedOutput: "clean", status: "completed" } } });
				send({ method: "item/reasoning/summaryTextDelta", params: { threadId: "native", itemId: "reasoning", delta: "Checking" } });
				send({ method: "turn/completed", params: { threadId: "native", turn: { id: "turn", status: "completed" } } });
			}
		});
		const onDelta = vi.fn(); const onSession = vi.fn(); const onActivity = vi.fn();
		await new CodexAdapter().run(task, ".", "Hello", { onDelta, onSession, onActivity, onApproval: async () => "decline" }, undefined, [{ id: "image", taskId: "task", name: "image.png", kind: "image", mimeType: "image/png", size: 3, filePath: "/image.png", dataUrl: "data:image/png;base64,YWJj" }]);
		expect(methods).toEqual(["initialize", "initialized", "thread/start", "turn/start"]);
		expect(onDelta).toHaveBeenCalledExactlyOnceWith("a", "Hello");
		expect(onSession).toHaveBeenCalledWith("native"); expect(child.kill).toHaveBeenCalled();
		expect(onActivity).toHaveBeenCalledWith(expect.objectContaining({ title: "git status", text: "clean", status: "completed" }));
		expect(onActivity).toHaveBeenCalledWith(expect.objectContaining({ type: "reasoning", text: "Checking", append: true }));
	});
	it("uses native forks rather than presenting visible history as a resumed session", async () => {
		const methods: string[] = [];
		fixture((packet, send) => {
			methods.push(packet.method);
			if (packet.method === "initialize") send({ id: packet.id, result: {} });
			if (packet.method === "thread/fork") { expect(packet.params.threadId).toBe("source"); send({ id: packet.id, result: { thread: { id: "fork" } } }); }
			if (packet.method === "turn/start") { send({ id: packet.id, result: { turn: { id: "turn" } } }); send({ method: "turn/completed", params: { threadId: "fork", turn: { id: "turn", status: "completed" } } }); }
		});
		await new CodexAdapter().run({ ...task, nativeForkFrom: "source" }, ".", "Continue", { onDelta: () => {}, onSession: () => {}, onApproval: async () => "decline" });
		expect(methods).toContain("thread/fork");
	});
});
