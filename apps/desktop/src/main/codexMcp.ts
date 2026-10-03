import { setTimeout as delay } from "node:timers/promises";
import type { Task } from "../shared/workspace";
import { nativeMcpName, type McpConnection } from "../shared/mcp";
import type { JsonRpc } from "./jsonRpc";

export function codexMcpConfig(connections: McpConnection[], task: Pick<Task, "projectId" | "mode">) {
	return Object.fromEntries(connections.map(connection => [`mcp_servers.${nativeMcpName(connection)}`, {
		...(connection.transport === "stdio" ? { command: connection.executable, args: connection.arguments, env: { ELECTRON_RUN_AS_NODE: "1" } } : { url: connection.url }),
		enabled: task.mode !== "chat" && connection.enabled && !connection.archived && (!connection.projectId || connection.projectId === task.projectId),
	}]));
}

export async function waitCodexMcp(rpc: Pick<JsonRpc, "request">, threadId: string, connections: McpConnection[], signal: AbortSignal) {
	const deadline = Date.now() + 30000;
	while (connections.length) {
		if (signal.aborted) throw new Error("MCP setup cancelled.");
		const statuses: { name: string; runtimeStatus: string | null; toolsError?: string | null }[] = []; let cursor: string | null = null; const seen = new Set<string>();
		do {
			const page: { data: typeof statuses; nextCursor: string | null } = await rpc.request("mcpServerStatus/list", { threadId, cursor, detail: "toolsAndAuthOnly", limit: 100 }, Math.max(1, Math.min(5000, deadline - Date.now())));
			statuses.push(...page.data); cursor = page.nextCursor;
			if (statuses.length > 10000 || (cursor && seen.has(cursor))) throw new Error("Native MCP status pagination exceeded its limit."); if (cursor) seen.add(cursor);
		} while (cursor);
		for (const connection of connections) { const status = statuses.find(value => value.name === nativeMcpName(connection)); if (["failed", "authenticationRequired", "cancelled", "disabled"].includes(status?.runtimeStatus ?? "") || status?.toolsError) throw new Error(`MCP server “${connection.name}” ${status?.runtimeStatus === "authenticationRequired" ? "needs native sign-in" : "could not connect"}.`); }
		if (connections.every(connection => statuses.find(value => value.name === nativeMcpName(connection))?.runtimeStatus === "connected")) return;
		if (Date.now() > deadline) throw new Error("MCP connections did not become ready within 30 seconds.");
		await delay(100, undefined, { signal });
	}
}
