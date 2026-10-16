import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { OrchestratorMcp } from "./orchestratorMcp";
import { QuestionDeferredError } from "./phaseoQuestionTools";
import type { ThreadTools } from "../shared/orchestration";

describe("orchestration MCP transport", () => {
	it("exposes scoped tools, enforces approval and revokes invocation credentials", async () => {
		const service: ThreadTools = { list: () => [], read: vi.fn(), delegate: vi.fn(), wait: vi.fn(), interrupt: vi.fn() };
		const server = new OrchestratorMcp(), approve = vi.fn(async () => false);
		const session = await server.session(service, approve);
		if (session.connection.transport !== "http") throw new Error("Expected HTTP");
		const { url, headers } = session.connection;
		const client = new Client({ name: "owned-fixture", version: "1" });
		try {
			expect((await fetch(url, { method: "POST" })).status).toBe(401);
			expect((await fetch(url, { method: "POST", headers: { ...headers, Origin: "https://untrusted.example" } })).status).toBe(401);
			await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } }));
			expect((await client.listTools()).tools.map(tool => tool.name)).toEqual(["handoff_thread", "rename_thread", "steer_thread", "read_thread_queue", "edit_thread_queue", "fork_thread", "send_thread", "merge_thread_context", "list_agents", "list_models", "list_threads", "read_thread", "delegate_task", "wait_thread", "interrupt_thread", "launch_thread", "launch_threads", "list_projects", "organize_thread", "link_pull_request", "unlink_pull_request", "watch_pull_request", "unwatch_pull_request", "list_scheduled_tasks", "schedule_task", "update_scheduled_task", "delete_scheduled_task", "run_scheduled_task_now"]);
			expect(await client.callTool({ name: "list_threads", arguments: {} })).toMatchObject({ content: [{ type: "text", text: "[]" }] });
			expect(await client.callTool({ name: "delegate_task", arguments: { title: "Child", prompt: "Inspect", requestId: "owned" } })).toMatchObject({ isError: true });
			expect(approve).toHaveBeenCalledOnce(); expect(service.delegate).not.toHaveBeenCalled();
			session.close();
			expect((await fetch(url, { method: "POST", headers })).status).toBe(401);
		} finally { await client.close(); await server.close(); }
	});
	it("offers ask_user only where the harness has no question tool, and defers answers past the client's limit", async () => {
		const service: ThreadTools = { list: () => [], read: vi.fn(), delegate: vi.fn(), wait: vi.fn(), interrupt: vi.fn() };
		const ask = vi.fn().mockResolvedValueOnce({ "question-0": ["Small"] }).mockRejectedValueOnce(new QuestionDeferredError());
		const server = new OrchestratorMcp(); const plain = await server.session(service, async () => true); const asking = await server.session(service, async () => true, ask);
		const client = new Client({ name: "owned-fixture", version: "1" }), second = new Client({ name: "owned-fixture", version: "1" });
		try {
			if (plain.connection.transport !== "http" || asking.connection.transport !== "http") throw new Error("Expected HTTP");
			await client.connect(new StreamableHTTPClientTransport(new URL(plain.connection.url), { requestInit: { headers: plain.connection.headers } }));
			expect((await client.listTools()).tools.map(tool => tool.name)).not.toContain("ask_user");
			await second.connect(new StreamableHTTPClientTransport(new URL(asking.connection.url), { requestInit: { headers: asking.connection.headers } }));
			expect((await second.listTools()).tools.map(tool => tool.name)).toContain("ask_user");
			const input = { questions: [{ question: "Which scope?", header: "Scope", multiSelect: false, options: [{ label: "Small", description: "One file" }, { label: "Large", description: "Everything" }] }] };
			expect(await second.callTool({ name: "ask_user", arguments: input })).toMatchObject({ content: [{ type: "text", text: JSON.stringify({ answers: { "Which scope?": "Small" } }) }] });
			expect(ask).toHaveBeenCalledWith([expect.objectContaining({ id: "question-0", header: "Scope" })], expect.any(AbortSignal));
			const deferred = await second.callTool({ name: "ask_user", arguments: input }) as { content: { text: string }[] };
			expect(JSON.parse(deferred.content[0].text)).toMatchObject({ pending: true });
		} finally { await client.close(); await second.close(); await server.close(); }
	});
	it("publishes launch and schedule schemas and asks before archiving only", async () => {
		const organize = vi.fn(async (id: string) => ({ id, title: "Chat", harness: "codex" as const, model: "owned", status: "completed" as const, pinned: true, archived: false, tags: [] as string[] }));
		const service: ThreadTools = { list: () => [], read: vi.fn(), delegate: vi.fn(), wait: vi.fn(), interrupt: vi.fn(), organize, launch: vi.fn() };
		const server = new OrchestratorMcp(), approve = vi.fn(async () => false);
		const session = await server.session(service, approve);
		if (session.connection.transport !== "http") throw new Error("Expected HTTP");
		const client = new Client({ name: "owned-fixture", version: "1" });
		try {
			await client.connect(new StreamableHTTPClientTransport(new URL(session.connection.url), { requestInit: { headers: session.connection.headers } }));
			const tools = (await client.listTools()).tools;
			expect(tools.find(tool => tool.name === "launch_thread")?.inputSchema).toMatchObject({ required: ["requestId", "title", "prompt"], properties: { workspace: { properties: { strategy: { enum: ["same", "none", "project", "worktree", "existing_worktree"] } } } } });
			expect(tools.find(tool => tool.name === "schedule_task")?.inputSchema).toMatchObject({ properties: { schedule: { properties: { type: { enum: ["interval", "daily"] } } } } });
			expect(await client.callTool({ name: "organize_thread", arguments: { id: "owned", action: "pin" } })).not.toMatchObject({ isError: true });
			expect(approve).not.toHaveBeenCalled();
			expect(await client.callTool({ name: "organize_thread", arguments: { id: "owned", action: "archive" } })).toMatchObject({ isError: true });
			expect(approve).toHaveBeenCalledWith("organize_thread", { id: "owned", action: "archive" }); expect(organize).toHaveBeenCalledOnce();
			expect(await client.callTool({ name: "launch_thread", arguments: { requestId: "a", title: "A", prompt: "Work" } })).toMatchObject({ isError: true });
			expect(service.launch).not.toHaveBeenCalled();
		} finally { await client.close(); await server.close(); }
	});
});

 describe("orchestration credential expiry", () => {
	it("expires idle credentials and caps continuously active credentials", async () => {
		let now = 0;
		const server = new OrchestratorMcp(() => now);
		const tools: ThreadTools = { list: () => [], read: vi.fn(), delegate: vi.fn(), wait: vi.fn(), interrupt: vi.fn() };
		try {
			const idle = await server.session(tools, async () => true);
			if (idle.connection.transport !== "http") throw new Error("Expected HTTP");
			now = 30 * 60 * 1000;
			expect((await fetch(idle.connection.url, { method: "POST", headers: idle.connection.headers })).status).toBe(401);
			const active = await server.session(tools, async () => true);
			if (active.connection.transport !== "http") throw new Error("Expected HTTP");
			const client = new Client({ name: "expiry-fixture", version: "1" });
			try {
				await client.connect(new StreamableHTTPClientTransport(new URL(active.connection.url), { requestInit: { headers: active.connection.headers } }));
				for (let index = 0; index < 31; index++) { now += 15 * 60 * 1000; await client.listTools(); }
				now += 15 * 60 * 1000;
				await expect(client.listTools()).rejects.toThrow();
			} finally { await client.close(); }
		} finally { await server.close(); }
	});
});
