/**
 * The MCP SDK, loaded on first use. With ajv and zod it is the largest thing the main bundle would otherwise load before
 * the first window: 0.3–0.6 s, most of it Node resolving its files through node_modules. Every use is inside a request
 * handler or a server start, and the app warms it a few seconds after launch (warmMcpSdk), so a chat rarely waits.
 * Once loaded, `loaded…()` returns it synchronously, so callers can skip the await.
 */
const loadServerSdk = async () => {
	const [server, http, types] = await Promise.all([import("@modelcontextprotocol/sdk/server/index.js"), import("@modelcontextprotocol/sdk/server/streamableHttp.js"), import("@modelcontextprotocol/sdk/types.js")]);
	return { Server: server.Server, StreamableHTTPServerTransport: http.StreamableHTTPServerTransport, CallToolRequestSchema: types.CallToolRequestSchema, ListToolsRequestSchema: types.ListToolsRequestSchema };
};
const loadClientSdk = async () => {
	const [client, stdio, http, types] = await Promise.all([import("@modelcontextprotocol/sdk/client/index.js"), import("@modelcontextprotocol/sdk/client/stdio.js"), import("@modelcontextprotocol/sdk/client/streamableHttp.js"), import("@modelcontextprotocol/sdk/types.js")]);
	return { Client: client.Client, StdioClientTransport: stdio.StdioClientTransport, getDefaultEnvironment: stdio.getDefaultEnvironment, StreamableHTTPClientTransport: http.StreamableHTTPClientTransport, ElicitRequestSchema: types.ElicitRequestSchema };
};

let serverSdk: Awaited<ReturnType<typeof loadServerSdk>> | undefined, clientSdk: Awaited<ReturnType<typeof loadClientSdk>> | undefined;
export const loadedMcpServerSdk = () => serverSdk;
export const loadedMcpClientSdk = () => clientSdk;
export const mcpServerSdk = async () => serverSdk ??= await loadServerSdk();
export const mcpClientSdk = async () => clientSdk ??= await loadClientSdk();
export const mcpTypes = () => import("@modelcontextprotocol/sdk/types.js");

/** Loads both in the background, once the window is up. */
export function warmMcpSdk() {
	void mcpClientSdk().catch(() => undefined);
	void mcpServerSdk().catch(() => undefined);
}
