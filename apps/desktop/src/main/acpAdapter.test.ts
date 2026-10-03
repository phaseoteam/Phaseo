import { EventEmitter } from "node:events";
import type * as ChildProcessModule from "node:child_process";
import { PassThrough, Readable, Writable } from "node:stream";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { agent, ndJsonStream, RequestError } from "@agentclientprotocol/sdk";
import type { Task } from "../shared/workspace";
const native = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", async importOriginal => ({ ...await importOriginal<typeof ChildProcessModule>(), spawn: native.spawn }));
import { AcpAdapter } from "./acpAdapter";
import { nativeMcpName, type McpConnection } from "../shared/mcp";
import { grokCompletionMethods } from "./grokCompletion";

const task: Task = { id: "task", title: "Task", harness: "acp", model: "default", mode: "code", status: "idle", pinned: false, archived: false, messages: [], queue: [], createdAt: "", updatedAt: "" };
describe("ACP protocol integration", () => {
	it.each(["x.ai/ask_user_question", "_x.ai/ask_user_question"])("routes native choices and free text through desktop questions (%s)", async method => {
		const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() }); native.spawn.mockReturnValue(child);
		const onQuestion = vi.fn(async () => ({ audience: ["Developers", "Designers"], timing: ["After the review"] }));
		const connection = agent({ name: "fixture" }).onRequest("initialize", ({ params }) => ({ protocolVersion: params.protocolVersion, agentCapabilities: {} })).onRequest("session/new", () => ({ sessionId: "native" })).onRequest("session/prompt", async ({ client }) => {
			const request = { sessionId: "native", toolCallId: "question", mode: "default", questions: [{ id: "audience", question: "Who is it for?", options: [{ label: "Developers" }, { label: "Designers" }], multiSelect: true }, { id: "timing", question: "When?", options: [{ label: "Now" }] }] };
			await expect(client.request(method, { ...request, sessionId: "child" })).rejects.toThrow();
			expect(onQuestion).not.toHaveBeenCalled();
			const response = await client.request(method, method.startsWith("_") ? { method, params: request } : request);
			expect(response).toEqual({ outcome: "accepted", answers: { "Who is it for?": ["Developers", "Designers"], "When?": ["Other"] }, annotations: { "When?": { notes: "After the review" } } });
			return { stopReason: "end_turn" };
		}).connect(ndJsonStream(Writable.toWeb(child.stdout), Readable.toWeb(child.stdin) as ReadableStream<Uint8Array>));
		try { await new AcpAdapter({ id: "agent", name: "Fixture", executable: "fixture", arguments: [] }).run(task, tmpdir(), "Hello", { onDelta: vi.fn(), onSession: vi.fn(), onQuestion, onApproval: async () => "decline" }); expect(onQuestion).toHaveBeenCalledOnce(); }
		finally { connection.close(); }
	});
	it.each(["plan", "chat", "code-accept", "code-decline", "missing-plan"])("captures proposed plans and gates implementation (%s)", async scenario => {
		const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() }); native.spawn.mockReturnValue(child);
		const onApproval = vi.fn(async () => scenario === "code-accept" ? "accept" as const : "decline" as const); const onActivity = vi.fn();
		const connection = agent({ name: "fixture" }).onRequest("initialize", ({ params }) => ({ protocolVersion: params.protocolVersion, agentCapabilities: {} })).onRequest("session/new", () => ({ sessionId: "native" })).onRequest("session/prompt", async ({ client }) => {
			const method = "_x.ai/exit_plan_mode";
			const response = await client.request(method, { method, params: { sessionId: "native", toolCallId: "plan", ...(scenario === "missing-plan" ? {} : { planContent: "Review, implement, verify." }) } });
			expect(response).toEqual(expect.objectContaining({ outcome: scenario === "code-accept" ? "approved" : "abandoned" }));
			return { stopReason: "end_turn" };
		}).connect(ndJsonStream(Writable.toWeb(child.stdout), Readable.toWeb(child.stdin) as ReadableStream<Uint8Array>));
		try {
			await new AcpAdapter({ id: "agent", name: "Fixture", executable: "fixture", arguments: [] }).run({ ...task, mode: scenario === "plan" || scenario === "chat" ? scenario : "code" }, tmpdir(), "Hello", { onDelta: vi.fn(), onSession: vi.fn(), onApproval, onActivity });
			if (scenario.startsWith("code-")) expect(onApproval).toHaveBeenCalledExactlyOnceWith("Implement plan", "Review, implement, verify."); else expect(onApproval).not.toHaveBeenCalled();
			if (scenario === "missing-plan") expect(onActivity).not.toHaveBeenCalled(); else expect(onActivity).toHaveBeenCalledWith(expect.objectContaining({ type: "plan", text: "Review, implement, verify." }));
		} finally { connection.close(); }
	});
	it.each(grokCompletionMethods)("settles the foreground prompt from native completion packets (%s)", async method => {
		const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() }); native.spawn.mockReturnValue(child);
		const onDelta = vi.fn(); let finishRpc!: (value: { stopReason: "end_turn" }) => void;
		const connection = agent({ name: "fixture" }).onRequest("initialize", ({ params }) => ({ protocolVersion: params.protocolVersion, agentCapabilities: {} })).onRequest("session/new", () => ({ sessionId: "native" })).onRequest("session/prompt", async ({ params, client }) => {
			const promptId = params._meta?.promptId;
			expect(typeof promptId).toBe("string"); expect(params._meta?.requestId).toBe(promptId);
			const payload = (sessionId: string, id: unknown) => method.endsWith("prompt_complete") ? { sessionId, promptId: id, stopReason: "end_turn" } : { sessionId, update: { sessionUpdate: "turn_completed", prompt_id: id, stop_reason: "end_turn" } };
			await client.notify(method, payload("child", promptId));
			await client.notify(method, payload("native", undefined));
			await client.notify(method, payload("native", "previous-turn"));
			await client.notify(method, payload("native", "task-completed-background"));
			await client.notify("session/update", { sessionId: "native", _meta: { promptId: "task-completed-background" }, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Background wake" } } });
			await client.notify("session/update", { sessionId: "native", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Foreground reply" } } });
			const pending = new Promise<{ stopReason: "end_turn" }>(resolve => { finishRpc = resolve; });
			await client.notify(method, payload("native", promptId));
			return await pending;
		}).connect(ndJsonStream(Writable.toWeb(child.stdout), Readable.toWeb(child.stdin) as ReadableStream<Uint8Array>));
		try {
			await new AcpAdapter({ id: "agent", name: "Fixture", executable: "fixture", arguments: [] }).run(task, tmpdir(), "Hello", { onDelta, onSession: vi.fn(), onApproval: async () => "decline" });
			expect(onDelta).toHaveBeenCalledExactlyOnceWith("assistant", "Foreground reply"); expect(child.kill).toHaveBeenCalled();
		} finally { finishRpc?.({ stopReason: "end_turn" }); connection.close(); }
	});
	it.each(["error", "rate_limit", "unknown", undefined])("does not treat a failed or invalid native completion as success (%s)", async reason => {
		const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() }); native.spawn.mockReturnValue(child);
		const connection = agent({ name: "fixture" }).onRequest("initialize", ({ params }) => ({ protocolVersion: params.protocolVersion, agentCapabilities: {} })).onRequest("session/new", () => ({ sessionId: "native" })).onRequest("session/prompt", async ({ params, client }) => {
			await client.notify("_x.ai/session/prompt_complete", { sessionId: "native", promptId: params._meta?.promptId, ...(reason ? { stopReason: reason } : {}), agentResult: "Provider-private diagnostic" });
			throw new Error("Late RPC failure");
		}).connect(ndJsonStream(Writable.toWeb(child.stdout), Readable.toWeb(child.stdin) as ReadableStream<Uint8Array>));
		try {
			await expect(new AcpAdapter({ id: "agent", name: "Fixture", executable: "fixture", arguments: [] }).run(task, tmpdir(), "Hello", { onDelta: vi.fn(), onSession: vi.fn(), onApproval: async () => "decline" })).rejects.toThrow(reason === "error" ? "ended the turn with an error" : reason === "rate_limit" ? "usage limit" : "unrecognized");
		} finally { connection.close(); }
	});
	it.each(["plan-model", "code-model"])("refreshes dependent model choices before prompting (%s)", async model => {
		const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() }); native.spawn.mockReturnValue(child);
		const modeOption = { id: "mode", category: "mode", name: "Mode", type: "select" as const, currentValue: "code", options: [{ value: "code", name: "Code" }, { value: "plan", name: "Plan" }] };
		const modelOption = (value: string) => ({ id: "model", category: "model", name: "Model", type: "select" as const, currentValue: value, options: [{ value, name: value }] });
		const select = vi.fn(({ params }: { params: { configId: string; value: unknown } }) => {
			if (params.configId === "mode") expect(params.value).toBe("plan");
			else expect(params.value).toBe("plan-model");
			return { configOptions: [{ ...modeOption, currentValue: "plan" }, modelOption("plan-model")] };
		});
		const prompt = vi.fn(() => ({ stopReason: "end_turn" as const }));
		const connection = agent({ name: "fixture" }).onRequest("initialize", ({ params }) => ({ protocolVersion: params.protocolVersion, agentCapabilities: {} })).onRequest("session/new", () => ({ sessionId: "native", configOptions: [modeOption, modelOption("code-model")] })).onRequest("session/set_config_option", select).onRequest("session/prompt", prompt).connect(ndJsonStream(Writable.toWeb(child.stdout), Readable.toWeb(child.stdin) as ReadableStream<Uint8Array>));
		const onModels = vi.fn();
		try {
			const run = new AcpAdapter({ id: "agent", name: "Fixture", executable: "fixture", arguments: [] }).run({ ...task, mode: "plan", model }, tmpdir(), "Hello", { onDelta: vi.fn(), onSession: vi.fn(), onModels, onApproval: async () => "decline" });
			if (model === "plan-model") { await run; expect(select).toHaveBeenCalledTimes(2); expect(prompt).toHaveBeenCalledOnce(); }
			else { await expect(run).rejects.toThrow("no longer offers"); expect(select).toHaveBeenCalledOnce(); expect(prompt).not.toHaveBeenCalled(); }
			expect(onModels).toHaveBeenLastCalledWith([{ id: "plan-model", name: "plan-model", default: true }]);
		} finally { connection.close(); }
	});
	it.each([true, false])("runs terminal authentication without sending it to authenticate (%s)", async success => {
		const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() }); native.spawn.mockReturnValue(child); let signedIn = false;
		const authenticate = vi.fn(() => ({})); const prompt = vi.fn(() => ({ stopReason: "end_turn" as const }));
		const connection = agent({ name: "fixture" }).onRequest("initialize", ({ params }) => { expect(params.clientCapabilities?.auth?.terminal).toBe(true); return { protocolVersion: params.protocolVersion, agentCapabilities: {}, authMethods: [{ id: "terminal", name: "Interactive login", type: "terminal" as const, args: ["--login"], env: { AUTH_FIXTURE: "1" } }] }; }).onRequest("session/new", () => { if (!signedIn) throw RequestError.authRequired(); return { sessionId: "native" }; }).onRequest("authenticate", authenticate).onRequest("session/prompt", prompt).connect(ndJsonStream(Writable.toWeb(child.stdout), Readable.toWeb(child.stdin) as ReadableStream<Uint8Array>));
		const onTerminalAuth = vi.fn(async (args, env, _title, signal) => { expect(args).toEqual(["--login"]); expect(env).toEqual({ AUTH_FIXTURE: "1" }); expect(signal).toBeInstanceOf(AbortSignal); if (!success) throw new Error("Native sign-in cancelled."); signedIn = true; });
		try {
			const run = new AcpAdapter({ id: "agent", name: "Fixture", executable: "fixture", arguments: [] }).run(task, tmpdir(), "Hello", { onDelta: vi.fn(), onSession: vi.fn(), onApproval: async () => "decline", onQuestion: async () => ({ "auth-method": ["Interactive login (terminal)"] }), onTerminalAuth });
			if (success) { await run; expect(prompt).toHaveBeenCalledOnce(); } else { await expect(run).rejects.toThrow("cancelled"); expect(prompt).not.toHaveBeenCalled(); }
			expect(onTerminalAuth).toHaveBeenCalledOnce(); expect(authenticate).not.toHaveBeenCalled();
		} finally { connection.close(); }
	});
	it.each(["native", "config", "both", "current", "unavailable"])("selects native modes while retaining desktop permission controls (%s)", async source => {
		const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() }); native.spawn.mockReturnValue(child);
		const option = { id: "mode", category: "mode", name: "Mode", type: "select" as const, currentValue: "default", options: [{ value: "analysis", name: "Analysis" }] };
		const setMode = vi.fn(() => ({})); const setConfig = vi.fn(() => ({ configOptions: [{ ...option, currentValue: "analysis" }] })); const onApproval = vi.fn();
		const prompt = vi.fn(async ({ client }: { client: { request: (method: "session/request_permission", params: { sessionId: string; toolCall: { toolCallId: string; kind: "execute" }; options: { optionId: string; name: string; kind: "allow_once" }[] }) => Promise<unknown> } }) => { expect(await client.request("session/request_permission", { sessionId: "native", toolCall: { toolCallId: "command", kind: "execute" }, options: [{ optionId: "yes", name: "Allow", kind: "allow_once" }] })).toEqual({ outcome: { outcome: "cancelled" } }); return { stopReason: "end_turn" as const }; });
		const connection = agent({ name: "fixture" }).onRequest("initialize", ({ params }) => { expect(params.clientCapabilities?.terminal).toBe(false); return { protocolVersion: params.protocolVersion, agentCapabilities: {} }; }).onRequest("session/new", () => ({ sessionId: "native", ...(source === "config" || source === "both" ? { configOptions: [option] } : {}), ...(source !== "config" ? { modes: { currentModeId: source === "current" ? "analysis" : "default", availableModes: [{ id: source === "both" ? "legacy-only" : "analysis", name: "Analysis" }] } } : {}) })).onRequest("session/set_mode", setMode).onRequest("session/set_config_option", setConfig).onRequest("session/prompt", prompt).connect(ndJsonStream(Writable.toWeb(child.stdout), Readable.toWeb(child.stdin) as ReadableStream<Uint8Array>));
		const onModes = vi.fn();
		try {
			const run = new AcpAdapter({ id: "agent", name: "Fixture", executable: "fixture", arguments: [] }).run({ ...task, mode: "plan", nativeMode: source === "unavailable" ? "missing" : "analysis" }, tmpdir(), "Hello", { onDelta: vi.fn(), onSession: vi.fn(), onModes, onApproval });
			if (source === "unavailable") { await expect(run).rejects.toThrow("no longer offers"); expect(prompt).not.toHaveBeenCalled(); }
			else { await run; if (source === "current") { expect(setMode).not.toHaveBeenCalled(); expect(setConfig).not.toHaveBeenCalled(); } else expect(source === "native" ? setMode : setConfig).toHaveBeenCalledOnce(); if (source === "both") expect(setMode).not.toHaveBeenCalled(); expect(onModes).toHaveBeenLastCalledWith([{ id: "analysis", name: "Analysis", default: true }]); }
			expect(onApproval).not.toHaveBeenCalled();
		} finally { connection.close(); }
	});
	it.each(["small", "unavailable"])("uses agent-reported model options before prompting (%s)", async model => {
		const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() }); native.spawn.mockReturnValue(child);
		const option = { id: "native-model", category: "model", name: "Model", type: "select" as const, currentValue: "small", options: [{ group: "provider", name: "Provider", options: [{ value: "small", name: "Small" }] }] };
		const prompt = vi.fn(() => ({ stopReason: "end_turn" as const })); const select = vi.fn(({ params }: { params: { sessionId: string; configId: string; value: unknown } }) => { expect(params).toEqual({ sessionId: "native", configId: "native-model", value: "small" }); return { configOptions: [option] }; });
		const connection = agent({ name: "fixture" }).onRequest("initialize", ({ params }) => ({ protocolVersion: params.protocolVersion, agentCapabilities: {} })).onRequest("session/new", () => ({ sessionId: "native", configOptions: [option] })).onRequest("session/set_config_option", select).onRequest("session/prompt", prompt).connect(ndJsonStream(Writable.toWeb(child.stdout), Readable.toWeb(child.stdin) as ReadableStream<Uint8Array>));
		const onModels = vi.fn();
		try {
			const run = new AcpAdapter({ id: "agent", name: "Fixture", executable: "fixture", arguments: [] }).run({ ...task, model }, tmpdir(), "Hello", { onDelta: vi.fn(), onSession: vi.fn(), onModels, onApproval: async () => "decline" });
			if (model === "small") { await run; expect(select).toHaveBeenCalledOnce(); expect(prompt).toHaveBeenCalledOnce(); }
			else { await expect(run).rejects.toThrow("no longer offers"); expect(select).not.toHaveBeenCalled(); expect(prompt).not.toHaveBeenCalled(); }
			expect(onModels).toHaveBeenCalledWith([{ id: "small", name: "Small", default: true }]);
		} finally { connection.close(); }
	});
	it.each(["new", "load", "fork"] as const)("passes managed HTTP MCP through real ACP session setup (%s)", async operation => {
		const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() }); native.spawn.mockReturnValue(child);
		const server: McpConnection = { id: "00000000-0000-4000-8000-000000000001", name: "HTTP fixture", transport: "http", url: "https://example.invalid/mcp", enabled: true };
		const setup = vi.fn((params: { mcpServers?: unknown[] }) => { expect(params.mcpServers).toEqual([{ type: "http", name: nativeMcpName(server), url: server.url, headers: [] }]); });
		const connection = agent({ name: "fixture" }).onRequest("initialize", ({ params }) => ({ protocolVersion: params.protocolVersion, agentCapabilities: { loadSession: true, mcpCapabilities: { http: true }, sessionCapabilities: { fork: {} } } }))
			.onRequest("session/new", ({ params }) => { setup(params); return { sessionId: "native" }; }).onRequest("session/load", ({ params }) => { setup(params); return {}; }).onRequest("session/fork", ({ params }) => { setup(params); return { sessionId: "fork" }; }).onRequest("session/prompt", () => ({ stopReason: "end_turn" }))
			.connect(ndJsonStream(Writable.toWeb(child.stdout), Readable.toWeb(child.stdin) as ReadableStream<Uint8Array>));
		try { await new AcpAdapter({ id: "agent", name: "Fixture", executable: "fixture", arguments: [] }, [server]).run({ ...task, ...(operation === "load" ? { nativeSessionId: "native" } : operation === "fork" ? { nativeForkFrom: "native" } : {}) }, tmpdir(), "Hello", { onDelta: vi.fn(), onSession: vi.fn(), onApproval: async () => "decline" }); expect(setup).toHaveBeenCalledOnce(); }
		finally { connection.close(); }
	});
	it("rejects unsupported HTTP MCP before opening a native session", async () => {
		const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() }); native.spawn.mockReturnValue(child); const start = vi.fn(() => ({ sessionId: "native" }));
		const connection = agent({ name: "fixture" }).onRequest("initialize", ({ params }) => ({ protocolVersion: params.protocolVersion, agentCapabilities: {} })).onRequest("session/new", start).connect(ndJsonStream(Writable.toWeb(child.stdout), Readable.toWeb(child.stdin) as ReadableStream<Uint8Array>));
		try { await expect(new AcpAdapter({ id: "agent", name: "Fixture", executable: "fixture", arguments: [] }, [{ id: "00000000-0000-4000-8000-000000000001", name: "HTTP fixture", transport: "http", url: "https://example.invalid/mcp", enabled: true }]).run(task, tmpdir(), "Hello", { onDelta: vi.fn(), onSession: vi.fn(), onApproval: async () => "decline" })).rejects.toThrow("does not support HTTP MCP"); expect(start).not.toHaveBeenCalled(); }
		finally { connection.close(); }
	});
	it.each([true, false])("lets the user choose native authentication without collecting credentials (%s)", async accept => {
		const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() }); native.spawn.mockReturnValue(child);
		let authenticated = false; const authenticate = vi.fn(({ params }: { params: { methodId: string } }) => { expect(params.methodId).toBe("browser"); authenticated = true; return {}; });
		const fixture = agent({ name: "fixture" })
			.onRequest("initialize", ({ params }) => ({ protocolVersion: params.protocolVersion, agentCapabilities: {}, authMethods: [{ id: "browser", name: "Browser sign-in", description: "Open the agent’s sign-in page" }] }))
			.onRequest("session/new", () => { if (!authenticated) throw RequestError.authRequired(); return { sessionId: "native" }; })
			.onRequest("authenticate", authenticate)
			.onRequest("session/prompt", () => ({ stopReason: "end_turn" }));
		const connection = fixture.connect(ndJsonStream(Writable.toWeb(child.stdout), Readable.toWeb(child.stdin) as ReadableStream<Uint8Array>));
		const onQuestion = vi.fn(async (): Promise<Record<string, string[]>> => accept ? { "auth-method": ["Browser sign-in (browser)"] } : {});
		try {
			const run = new AcpAdapter({ id: "agent", name: "Fixture", executable: "fixture", arguments: [] }).run(task, tmpdir(), "Hello", { onDelta: vi.fn(), onSession: vi.fn(), onApproval: async () => "decline", onQuestion });
			if (accept) { await run; expect(authenticate).toHaveBeenCalledOnce(); }
			else { await expect(run).rejects.toThrow("sign-in cancelled"); expect(authenticate).not.toHaveBeenCalled(); }
			expect(onQuestion).toHaveBeenCalledWith([expect.objectContaining({ options: [{ label: "Browser sign-in (browser)", description: "Open the agent’s sign-in page" }] })]);
		} finally { connection.close(); }
	});
	it("advertises terminals and exchanges real command lifecycle packets", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-acp-protocol-terminal-"));
		const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() });
		native.spawn.mockImplementation((await vi.importActual<typeof ChildProcessModule>("node:child_process")).spawn).mockReturnValueOnce(child);
		const fixture = agent({ name: "fixture" })
			.onRequest("initialize", ({ params }) => { expect(params.clientCapabilities?.terminal).toBe(true); return { protocolVersion: params.protocolVersion, agentCapabilities: {}, authMethods: [] }; })
			.onRequest("session/new", () => ({ sessionId: "native" }))
			.onRequest("session/prompt", async ({ client }) => {
				const terminal = await client.request("terminal/create", { sessionId: "native", command: process.execPath, args: ["-e", "process.stdout.write('ACP command fixture')"] });
				expect((await client.request("terminal/wait_for_exit", { sessionId: "native", terminalId: terminal.terminalId })).exitCode).toBe(0);
				expect((await client.request("terminal/output", { sessionId: "native", terminalId: terminal.terminalId })).output).toBe("ACP command fixture");
				await client.request("terminal/release", { sessionId: "native", terminalId: terminal.terminalId });
				await expect(client.request("terminal/output", { sessionId: "native", terminalId: terminal.terminalId })).rejects.toThrow();
				return { stopReason: "end_turn" };
			});
		const connection = fixture.connect(ndJsonStream(Writable.toWeb(child.stdout), Readable.toWeb(child.stdin) as ReadableStream<Uint8Array>));
		try {
			await new AcpAdapter({ id: "agent", name: "Fixture", executable: "fixture", arguments: [] }).run(task, root, "Run", { onDelta: vi.fn(), onSession: vi.fn(), onApproval: async () => "accept" });
		} finally { connection.close(); native.spawn.mockReset(); rmSync(root, { recursive: true, force: true }); }
	});
	it("rejects image input before prompting when the agent lacks image capability", async () => {
		const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() }); native.spawn.mockReturnValue(child);
		const fixture = agent({ name: "fixture" }).onRequest("initialize", ({ params }) => ({ protocolVersion: params.protocolVersion, agentCapabilities: {}, authMethods: [] }));
		const connection = fixture.connect(ndJsonStream(Writable.toWeb(child.stdout), Readable.toWeb(child.stdin) as ReadableStream<Uint8Array>));
		try {
			await expect(new AcpAdapter({ id: "agent", name: "Fixture", executable: "fixture", arguments: [] }).run(task, tmpdir(), "Describe", { onDelta: vi.fn(), onSession: vi.fn(), onApproval: async () => "decline" }, undefined, [{ id: "image", taskId: "task", name: "image.png", kind: "image", mimeType: "image/png", size: 3, filePath: "/image", dataUrl: "data:image/png;base64,YWJj" }])).rejects.toThrow("does not support image");
			expect(child.kill).toHaveBeenCalled();
		} finally { connection.close(); }
	});
	it("exchanges real SDK packets, applies permission choices and scopes client file reads", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-acp-")); writeFileSync(path.join(root, "file.txt"), "Project file");
		const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() });
		native.spawn.mockReturnValue(child);
		const fixture = agent({ name: "fixture" })
			.onRequest("initialize", ({ params }) => ({ protocolVersion: params.protocolVersion, agentCapabilities: { loadSession: true }, authMethods: [] }))
			.onRequest("session/new", () => ({ sessionId: "native" }))
			.onRequest("session/prompt", async ({ client }) => {
				await expect(client.request("fs/read_text_file", { sessionId: "native", path: path.join(root, "..", "outside.txt") })).rejects.toThrow();
				expect((await client.request("fs/read_text_file", { sessionId: "native", path: path.join(root, "file.txt") })).content).toBe("Project file");
				const permission = await client.request("session/request_permission", { sessionId: "native", toolCall: { toolCallId: "edit", title: "Edit file", kind: "edit", status: "pending" }, options: [{ optionId: "allow", name: "Allow", kind: "allow_once" }, { optionId: "deny", name: "Deny", kind: "reject_once" }] });
				expect(permission.outcome).toEqual({ outcome: "selected", optionId: "deny" });
				await client.notify("session/update", { sessionId: "native", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Hello" } } });
				return { stopReason: "end_turn" };
			});
		const connection = fixture.connect(ndJsonStream(Writable.toWeb(child.stdout), Readable.toWeb(child.stdin) as ReadableStream<Uint8Array>));
		try {
			const onDelta = vi.fn(); const onSession = vi.fn();
			await new AcpAdapter({ id: "agent", name: "Fixture", executable: "fixture", arguments: ["--acp"] }).run(task, root, "Hello", { onDelta, onSession, onApproval: async () => "decline" });
			expect(onDelta).toHaveBeenCalledExactlyOnceWith("assistant", "Hello"); expect(onSession).toHaveBeenCalledWith("native"); expect(child.kill).toHaveBeenCalled();
		} finally { connection.close(); rmSync(root, { recursive: true, force: true }); }
	});
	it("interrupts an outstanding prompt and terminates its process", async () => {
		const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() });
		native.spawn.mockReturnValue(child);
		let promptStarted!: () => void;
		const started = new Promise<void>(resolve => { promptStarted = resolve; });
		const fixture = agent({ name: "fixture" })
			.onRequest("initialize", ({ params }) => ({ protocolVersion: params.protocolVersion, agentCapabilities: {}, authMethods: [] }))
			.onRequest("session/new", () => ({ sessionId: "native" }))
			.onRequest("session/prompt", async () => { promptStarted(); return await new Promise<never>(() => {}); });
		const connection = fixture.connect(ndJsonStream(Writable.toWeb(child.stdout), Readable.toWeb(child.stdin) as ReadableStream<Uint8Array>));
		const adapter = new AcpAdapter({ id: "agent", name: "Fixture", executable: "fixture", arguments: [] });
		const run = adapter.run(task, tmpdir(), "Hello", { onDelta: vi.fn(), onSession: vi.fn(), onApproval: async () => "decline" });
		const rejected = expect(run).rejects.toThrow("Task stopped");
		try { await started; await adapter.cancel(); await rejected; expect(child.kill).toHaveBeenCalled(); }
		finally { connection.close(); }
	});
	it("rejects a stale approved write when the file changes during review", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-acp-edit-")); const file = path.join(root, "file.txt"); writeFileSync(file, "Before");
		const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() }); native.spawn.mockReturnValue(child);
		const fixture = agent({ name: "fixture" })
			.onRequest("initialize", ({ params }) => ({ protocolVersion: params.protocolVersion, agentCapabilities: {}, authMethods: [] }))
			.onRequest("session/new", () => ({ sessionId: "native" }))
			.onRequest("session/prompt", async ({ client }) => {
				await expect(client.request("fs/write_text_file", { sessionId: "native", path: file, content: "Agent edit" })).rejects.toThrow();
				expect((await client.request("fs/read_text_file", { sessionId: "native", path: file })).content).toBe("User edit");
				return { stopReason: "end_turn" };
			});
		const connection = fixture.connect(ndJsonStream(Writable.toWeb(child.stdout), Readable.toWeb(child.stdin) as ReadableStream<Uint8Array>));
		try {
			await new AcpAdapter({ id: "agent", name: "Fixture", executable: "fixture", arguments: [] }).run(task, root, "Edit", { onDelta: vi.fn(), onSession: vi.fn(), onApproval: async () => { writeFileSync(file, "User edit"); return "accept"; } });
		} finally { connection.close(); rmSync(root, { recursive: true, force: true }); }
	});
});
