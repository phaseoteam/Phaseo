/**
 * A finished call to a tool of one of the person's MCP servers, as an agent reported it. Every agent is given those
 * servers under the same name (phaseo_<id>, nativeMcpName), so this names the server whatever the agent.
 */
export type McpCall = { server: string; tool: string; input?: unknown; result?: unknown };

/**
 * The server and tool in a tool name as agents write them: mcp__phaseo_<id>__tool (Claude Code, Pi), phaseo_<id>_tool
 * (OpenCode), phaseo_<id>.tool or phaseo_<id>/tool (others).
 */
export function mcpServerTool(name: string): { server: string; tool: string } | undefined {
	const match = /^(?:mcp__)?(phaseo_[0-9a-f]{32})(?:__|[_./:])(.+)$/.exec(name.trim());
	return match ? { server: match[1], tool: match[2] } : undefined;
}

/** Input text an agent reported, as the object it was, when it was one. */
export function parsedInput(text: string | undefined): unknown {
	if (!text) return {};
	try { const value: unknown = JSON.parse(text); return value && typeof value === "object" ? value : {}; } catch { return {}; }
}
