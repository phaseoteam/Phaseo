/** What an MCP App page is shown: the call its tool made. */
export type McpAppCall = { input: unknown; result: unknown };
type Message = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };

/** What the chat lets an app do, each asking the person where it should. */
export type McpAppHostActions = {
	theme: "light" | "dark";
	/** The theme's colours as CSS variables, for the app to match the window. */
	styles?: Record<string, string>;
	callTool: (name: string, input: Record<string, unknown>) => Promise<unknown>;
	sendMessage: (text: string) => Promise<boolean>;
	setContext: (text: string) => void;
	openLink: (url: string) => Promise<boolean>;
	requestFullscreen: (on: boolean) => "fullscreen" | "inline";
};

const text = (content: unknown) => Array.isArray(content) ? content.map(part => (part as { type?: unknown; text?: unknown })?.type === "text" ? String((part as { text: unknown }).text) : "").filter(Boolean).join("\n") : "";

/**
 * The host side of MCP Apps for one sandboxed page, over postMessage: the handshake, then the tool's input and result once
 * the page is ready, its size, and what it asks: running its own server's tools, posting a message, telling the agent what
 * the person did, opening a link and going full screen. Requests the chat does not offer get a method-not-found error.
 */
export async function mcpAppReply(message: Message, call: McpAppCall, host: McpAppHostActions): Promise<{ replies: object[]; height?: number }> {
	if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") return { replies: [] };
	const params = (message.params ?? {}) as Record<string, unknown>;
	const respond = (result: object) => ({ replies: [{ jsonrpc: "2.0", id: message.id, result }] });
	const fail = (code: number, reason: string) => ({ replies: [{ jsonrpc: "2.0", id: message.id, error: { code, message: reason } }] });
	switch (message.method) {
		case "ui/initialize": return respond({ protocolVersion: "2026-01-26", hostInfo: { name: "Phaseo", version: "1" },
			hostCapabilities: { serverTools: {}, openLinks: {}, message: {}, updateModelContext: {} },
			hostContext: { theme: host.theme, displayMode: "inline", availableDisplayModes: ["inline", "fullscreen"], ...host.styles ? { styles: { variables: host.styles } } : {} } });
		case "ui/notifications/initialized": return { replies: [
			{ jsonrpc: "2.0", method: "ui/notifications/tool-input", params: { arguments: call.input } },
			{ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: call.result },
		] };
		case "ui/notifications/size-changed": {
			const height = params.height;
			return { replies: [], ...typeof height === "number" && Number.isFinite(height) && height > 0 ? { height: Math.ceil(height) } : {} };
		}
		case "tools/call": {
			if (typeof params.name !== "string") return fail(-32602, "Name the tool to call.");
			const input = params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments) ? params.arguments as Record<string, unknown> : {};
			try { return respond(await host.callTool(params.name, input) as object); }
			catch (error) { return fail(-32000, error instanceof Error ? error.message : "The tool did not run."); }
		}
		case "ui/message": {
			const body = text((params as { content?: unknown }).content);
			if (!body.trim()) return fail(-32602, "The message has no text.");
			return await host.sendMessage(body) ? respond({}) : fail(-32000, "The person did not send the message.");
		}
		case "ui/update-model-context": {
			const body = text((params as { content?: unknown }).content) || (params.structuredContent ? JSON.stringify(params.structuredContent) : "");
			host.setContext(body.slice(0, 4000));
			return respond({});
		}
		case "ui/open-link": {
			if (typeof params.url !== "string") return fail(-32602, "Give the link to open.");
			return await host.openLink(params.url) ? respond({}) : fail(-32000, "The link was not opened.");
		}
		case "ui/request-display-mode": return respond({ mode: host.requestFullscreen(params.mode === "fullscreen") });
		default: return message.id === undefined ? { replies: [] } : fail(-32601, `Phaseo does not offer ${message.method} to apps.`);
	}
}
