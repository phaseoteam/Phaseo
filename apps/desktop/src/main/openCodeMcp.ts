import { realpath } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import type { OpenCodeClient } from "@opencode/client";
import { nativeMcpName, type McpConnection } from "../shared/mcp";

export class OpenCodeMcp {
	private readonly pending = new Map<string, Promise<void>>();
	private readonly applied = new Map<string, Map<string, string>>();
	async synchronize(client: OpenCodeClient, endpoint: string, cwd: string, projectId: string | undefined, connections: McpConnection[], signal: AbortSignal) {
		if (!connections.length) return;
		const directory = await realpath(cwd); const key = `${endpoint}|${process.platform === "win32" ? directory.toLowerCase() : directory}`;
		const previous = this.pending.get(key); const execution = (previous ?? Promise.resolve()).catch(() => {}).then(() => this.apply(client, key, directory, projectId, connections, signal));
		this.pending.set(key, execution);
		try { await execution; } finally { if (this.pending.get(key) === execution) this.pending.delete(key); }
	}
	private async apply(client: OpenCodeClient, key: string, directory: string, projectId: string | undefined, connections: McpConnection[], signal: AbortSignal) {
		if (signal.aborted) throw new Error("MCP setup cancelled.");
		const options = { signal }; const location = { directory }; const cached = this.applied.get(key) ?? new Map<string, string>(); this.applied.set(key, cached);
		let servers = (await client.mcp.list({ location }, options)).data;
		for (const connection of connections) {
			const server = nativeMcpName(connection); const existing = servers.find(value => value.name === server);
			if (!connection.enabled || connection.archived || (connection.projectId && connection.projectId !== projectId)) { if (existing) await client.mcp.remove({ location, server }, options); cached.delete(server); continue; }
			const config = connection.transport === "stdio" ? { type: "local" as const, command: [connection.executable, ...connection.arguments], cwd: directory, environment: { ELECTRON_RUN_AS_NODE: "1" } } : { type: "remote" as const, url: connection.url };
			const signature = JSON.stringify(config);
			if (!existing || cached.get(server) !== signature) { await client.mcp.add({ location, server, config }, options); cached.set(server, signature); }
			else if (existing.status.status === "disabled" || existing.status.status === "failed") await client.mcp.connect({ location, server }, options);
		}
		const wanted = connections.filter(value => value.enabled && !value.archived && (!value.projectId || value.projectId === projectId)); const deadline = Date.now() + 30000;
		while (wanted.length) {
			servers = (await client.mcp.list({ location }, options)).data;
			for (const connection of wanted) { const status = servers.find(value => value.name === nativeMcpName(connection))?.status.status; if (status === "failed" || status === "needs_auth") throw new Error(`MCP server “${connection.name}” ${status === "needs_auth" ? "needs native sign-in" : "could not connect"}.`); }
			if (wanted.every(connection => servers.find(value => value.name === nativeMcpName(connection))?.status.status === "connected")) return;
			if (Date.now() > deadline) throw new Error("MCP connections did not become ready within 30 seconds.");
			await delay(100, undefined, { signal });
		}
	}
}
