import { createServer, type Server as HttpServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { McpConnection } from "../shared/mcp";
import type { ThreadTools } from "../shared/orchestration";
import { threadTools } from "./threadTools";

/** Credentials are invocation-scoped and never stored with workspace connections. */
export class OrchestratorMcp {
	private server?: HttpServer;
	private starting?: Promise<number>;
	private readonly sessions = new Map<string, { tools: ThreadTools; approve: (name: string, args: unknown) => Promise<boolean>; createdAt: number; lastUsedAt: number }>();
	private readonly transports = new Set<StreamableHTTPServerTransport>();
	constructor(private readonly now: () => number = Date.now) {}
	private activeSession(token: string) {
		const session = this.sessions.get(token), now = this.now();
		if (!session) return undefined;
		if (now - session.createdAt >= 8 * 60 * 60 * 1000 || now - session.lastUsedAt >= 30 * 60 * 1000) { this.sessions.delete(token); return undefined; }
		session.lastUsedAt = now;
		return session;
	}
	private listen(): Promise<number> {
		return this.starting ??= new Promise((resolve, reject) => {
			this.server = createServer(async (request, response) => {
				const token = request.headers.authorization?.startsWith("Bearer ") ? request.headers.authorization.slice(7) : "";
				const session = this.activeSession(token);
				if (request.url !== "/mcp" || !session || request.headers.origin || !["127.0.0.1"].includes(request.socket.remoteAddress ?? "")) { response.writeHead(401).end(); return; }
				if (request.method !== "POST") { response.writeHead(405).end(); return; }
				const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
				const mcp = new Server({ name: "phaseo-orchestrator", version: "1.0.0" }, { capabilities: { tools: {} } });
				const tools = threadTools(session.tools);
				mcp.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: tools.map(tool => ({ name: tool.id, description: tool.description, inputSchema: tool.parameters as { type: "object" } })) }));
				mcp.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
					try {
						if (!this.activeSession(token)) throw new Error("This agent session has ended.");
						const tool = tools.find(value => value.id === params.name);
						if (!tool) throw new Error("Unknown thread tool.");
						if ("requireApproval" in tool && tool.requireApproval && !await session.approve(tool.id, params.arguments ?? {})) throw new Error("Delegation was declined.");
						if (!this.activeSession(token)) throw new Error("This agent session has ended.");
						const result = await tool.execute(params.arguments ?? {});
						return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
					} catch (error) { return { isError: true, content: [{ type: "text" as const, text: error instanceof Error ? error.message : "Thread operation failed." }] }; }
				});
				this.transports.add(transport);
				response.on("close", () => { this.transports.delete(transport); void mcp.close().catch(() => {}); });
				try { await mcp.connect(transport); await transport.handleRequest(request, response); }
				catch { if (!response.headersSent) response.writeHead(500).end(); }
			});
			this.server.once("error", reject);
			this.server.listen(0, "127.0.0.1", () => { const address = this.server!.address(); if (!address || typeof address === "string") reject(new Error("Orchestration server unavailable.")); else resolve(address.port); });
		});
	}
	async session(tools: ThreadTools, approve: (name: string, args: unknown) => Promise<boolean>): Promise<{ connection: McpConnection; close: () => void }> {
		const port = await this.listen();
		const token = randomBytes(32).toString("hex"); this.sessions.set(token, { tools, approve, createdAt: this.now(), lastUsedAt: this.now() });
		return { connection: { id: randomUUID(), name: "Phaseo orchestration", enabled: true, transport: "http", url: `http://127.0.0.1:${port}/mcp`, headers: { Authorization: `Bearer ${token}` } }, close: () => { this.sessions.delete(token); } };
	}
	async close() {
		this.sessions.clear(); await Promise.allSettled([...this.transports].map(transport => transport.close()));
		if (this.server) await new Promise<void>(resolve => { this.server!.close(() => resolve()); this.server!.closeAllConnections(); });
	}
}
