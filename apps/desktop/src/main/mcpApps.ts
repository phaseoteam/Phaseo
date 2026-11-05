import { createHash } from "node:crypto";
import type { McpConnection } from "../shared/mcp";
import { nativeMcpName } from "../shared/mcp";
import { mcpServerTool } from "../shared/mcpCall";
import type { AgentActivity } from "../shared/workspace";
import { htmlRenderLimits } from "../shared/htmlRender";
import { loadMcpClientSdk } from "./phaseoMcp";

/**
 * The server and tool behind a finished tool step. Agents report MCP calls (mcpCall) under the server name they were given
 * (nativeMcpName); a step from an older chat or an agent that does not falls back to its title.
 */
export function mcpToolOf(activity: Pick<AgentActivity, "title" | "mcpCall">, connections: McpConnection[]): { connection: McpConnection; tool: string } | undefined {
	const named = activity.mcpCall ?? mcpServerTool(activity.title);
	if (named) { const connection = connections.find(value => nativeMcpName(value) === named.server); return connection ? { connection, tool: named.tool } : undefined; }
	// The Phaseo harness labels its MCP tools "<server> · <tool>".
	const at = activity.title.indexOf(" · ");
	if (at < 1) return undefined;
	const connection = connections.find(value => value.name === activity.title.slice(0, at));
	return connection ? { connection, tool: activity.title.slice(at + 3) } : undefined;
}

/** A tool result as MCP Apps expects it (CallToolResult), from whatever shape the agent reported. */
export function toolResult(value: unknown, fallbackText = ""): { content: unknown[]; structuredContent?: unknown; isError?: boolean } {
	if (value && typeof value === "object" && Array.isArray((value as { content?: unknown }).content)) return value as { content: unknown[] };
	if (typeof value === "string") return { content: [{ type: "text", text: value }] };
	return value === undefined ? { content: [{ type: "text", text: fallbackText }] } : { content: [{ type: "text", text: JSON.stringify(value) }], ...value && typeof value === "object" && !Array.isArray(value) ? { structuredContent: value } : {} };
}

/** What a step sent and got back: the agent's own report, or Claude Code's text (the input JSON, a blank line, the output). */
export function mcpCallOf(activity: Pick<AgentActivity, "text" | "mcpCall">) {
	if (activity.mcpCall) return { input: activity.mcpCall.input ?? {}, result: toolResult(activity.mcpCall.result, activity.text) };
	const split = activity.text.indexOf("\n\n");
	const inputText = split < 0 ? "" : activity.text.slice(0, split), output = split < 0 ? activity.text : activity.text.slice(split + 2);
	const parse = (text: string) => { try { const value: unknown = JSON.parse(text); return value && typeof value === "object" ? value : undefined; } catch { return undefined; } };
	const input = parse(inputText), structured = parse(output);
	return { input: input ?? {}, result: { content: [{ type: "text", text: output }], ...(structured && !Array.isArray(structured) ? { structuredContent: structured } : {}) } };
}

type Lookup = (connection: McpConnection) => Promise<McpConnection>;
const uiUri = (tool: { _meta?: Record<string, unknown> }) => {
	const meta = tool._meta ?? {}, nested = (meta.ui as { resourceUri?: unknown } | undefined)?.resourceUri, flat = meta["ui/resourceUri"];
	const uri = typeof nested === "string" ? nested : typeof flat === "string" ? flat : undefined;
	return uri?.startsWith("ui://") ? uri : undefined;
};

/**
 * MCP Apps: a tool may name a ui:// page its server serves. Each server's tool list is read once per configuration, with
 * its own short-lived client (the agent's connection belongs to the agent), and each page once; nothing runs on the page
 * here, it is only fetched for the chat's sandboxed frame.
 */
export class McpAppPages {
	private readonly tools = new Map<string, Promise<Map<string, string>>>();
	private readonly pages = new Map<string, Promise<string | undefined>>();
	constructor(private readonly withSecrets: Lookup) {}
	private key = (connection: McpConnection) => createHash("sha256").update(JSON.stringify(connection)).digest("hex");

	private async session<T>(connection: McpConnection, use: (client: InstanceType<Awaited<ReturnType<typeof loadMcpClientSdk>>[0]["Client"]>) => Promise<T>): Promise<T> {
		const [{ Client }, { StdioClientTransport, getDefaultEnvironment }, { StreamableHTTPClientTransport }] = await loadMcpClientSdk();
		const resolved = await this.withSecrets(connection);
		const client = new Client({ name: "phaseo-desktop-apps", version: "0.1.0" });
		const transport = resolved.transport === "stdio"
			? new StdioClientTransport({ command: resolved.executable, args: resolved.arguments, env: { ...getDefaultEnvironment(), ELECTRON_RUN_AS_NODE: "1" }, stderr: "ignore" })
			: new StreamableHTTPClientTransport(new URL(resolved.url), { requestInit: { headers: resolved.headers } });
		await client.connect(transport, { timeout: 30_000 });
		try { return await use(client); } finally { await client.close().catch(() => undefined); }
	}

	/** The page a tool names, or undefined when it names none or the server can't give it. */
	async page(connection: McpConnection, tool: string): Promise<string | undefined> {
		const key = this.key(connection);
		let tools = this.tools.get(key);
		if (!tools) {
			tools = this.session(connection, async client => {
				const found = new Map<string, string>();
				if (!client.getServerCapabilities()?.tools) return found;
				for (let cursor: string | undefined, pages = 0; pages < 20; pages++) {
					const page = await client.listTools(cursor ? { cursor } : {}, { timeout: 30_000 });
					for (const entry of page.tools) { const uri = uiUri(entry as { _meta?: Record<string, unknown> }); if (uri) found.set(entry.name, uri); }
					cursor = page.nextCursor; if (!cursor) break;
				}
				return found;
			}).catch(() => new Map<string, string>());
			this.tools.set(key, tools);
		}
		const uri = (await tools).get(tool);
		if (!uri) return undefined;
		const pageKey = `${key}:${uri}`;
		let html = this.pages.get(pageKey);
		if (!html) {
			html = this.session(connection, async client => {
				const read = await client.readResource({ uri }, { timeout: 30_000 });
				const content = read.contents.find(entry => typeof (entry as { text?: unknown }).text === "string" && /html/i.test(String(entry.mimeType ?? "text/html"))) as { text: string } | undefined;
				return content && new TextEncoder().encode(content.text).length <= htmlRenderLimits.bytes ? content.text : undefined;
			}).catch(() => undefined);
			this.pages.set(pageKey, html);
		}
		return html;
	}

	/** Forgets a connection's tools and pages after its settings change. */
	forget() { this.tools.clear(); this.pages.clear(); }
}
