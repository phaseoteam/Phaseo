import type { Query } from "@anthropic-ai/claude-agent-sdk";
import { setTimeout as delay } from "node:timers/promises";
import { nativeMcpName, type McpConnection } from "../shared/mcp";

export async function waitClaudeMcp(query: Pick<Query, "mcpServerStatus">, connections: McpConnection[], signal: AbortSignal) {
	const deadline = Date.now() + 30000;
	while (connections.length) {
		if (signal.aborted) throw new Error("MCP setup cancelled.");
		let abort!: () => void;
		const timeout = AbortSignal.any([signal, AbortSignal.timeout(Math.max(1, deadline - Date.now()))]);
		try {
			const statuses = await Promise.race([query.mcpServerStatus(), new Promise<never>((_resolve, reject) => { abort = () => reject(new Error("MCP setup cancelled or timed out.")); timeout.addEventListener("abort", abort, { once: true }); if (timeout.aborted) abort(); })]);
			for (const connection of connections) { const status = statuses.find(value => value.name === nativeMcpName(connection))?.status; if (status === "failed" || status === "needs-auth") throw new Error(`MCP server “${connection.name}” ${status === "needs-auth" ? "needs native sign-in" : "could not connect"}.`); }
			if (connections.every(connection => statuses.find(value => value.name === nativeMcpName(connection))?.status === "connected")) return;
		} finally { timeout.removeEventListener("abort", abort); }
		if (Date.now() > deadline) throw new Error("MCP connections did not become ready within 30 seconds.");
		await delay(100, undefined, { signal });
	}
}
