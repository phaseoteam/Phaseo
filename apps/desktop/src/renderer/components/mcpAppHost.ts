/** What an MCP App page is shown: the call its tool made. */
export type McpAppCall = { input: unknown; result: unknown };
type Message = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };

/**
 * The host side of MCP Apps for one sandboxed page, answering over postMessage: the handshake (ui/initialize), then the
 * tool's input and result once the page says it is ready, and its size. Requests that would act for the person (calling
 * tools, sending messages, opening links) are declined; the page only shows the call that already happened.
 */
export function mcpAppReply(message: Message, call: McpAppCall, theme: "light" | "dark"): { replies: object[]; height?: number } {
	if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") return { replies: [] };
	const respond = (result: object) => ({ jsonrpc: "2.0", id: message.id, result });
	if (message.method === "ui/initialize") return { replies: [respond({ protocolVersion: "2026-01-26", hostInfo: { name: "Phaseo", version: "1" }, hostCapabilities: {}, hostContext: { theme, displayMode: "inline", availableDisplayModes: ["inline"] } })] };
	if (message.method === "ui/notifications/initialized") return { replies: [
		{ jsonrpc: "2.0", method: "ui/notifications/tool-input", params: { arguments: call.input } },
		{ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: call.result },
	] };
	if (message.method === "ui/notifications/size-changed") {
		const height = (message.params as { height?: unknown } | undefined)?.height;
		return { replies: [], ...(typeof height === "number" && Number.isFinite(height) && height > 0 ? { height: Math.ceil(height) } : {}) };
	}
	if (message.id !== undefined) return { replies: [{ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Phaseo shows this app's result only; it does not run tools or send messages from it." } }] };
	return { replies: [] };
}
