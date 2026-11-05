import { execFile } from "node:child_process";
import { candidatePorts, listeningPorts, type Listener } from "./browserLocalServers";
import { readProcessTable, type ProcessRow } from "./terminalProcesses";
import type { ThreadServer } from "../shared/threadServers";

/** A process a chat started: one of its terminals' shells or a background command, with what to call it. */
export type ServerRoot = { pid: number; label: string };

/**
 * The local web servers a chat started: listening ports whose process descends from one of the chat's terminals or
 * background commands. A server is matched by its parent chain, never by its name, so Stop only reaches the chat's own.
 */
export function threadServersFrom(roots: readonly ServerRoot[], table: readonly ProcessRow[], listeners: readonly Listener[]): ThreadServer[] {
	const parents = new Map(table.map(row => [row.pid, row]));
	const owners = new Map(roots.map(root => [root.pid, root.label]));
	const servers: ThreadServer[] = [];
	for (const listener of candidatePorts([...listeners])) {
		if (!listener.pid) continue;
		// Bounded, because a reused PID can make the parent chain loop.
		let pid: number | undefined = listener.pid;
		for (let hops = 0; pid && hops < 64 && !owners.has(pid); hops++) pid = parents.get(pid)?.ppid;
		const label = pid ? owners.get(pid) : undefined;
		if (label === undefined) continue;
		servers.push({ port: listener.port, url: `http://localhost:${listener.port}/`, pid: listener.pid, ...(listener.process ? { process: listener.process } : {}), startedBy: label });
	}
	return servers;
}

export async function threadServers(roots: readonly ServerRoot[]) {
	if (!roots.length) return [];
	const [table, listeners] = await Promise.all([readProcessTable(), listeningPorts()]);
	return threadServersFrom(roots, table, listeners);
}

/** Every process under `pid`, deepest first, so a server's workers stop before it. */
export function descendants(table: readonly ProcessRow[], pid: number) {
	const children = new Map<number, number[]>();
	for (const row of table) if (row.pid !== row.ppid) children.set(row.ppid, [...children.get(row.ppid) ?? [], row.pid]);
	const found: number[] = [], queue = [pid], seen = new Set([pid]);
	while (queue.length) for (const child of children.get(queue.shift()!) ?? []) if (!seen.has(child)) { seen.add(child); found.push(child); queue.push(child); }
	return found.reverse();
}

const taskkill = (pid: number) => new Promise<void>((resolve, reject) => execFile("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, timeout: 10_000 }, error => error ? reject(error) : resolve()));

/**
 * Stops one of the chat's servers: the listening process and everything under it. The server is looked up again
 * first, so a port that changed hands since the list was read is left alone. The terminal or command that started it
 * keeps running.
 */
export async function stopThreadServer(roots: readonly ServerRoot[], port: number) {
	const server = (await threadServers(roots)).find(value => value.port === port);
	if (!server) throw new Error("That server is no longer running from this chat.");
	if (process.platform === "win32") { await taskkill(server.pid); return server; }
	const table = await readProcessTable();
	for (const pid of [...descendants(table, server.pid), server.pid]) { try { process.kill(pid, "SIGTERM"); } catch { /* Already gone. */ } }
	return server;
}
