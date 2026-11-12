import { setTimeout as delay } from "node:timers/promises";
import type { Task } from "../shared/workspace";
import { nativeMcpName, type McpConnection } from "../shared/mcp";
import type { JsonRpc } from "./jsonRpc";

/** Servers Codex should start for this task: everything enabled in scope, or only the orchestration server in Chat. */
export const codexMcpEnabled = (connection: McpConnection, task: Pick<Task, "projectId" | "mode">) => connection.enabled && !connection.archived && (connection.orchestration || (task.mode !== "chat" && (!connection.projectId || connection.projectId === task.projectId)));
export function codexMcpConfig(connections: McpConnection[], task: Pick<Task, "projectId" | "mode">) {
	return Object.fromEntries(connections.map(connection => [`mcp_servers.${nativeMcpName(connection)}`, {
		...(connection.transport === "stdio" ? { command: connection.executable, args: connection.arguments, env: { ELECTRON_RUN_AS_NODE: "1" } } : { url: connection.url, ...(connection.headers ? { http_headers: connection.headers } : {}) }),
		// Codex's default 60 s tool timeout would cut wait_thread short; it waits up to an hour.
		...(connection.orchestration ? { tool_timeout_sec: 3660 } : {}),
		enabled: codexMcpEnabled(connection, task),
	}]));
}

export async function waitCodexMcp(rpc: Pick<JsonRpc, "request">, threadId: string, connections: McpConnection[], signal: AbortSignal) {
	const deadline = Date.now() + 30000;
	while (connections.length) {
		if (signal.aborted) throw new Error("MCP setup cancelled.");
		// Only the servers this task needs, each by name: an unfiltered list also probes every server in the person's own
		// Codex config, and one that isn't signed in makes it take 9–21 s. Each call may use the rest of the deadline.
		// Codex before 0.159 ignores serverName and returns the whole list a page at a time, so follow the cursor until the server shows up.
		const statuses = (await Promise.all(connections.map(async connection => {
			const serverName = nativeMcpName(connection); const seen = new Set<string>(); let cursor: string | null = null;
			do {
				const page: { data: { name: string; runtimeStatus: string | null; toolsError?: string | null }[]; nextCursor?: string | null } = await rpc.request("mcpServerStatus/list", { threadId, serverName, cursor, detail: "toolsAndAuthOnly" }, Math.max(1, deadline - Date.now()));
				const status = page.data.find(value => value.name === serverName); if (status) return [status];
				cursor = page.nextCursor ?? null;
				if (cursor && (seen.has(cursor) || seen.size >= 100)) throw new Error("Native MCP status pagination exceeded its limit."); if (cursor) seen.add(cursor);
			} while (cursor);
			return [];
		}))).flat();
		for (const connection of connections) { const status = statuses.find(value => value.name === nativeMcpName(connection)); if (["failed", "authenticationRequired", "cancelled", "disabled"].includes(status?.runtimeStatus ?? "") || status?.toolsError) throw new Error(`MCP server “${connection.name}” ${status?.runtimeStatus === "authenticationRequired" ? "needs native sign-in" : "could not connect"}.`); }
		if (connections.every(connection => statuses.find(value => value.name === nativeMcpName(connection))?.runtimeStatus === "connected")) return;
		if (Date.now() > deadline) throw new Error("MCP connections did not become ready within 30 seconds.");
		await delay(100, undefined, { signal });
	}
}
