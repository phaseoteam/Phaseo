export type McpConnection = { id: string; name: string; projectId?: string; enabled: boolean; archived?: boolean } & ({ transport: "stdio"; executable: string; arguments: string[] } | { transport: "http"; url: string });
export type McpCommand = { type: "save"; connection: McpConnection };

export function validateMcpCommand(value: unknown): McpCommand {
	if (!value || typeof value !== "object" || (value as McpCommand).type !== "save") throw new Error("Invalid MCP command.");
	const input = (value as McpCommand).connection;
	if (!input || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(input.id) || typeof input.name !== "string" || !input.name.trim() || input.name.length > 100 || typeof input.enabled !== "boolean" || (input.archived !== undefined && typeof input.archived !== "boolean") || (input.projectId !== undefined && (typeof input.projectId !== "string" || !input.projectId.trim() || input.projectId.length > 1000))) throw new Error("Invalid MCP connection.");
	const common = { id: input.id, name: input.name.trim(), projectId: input.projectId, enabled: input.enabled, archived: input.archived };
	if (input.transport === "stdio") {
		if (typeof input.executable !== "string" || !/^(?:[A-Za-z]:[\\/]|\/|\\\\)/.test(input.executable) || input.executable.length > 1000 || input.executable.includes("\0") || !Array.isArray(input.arguments) || input.arguments.length > 100 || input.arguments.some(value => typeof value !== "string" || value.length > 10000 || value.includes("\0"))) throw new Error("Use an absolute MCP executable path and a JSON array of arguments.");
		return { type: "save", connection: { ...common, transport: "stdio", executable: input.executable, arguments: [...input.arguments] } };
	}
	if (input.transport !== "http" || typeof input.url !== "string" || input.url.length > 4000) throw new Error("Invalid MCP transport.");
	const url = new URL(input.url);
	if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw new Error("Use HTTPS or a local MCP URL without credentials or query parameters.");
	return { type: "save", connection: { ...common, transport: "http", url: url.href } };
}

export const nativeMcpName = (connection: McpConnection) => `phaseo_${connection.id.replaceAll("-", "")}`;
