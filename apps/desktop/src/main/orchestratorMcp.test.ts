import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { OrchestratorMcp } from "./orchestratorMcp";
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
			expect((await client.listTools()).tools.map(tool => tool.name)).toEqual(["handoff_thread", "rename_thread", "steer_thread", "read_thread_queue", "edit_thread_queue", "fork_thread", "send_thread", "merge_thread_context", "list_models", "list_threads", "read_thread", "delegate_task", "wait_thread", "interrupt_thread"]);
			expect(await client.callTool({ name: "list_threads", arguments: {} })).toMatchObject({ content: [{ type: "text", text: "[]" }] });
			expect(await client.callTool({ name: "delegate_task", arguments: { title: "Child", prompt: "Inspect", requestId: "owned" } })).toMatchObject({ isError: true });
			expect(approve).toHaveBeenCalledOnce(); expect(service.delegate).not.toHaveBeenCalled();
			session.close();
			expect((await fetch(url, { method: "POST", headers })).status).toBe(401);
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
