import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { OutsideAgentsMcp } from "./outsideAgentsMcp";
import { WorkspaceRuntime } from "./workspaceRuntime";
import type { AgentAdapter } from "./agentAdapter";
import type { ThreadTools } from "../shared/orchestration";
import { outsideAgentTools } from "../shared/outsideAgents";
import { threadTools } from "./threadTools";

/** Each run blocks until cancelled, so launched chats stay active while the test inspects them. */
const blocking = (): AgentAdapter => { let release: (() => void) | undefined; return { run: async () => { await new Promise<void>(resolve => { release = resolve; }); }, cancel: async () => { release?.(); } }; };
async function withRuntime(test: (runtime: WorkspaceRuntime) => Promise<void>) {
	const directory = mkdtempSync(path.join(tmpdir(), "phaseo-outside-")), runtime = new WorkspaceRuntime(path.join(directory, "workspace"), blocking);
	try { await test(runtime); } finally { await runtime.close(); rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
}
const chat = async (runtime: WorkspaceRuntime, permissionMode: "supervised" | "full-access") => {
	const before = new Set(runtime.store.getOverview().tasks.map(task => task.id));
	return (await runtime.command({ type: "create-task", harness: "codex", model: "owned", mode: "code", permissionMode })).tasks.find(task => !before.has(task.id))!.id;
};

describe("outside agents' thread tools", () => {
	it("starts supervised chats that say who started them, and retries find the same chat", async () => withRuntime(async runtime => {
		const tools = runtime.outsideThreadTools({ id: "t1", name: "Claude Code", access: "start" });
		const launched = await tools.launch!({ requestId: "r1", title: "Fix it", prompt: "Fix the bug", harness: "codex", model: "owned", permissionMode: undefined, workspace: { strategy: "none" } });
		expect((await tools.launch!({ requestId: "r1", title: "Again", prompt: "Again", harness: "codex", model: "owned", workspace: { strategy: "none" } })).id).toBe(launched.id);
		const stored = runtime.store.getTask(launched.id);
		expect(stored).toMatchObject({ launch: { byTaskId: "outside-agent:t1", requestId: "r1" }, permissionMode: "supervised", mode: "code" });
		expect([...stored.messages, ...stored.queue].find(message => message.text === "Fix the bug")?.notice).toEqual({ kind: "outside-agent", summary: "Claude Code started this chat", outcome: "updated" });
		await expect(tools.launch!({ requestId: "r2", title: "Wide", prompt: "x", harness: "codex", model: "owned", permissionMode: "full-access" })).rejects.toThrow(/broader permissions/);
		expect(tools.list!().map(thread => thread.id)).toContain(launched.id);
	}));

	it("messages only supervised chats, and read-only tokens change nothing", async () => withRuntime(async runtime => {
		const supervised = await chat(runtime, "supervised"), full = await chat(runtime, "full-access");
		const tools = runtime.outsideThreadTools({ id: "t1", name: "Codex", access: "start" });
		await tools.send!(supervised, "Please also add tests");
		const task = runtime.store.getTask(supervised);
		expect([...task.messages, ...task.queue].find(message => message.text === "Please also add tests")?.notice?.summary).toBe("Codex sent a message");
		await expect(tools.send!(full, "Delete everything")).rejects.toThrow(/more than supervised/);
		const reader = runtime.outsideThreadTools({ id: "t2", name: "Reader", access: "read" });
		await expect(reader.send!(supervised, "hi")).rejects.toThrow(/read only/);
		await expect(reader.launch!({ requestId: "r", title: "t", prompt: "p", harness: "codex", model: "owned" })).rejects.toThrow(/read only/);
		expect(reader.read!(supervised).thread.id).toBe(supervised);
		await expect(reader.wait!(supervised, 0)).rejects.toThrow(/chats they started/);
	}));

	it("gives read-only tokens only tools that need no approval, and finds chats by title", async () => withRuntime(async runtime => {
		const id = await chat(runtime, "supervised");
		await runtime.command({ type: "update-task", id, title: "Fix the login page" });
		const reader = runtime.outsideThreadTools({ id: "t2", name: "Reader", access: "read" });
		const definitions = threadTools(reader as ThreadTools);
		for (const name of outsideAgentTools.read) { const tool = definitions.find(value => value.id === name); expect(tool, name).toBeDefined(); expect("requireApproval" in tool! && tool.requireApproval, name).toBeFalsy(); }
		expect(reader.search!("login").map(thread => ({ id: thread.id, readable: thread.readable }))).toEqual([{ id, readable: true }]);
	}));

	it("refuses what it can't do for an agent with no chat, rather than dropping it", async () => withRuntime(async runtime => {
		const supervised = await chat(runtime, "supervised");
		const tools = runtime.outsideThreadTools({ id: "t1", name: "Codex", access: "start" });
		await expect(tools.launch!({ requestId: "a", title: "t", prompt: "p", harness: "codex", model: "owned", attachments: ["notes.txt"] })).rejects.toThrow(/attachments/);
		await expect(tools.send!(supervised, "hi", ["notes.txt"])).rejects.toThrow(/attachments/);
		await expect(tools.send!(supervised, "hi", undefined, true)).rejects.toThrow(/restart/);
		await expect(tools.delegate!({ requestId: "d", title: "t", prompt: "p", harness: "codex", model: "owned", isolation: "worktree" })).rejects.toThrow(/no project/);
		expect(runtime.store.getOverview().tasks.filter(task => task.launch?.byTaskId === "outside-agent:t1")).toEqual([]);
	}));
});

describe("outside agents' MCP server", () => {
	it("is off by default, needs a loopback token, and offers each token only its tools", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-outside-mcp-"));
		const list = vi.fn(() => [{ id: "c1", title: "Chat", harness: "codex" as const, model: "m", status: "idle" as const }]), send = vi.fn();
		const tools = vi.fn((): Partial<ThreadTools> => ({ list, send, read: vi.fn() }));
		const server = new OutsideAgentsMcp(directory, { tools });
		const port = 40000 + Math.floor(Math.random() * 20000), url = `http://127.0.0.1:${port}/mcp`;
		const client = new Client({ name: "outside-fixture", version: "1" });
		try {
			expect((await server.start()).running).toBe(false);
			const reader = server.createToken({ name: "Reader", access: "read" }), starter = server.createToken({ name: "Starter", access: "start" });
			expect(readFileSync(path.join(directory, "outside-agents.json"), "utf8")).not.toContain(reader.token);
			const settings = await server.setEnabled(true, port);
			expect(settings).toMatchObject({ enabled: true, running: true, url });
			expect((await fetch(url, { method: "POST" })).status).toBe(401);
			expect((await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${reader.token}`, Origin: "https://evil.example" } })).status).toBe(403);
			await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${reader.token}` } } }));
			expect((await client.listTools()).tools.map(tool => tool.name)).toEqual(["list_agents", "list_models", "list_threads", "search_threads", "read_thread", "list_projects"]);
			expect(await client.callTool({ name: "list_threads", arguments: {} })).toMatchObject({ content: [{ type: "text", text: expect.stringContaining("\"c1\"") }] });
			expect(await client.callTool({ name: "send_thread", arguments: { id: "c1", text: "hi" } })).toMatchObject({ isError: true });
			expect(send).not.toHaveBeenCalled();
			expect(tools).toHaveBeenCalledWith({ id: reader.settings.tokens[0].id, name: "Reader", access: "read" });
			const second = new Client({ name: "outside-fixture", version: "1" });
			await second.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${starter.token}` } } }));
			expect((await second.listTools()).tools.map(tool => tool.name)).toEqual(expect.arrayContaining(["launch_thread", "delegate_task", "send_thread", "wait_thread"]));
			await second.close();
			server.revokeToken(reader.settings.tokens[0].id);
			expect((await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${reader.token}` } })).status).toBe(401);
			expect((await server.setEnabled(false)).running).toBe(false);
		} finally { await client.close(); await server.stop(); rmSync(directory, { recursive: true, force: true }); }
	});
});
