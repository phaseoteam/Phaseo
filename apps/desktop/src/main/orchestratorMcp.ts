import { createServer, type Server as HttpServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { McpConnection } from "../shared/mcp";
import type { ThreadTools } from "../shared/orchestration";
import { threadTools } from "./threadTools";
import type { AgentQuestion } from "../shared/workspace";
import { answerPhaseoQuestion, phaseoQuestionTools, QuestionDeferredError } from "./phaseoQuestionTools";

/** Asks the person; throws QuestionDeferredError when the answer will come later as a message. */
export type OrchestratorAsk = (questions: AgentQuestion[], signal: AbortSignal) => Promise<Record<string, string[]>>;

/** Credentials are invocation-scoped and never stored with workspace connections. */
export class OrchestratorMcp {
	private server?: HttpServer;
	private starting?: Promise<number>;
	private readonly sessions = new Map<string, { tools: ThreadTools; approve: (name: string, args: unknown) => Promise<boolean>; ask?: OrchestratorAsk; createdAt: number; lastUsedAt: number }>();
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
				// ask_user (Phaseo's AskUserQuestion) is offered only to harnesses without a question tool of their own (Cursor).
				const tools = threadTools(session.tools); const askTool = session.ask ? phaseoQuestionTools()[0] : undefined;
				// A client that gives up on a long wait_thread closes the request; the wait then upgrades the child to deliver its result.
				const disconnected = new AbortController(); response.on("close", () => disconnected.abort());
				mcp.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [...tools, ...askTool ? [askTool] : []].map(tool => ({ name: tool.id, description: tool.description, inputSchema: tool.parameters as { type: "object" } })) }));
				mcp.setRequestHandler(CallToolRequestSchema, async ({ params }, extra) => {
					try {
						if (!this.activeSession(token)) throw new Error("This agent session has ended.");
						if (askTool && session.ask && params.name === askTool.id) {
							const ask = session.ask, signal = AbortSignal.any([disconnected.signal, extra.signal]);
							try { return { content: [{ type: "text" as const, text: JSON.stringify(await answerPhaseoQuestion(params.arguments ?? {}, { onQuestion: questions => ask(questions, signal) }, signal)) }] }; }
							catch (error) { if (!(error instanceof QuestionDeferredError)) throw error; return { content: [{ type: "text" as const, text: JSON.stringify({ pending: true, message: "The user has not answered yet. Their answer will reach you as a message; carry on with work that does not depend on it, or end your turn." }) }] }; }
						}
						const tool = tools.find(value => value.id === params.name);
						if (!tool) throw new Error("Unknown thread tool.");
						// Approval can depend on the arguments (organize_thread asks only before archiving), as in the Phaseo agent loop.
						const gated = "requireApproval" in tool && (typeof tool.requireApproval === "function" ? tool.requireApproval(params.arguments ?? {}) : tool.requireApproval);
						if (gated && !await session.approve(tool.id, params.arguments ?? {})) throw new Error("Delegation was declined.");
						if (!this.activeSession(token)) throw new Error("This agent session has ended.");
						const result = await tool.execute(params.arguments ?? {}, AbortSignal.any([disconnected.signal, extra.signal]));
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
	async session(tools: ThreadTools, approve: (name: string, args: unknown) => Promise<boolean>, ask?: OrchestratorAsk): Promise<{ connection: McpConnection; close: () => void }> {
		const port = await this.listen();
		const token = randomBytes(32).toString("hex"); this.sessions.set(token, { tools, approve, ...(ask ? { ask } : {}), createdAt: this.now(), lastUsedAt: this.now() });
		return { connection: { id: randomUUID(), name: "Phaseo orchestration", enabled: true, orchestration: true, transport: "http", url: `http://127.0.0.1:${port}/mcp`, headers: { Authorization: `Bearer ${token}` } }, close: () => { this.sessions.delete(token); } };
	}
	async close() {
		this.sessions.clear(); await Promise.allSettled([...this.transports].map(transport => transport.close()));
		if (this.server) await new Promise<void>(resolve => { this.server!.close(() => resolve()); this.server!.closeAllConnections(); });
	}
}
