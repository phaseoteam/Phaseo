/**
 * `orchestration` marks the per-turn Phaseo orchestration server: never saved, and the only MCP server allowed in Chat mode.
 * `secretHeaders` names the HTTP headers whose values are in the credential vault; only main fills `headers` with them,
 * right before connecting, so settings and the renderer never hold the values.
 */
export type McpConnection = { id: string; name: string; projectId?: string; enabled: boolean; archived?: boolean; orchestration?: boolean } & ({ transport: "stdio"; executable: string; arguments: string[] } | { transport: "http"; url: string; headers?: Record<string, string>; secretHeaders?: string[] });
/** `headers` holds new values for names in `connection.secretHeaders`; a listed name without one keeps its saved value. */
export type McpCommand = { type: "save"; connection: McpConnection; headers?: Record<string, string> };

export const maximumMcpHeaders = 20;
const headerName = /^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,100}$/;
/** A connection as settings and the renderer see it: header names, never values. */
export function publicMcpConnection(connection: McpConnection): McpConnection {
	if (connection.transport !== "http" || !connection.headers) return connection;
	const { headers, ...rest } = connection, names = [...new Set([...connection.secretHeaders ?? [], ...Object.keys(headers)])];
	return names.length ? { ...rest, secretHeaders: names } : rest;
}

export function validateMcpCommand(value: unknown): McpCommand {
	if (!value || typeof value !== "object" || (value as McpCommand).type !== "save") throw new Error("Invalid MCP command.");
	const input = (value as McpCommand).connection;
	if (!input || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(input.id) || typeof input.name !== "string" || !input.name.trim() || input.name.length > 100 || typeof input.enabled !== "boolean" || (input.archived !== undefined && typeof input.archived !== "boolean") || (input.projectId !== undefined && (typeof input.projectId !== "string" || !input.projectId.trim() || input.projectId.length > 1000))) throw new Error("Invalid MCP connection.");
	const common = { id: input.id, name: input.name.trim(), projectId: input.projectId, enabled: input.enabled, archived: input.archived };
	if (input.transport === "stdio") {
		if (typeof input.executable !== "string" || !/^(?:[A-Za-z]:[\\/]|\/|\\\\)/.test(input.executable) || input.executable.length > 1000 || input.executable.includes("\0") || !Array.isArray(input.arguments) || input.arguments.length > 100 || input.arguments.some(value => typeof value !== "string" || value.length > 10000 || value.includes("\0"))) throw new Error("Use an absolute MCP executable path and valid arguments.");
		return { type: "save", connection: { ...common, transport: "stdio", executable: input.executable, arguments: [...input.arguments] } };
	}
	if (input.transport !== "http" || typeof input.url !== "string" || input.url.length > 4000) throw new Error("Invalid MCP transport.");
	const url = new URL(input.url);
	if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw new Error("Use HTTPS or a local MCP URL without credentials or query parameters.");
	const names = input.secretHeaders ?? [], values = (value as McpCommand).headers ?? {};
	if (!Array.isArray(names) || names.length > maximumMcpHeaders || names.some(name => typeof name !== "string" || !headerName.test(name)) || new Set(names.map(name => name.toLowerCase())).size !== names.length) throw new Error(`Use up to ${maximumMcpHeaders} headers with distinct names made of letters, digits and - _ . characters.`);
	if (!values || typeof values !== "object" || Array.isArray(values) || Object.entries(values).some(([name, header]) => !names.includes(name) || typeof header !== "string" || !header || header.length > 8000 || /[\r\n\0]/.test(header))) throw new Error("Header values must be single lines of up to 8,000 characters.");
	return { type: "save", connection: { ...common, transport: "http", url: url.href, ...(names.length ? { secretHeaders: [...names] } : {}) }, ...(Object.keys(values).length ? { headers: { ...values } } : {}) };
}

export const nativeMcpName = (connection: McpConnection) => `phaseo_${connection.id.replaceAll("-", "")}`;
