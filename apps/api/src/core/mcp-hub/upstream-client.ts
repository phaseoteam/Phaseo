// A minimal MCP client for connected servers over Streamable HTTP: initialize,
// tools/list (paged) and tools/call, accepting JSON or SSE responses. It does
// nothing a server could ask of a client (sampling, elicitation, roots), so the
// hub never acts on a server's behalf.
//
// Every request goes through the fetch passed in, which must be safeFetch:
// connected servers are customer-chosen URLs.

export type HubFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type UpstreamTool = {
	name: string;
	title?: string;
	description?: string;
	inputSchema: Record<string, unknown>;
	annotations?: Record<string, unknown>;
};

export type UpstreamCallResult = {
	content: Array<Record<string, unknown>>;
	structuredContent?: Record<string, unknown>;
	isError?: boolean;
};

export class McpUpstreamError extends Error {
	/** unauthorized: the access token was refused; protocol: the reply wasn't MCP; rpc: a JSON-RPC error. */
	readonly code: "unauthorized" | "http" | "protocol" | "rpc";
	readonly status: number | null;
	constructor(code: McpUpstreamError["code"], message: string, status: number | null = null) {
		super(message);
		this.name = "McpUpstreamError";
		this.code = code;
		this.status = status;
	}
}

const CLIENT_PROTOCOL_VERSION = "2025-06-18";
const MAX_TOOL_PAGES = 10;
const MAX_TOOLS = 500;

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** The JSON-RPC response with this id, from a JSON body or an SSE stream. */
function findResponse(text: string, contentType: string, id: number): Record<string, unknown> | null {
	const messages: unknown[] = [];
	if (contentType.includes("text/event-stream")) {
		for (const event of text.split(/\r?\n\r?\n/)) {
			const data = event.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).replace(/^ /, "")).join("\n");
			if (!data) continue;
			try { messages.push(JSON.parse(data)); } catch { /* not JSON-RPC */ }
		}
	} else {
		try { messages.push(JSON.parse(text)); } catch { return null; }
	}
	for (const message of messages.flat()) {
		const record = asRecord(message);
		if (record && record.id === id && ("result" in record || "error" in record)) return record;
	}
	return null;
}

export class McpUpstreamSession {
	private nextId = 1;
	private sessionId: string | null = null;
	private protocolVersion = CLIENT_PROTOCOL_VERSION;

	constructor(
		private readonly serverUrl: string,
		private readonly accessToken: string | null,
		private readonly fetch: HubFetch,
	) {}

	private headers(): Record<string, string> {
		const headers: Record<string, string> = {
			"content-type": "application/json",
			accept: "application/json, text/event-stream",
			"mcp-protocol-version": this.protocolVersion,
		};
		if (this.accessToken) headers.authorization = `Bearer ${this.accessToken}`;
		if (this.sessionId) headers["mcp-session-id"] = this.sessionId;
		return headers;
	}

	private async post(body: Record<string, unknown>): Promise<Response> {
		const response = await this.fetch(this.serverUrl, { method: "POST", headers: this.headers(), body: JSON.stringify(body) });
		if (response.status === 401 || response.status === 403) {
			await response.body?.cancel().catch(() => undefined);
			throw new McpUpstreamError("unauthorized", "The server refused the connection's access token.", response.status);
		}
		return response;
	}

	async request(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
		const id = this.nextId++;
		const response = await this.post({ jsonrpc: "2.0", id, method, params });
		const text = await response.text();
		if (!response.ok) throw new McpUpstreamError("http", `The server answered ${response.status}.`, response.status);
		const reply = findResponse(text, response.headers.get("content-type") ?? "", id);
		if (!reply) throw new McpUpstreamError("protocol", "The server's reply was not an MCP response.", response.status);
		const error = asRecord(reply.error);
		if (error) throw new McpUpstreamError("rpc", typeof error.message === "string" ? error.message.slice(0, 500) : "The server returned an error.");
		return asRecord(reply.result) ?? {};
	}

	async initialize(): Promise<void> {
		const id = this.nextId++;
		const response = await this.post({
			jsonrpc: "2.0",
			id,
			method: "initialize",
			params: { protocolVersion: CLIENT_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "Phaseo", version: "1.0.0" } },
		});
		this.sessionId = response.headers.get("mcp-session-id");
		const text = await response.text();
		if (!response.ok) throw new McpUpstreamError("http", `The server answered ${response.status}.`, response.status);
		const reply = findResponse(text, response.headers.get("content-type") ?? "", id);
		const result = asRecord(reply?.result);
		if (!result) throw new McpUpstreamError("protocol", "The server did not complete the MCP handshake.", response.status);
		if (typeof result.protocolVersion === "string") this.protocolVersion = result.protocolVersion;
		const notified = await this.post({ jsonrpc: "2.0", method: "notifications/initialized" });
		await notified.body?.cancel().catch(() => undefined);
	}

	async listTools(): Promise<UpstreamTool[]> {
		const tools: UpstreamTool[] = [];
		let cursor: string | undefined;
		for (let page = 0; page < MAX_TOOL_PAGES; page += 1) {
			const result = await this.request("tools/list", cursor ? { cursor } : {});
			for (const raw of Array.isArray(result.tools) ? result.tools : []) {
				const tool = asRecord(raw);
				if (!tool || typeof tool.name !== "string" || !tool.name) continue;
				tools.push({
					name: tool.name,
					title: typeof tool.title === "string" ? tool.title : undefined,
					description: typeof tool.description === "string" ? tool.description : undefined,
					inputSchema: asRecord(tool.inputSchema) ?? { type: "object" },
					annotations: asRecord(tool.annotations) ?? undefined,
				});
				if (tools.length >= MAX_TOOLS) return tools;
			}
			cursor = typeof result.nextCursor === "string" && result.nextCursor ? result.nextCursor : undefined;
			if (!cursor) break;
		}
		return tools;
	}

	async callTool(name: string, args: Record<string, unknown>): Promise<UpstreamCallResult> {
		const result = await this.request("tools/call", { name, arguments: args });
		return {
			content: Array.isArray(result.content) ? result.content.filter((item): item is Record<string, unknown> => asRecord(item) !== null) : [],
			structuredContent: asRecord(result.structuredContent) ?? undefined,
			isError: result.isError === true,
		};
	}

	/** Ends a stateful session. Best effort; servers may not support it. */
	async close(): Promise<void> {
		if (!this.sessionId) return;
		const response = await this.fetch(this.serverUrl, { method: "DELETE", headers: this.headers() }).catch(() => null);
		await response?.body?.cancel().catch(() => undefined);
	}
}

/** Opens a session, runs work, and closes it. */
export async function withUpstreamSession<T>(serverUrl: string, accessToken: string | null, fetch: HubFetch, work: (session: McpUpstreamSession) => Promise<T>): Promise<T> {
	const session = new McpUpstreamSession(serverUrl, accessToken, fetch);
	await session.initialize();
	try {
		return await work(session);
	} finally {
		await session.close();
	}
}
