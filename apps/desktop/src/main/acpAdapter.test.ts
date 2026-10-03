import { EventEmitter } from "node:events";
import type * as ChildProcessModule from "node:child_process";
import { PassThrough, Readable, Writable } from "node:stream";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { agent, ndJsonStream } from "@agentclientprotocol/sdk";
import type { Task } from "../shared/workspace";
const native = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", async importOriginal => ({ ...await importOriginal<typeof ChildProcessModule>(), spawn: native.spawn }));
import { AcpAdapter } from "./acpAdapter";

const task: Task = { id: "task", title: "Task", harness: "acp", model: "default", mode: "code", status: "idle", pinned: false, archived: false, messages: [], queue: [], createdAt: "", updatedAt: "" };
describe("ACP protocol integration", () => {
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
