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

const task: Task = { id: "task", title: "Task", harness: "acp", model: "default", mode: "code", status: "idle", pinned: false, archived: false, messages: [], queue: [], createdAt: "", updatedAt: "" };
describe("ACP protocol integration", () => {
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
