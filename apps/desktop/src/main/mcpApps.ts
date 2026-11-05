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
type ToolEntry = { name: string; title?: string; description?: string; readOnly: boolean; uri?: string; appOnly: boolean };
const uiMeta = (tool: { _meta?: Record<string, unknown> }) => {
	const meta = tool._meta ?? {}, ui = (meta.ui ?? {}) as { resourceUri?: unknown; visibility?: unknown }, flat = meta["ui/resourceUri"];
	const uri = typeof ui.resourceUri === "string" ? ui.resourceUri : typeof flat === "string" ? flat : undefined;
	const visibility = Array.isArray(ui.visibility) ? ui.visibility as unknown[] : undefined;
	return { uri: uri?.startsWith("ui://") ? uri : undefined, appOnly: Boolean(visibility && visibility.includes("app") && !visibility.includes("model")) };
};

/** What an app's own server says a tool is, for asking the person before it runs. */
export type McpAppTool = Pick<ToolEntry, "name" | "title" | "description" | "readOnly">;

/**
 * MCP Apps: a tool may name a ui:// page its server serves, and that page may call the server's tools. Each server's tool
 * list is read once per configuration, with the app's own short-lived client (the agent's connection belongs to the
 * agent), and each page once; the page itself runs only in the chat's sandboxed frame.
 */
export class McpAppPages {
	private readonly tools = new Map<string, Promise<Map<string, ToolEntry>>>();
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

	/** The server's tools, read once per configuration; a server that can't be read has none. */
	private toolsOf(connection: McpConnection) {
		const key = this.key(connection);
		let tools = this.tools.get(key);
		if (!tools) {
			tools = this.session(connection, async client => {
				const found = new Map<string, ToolEntry>();
				if (!client.getServerCapabilities()?.tools) return found;
				for (let cursor: string | undefined, pages = 0; pages < 20; pages++) {
					const page = await client.listTools(cursor ? { cursor } : {}, { timeout: 30_000 });
					for (const entry of page.tools) {
						const { uri, appOnly } = uiMeta(entry as { _meta?: Record<string, unknown> });
						found.set(entry.name, { name: entry.name, ...entry.title ? { title: entry.title } : {}, ...entry.description ? { description: entry.description.slice(0, 500) } : {}, readOnly: entry.annotations?.readOnlyHint === true, ...uri ? { uri } : {}, appOnly });
					}
					cursor = page.nextCursor; if (!cursor) break;
				}
				return found;
			}).catch(() => new Map<string, ToolEntry>());
			this.tools.set(key, tools);
		}
		return tools;
	}

	/** The page a tool names, or undefined when it names none or the server can't give it. */
	async page(connection: McpConnection, tool: string): Promise<string | undefined> {
		const uri = (await this.toolsOf(connection)).get(tool)?.uri;
		if (!uri) return undefined;
		const pageKey = `${this.key(connection)}:${uri}`;
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

	/** What a tool on the app's own server is, or undefined when the server has no such tool. */
	async tool(connection: McpConnection, name: string): Promise<McpAppTool | undefined> {
		const entry = (await this.toolsOf(connection)).get(name);
		return entry ? { name: entry.name, ...entry.title ? { title: entry.title } : {}, ...entry.description ? { description: entry.description } : {}, readOnly: entry.readOnly } : undefined;
	}

	/** Runs a tool of the app's own server for the app, once the person allowed it (or it is read-only). */
	async call(connection: McpConnection, name: string, input: Record<string, unknown>) {
		if (!await this.tool(connection, name)) throw new Error(`The app's server has no tool called ${name}.`);
		return this.session(connection, client => client.callTool({ name, arguments: input }, undefined, { timeout: 120_000 }));
	}

	/** Forgets the servers' tools and pages after MCP settings change. */
	forget() { this.tools.clear(); this.pages.clear(); }
}
