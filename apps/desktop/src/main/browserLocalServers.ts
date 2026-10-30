import { execFile } from "node:child_process";
import http from "node:http";
import https from "node:https";
import type { BrowserLocalServer } from "../shared/browser";

type Listener = { host: string; port: number; pid?: number; process?: string };
const loopback = new Set(["127.0.0.1", "0.0.0.0", "::", "::1", "*", "localhost"]);
// Windows and macOS services that listen locally but are never a web page.
const ignoredPorts = new Set([135, 139, 445, 5040, 5357, 7680]);

/** Listening TCP ports on this computer from `netstat -ano -p TCP` (Windows) output. */
export function parseNetstat(output: string): Listener[] {
	const listeners: Listener[] = [];
	for (const line of output.split(/\r?\n/)) {
		const match = /^\s*TCP\s+(\S+):(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i.exec(line);
		if (!match) continue;
		const host = match[1].replace(/^\[|\]$/g, "");
		if (loopback.has(host)) listeners.push({ host, port: Number(match[2]), pid: Number(match[3]) });
	}
	return listeners;
}

/** Process names by id from `tasklist /fo csv /nh` output. */
export function parseTasklist(output: string): Map<number, string> {
	const names = new Map<number, string>();
	for (const line of output.split(/\r?\n/)) {
		const match = /^"([^"]+)","(\d+)"/.exec(line.trim());
		if (match) names.set(Number(match[2]), match[1].replace(/\.exe$/i, ""));
	}
	return names;
}

/** Listening TCP ports with their process from `lsof -nP -iTCP -sTCP:LISTEN -F pcn` (macOS, Linux) output. */
export function parseLsof(output: string): Listener[] {
	const listeners: Listener[] = [];
	let pid: number | undefined, command: string | undefined;
	for (const line of output.split(/\r?\n/)) {
		if (line.startsWith("p")) { pid = Number(line.slice(1)); command = undefined; }
		else if (line.startsWith("c")) command = line.slice(1);
		else if (line.startsWith("n")) {
			const match = /^(.*):(\d+)$/.exec(line.slice(1));
			if (!match) continue;
			const host = match[1].replace(/^\[|\]$/g, "");
			if (loopback.has(host)) listeners.push({ host, port: Number(match[2]), pid, process: command });
		}
	}
	return listeners;
}

/** One entry per port, web ports only, lowest port first. */
export function candidatePorts(listeners: Listener[]): Listener[] {
	const byPort = new Map<number, Listener>();
	for (const listener of listeners) if (listener.port > 0 && listener.port < 49152 && !ignoredPorts.has(listener.port) && !byPort.has(listener.port)) byPort.set(listener.port, listener);
	return [...byPort.values()].sort((a, b) => a.port - b.port).slice(0, 40);
}

const run = (file: string, args: string[]) => new Promise<string>(resolve => execFile(file, args, { timeout: 4000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (_error, stdout) => resolve(String(stdout ?? ""))));

/** True when the port answers HTTP with something a browser can show. */
function probe(port: number, host: string): Promise<boolean> {
	return new Promise(resolve => {
		const request = http.get({ host: host === "::1" || host === "::" ? "::1" : "127.0.0.1", port, path: "/", timeout: 700, headers: { accept: "text/html,*/*" } }, response => {
			const type = String(response.headers["content-type"] ?? "");
			const status = response.statusCode ?? 0;
			response.resume();
			resolve(status > 0 && status < 500 && (status < 400 || type.includes("html")));
		});
		request.on("timeout", () => { request.destroy(); resolve(false); });
		request.on("error", () => resolve(false));
	});
}

let cache: { at: number; servers: Promise<BrowserLocalServer[]> } | undefined;
/** Local web servers a browser tab can open, scanned at most every few seconds. */
export function localServers(): Promise<BrowserLocalServer[]> {
	if (cache && Date.now() - cache.at < 4000) return cache.servers;
	const servers = (async () => {
		let listeners: Listener[];
		if (process.platform === "win32") {
			const [netstat, tasks] = await Promise.all([run("netstat", ["-ano", "-p", "TCP"]), run("tasklist", ["/fo", "csv", "/nh"])]);
			const names = parseTasklist(tasks);
			listeners = parseNetstat(netstat).map(listener => ({ ...listener, process: listener.pid ? names.get(listener.pid) : undefined }));
		} else listeners = parseLsof(await run("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-F", "pcn"]));
		const candidates = candidatePorts(listeners);
		const ready = await Promise.all(candidates.map(candidate => probe(candidate.port, candidate.host)));
		return candidates.filter((_, index) => ready[index]).map(candidate => ({ url: `http://localhost:${candidate.port}/`, host: "localhost", port: candidate.port, ...(candidate.process ? { process: candidate.process } : {}) }));
	})();
	cache = { at: Date.now(), servers };
	return servers;
}

/** True once a local address answers HTTP at all, so an action's preview opens when its server is up. */
export function probeAddress(address: string): Promise<boolean> {
	return new Promise(resolve => {
		const url = new URL(address);
		const options = { host: url.hostname.replace(/^\[|\]$/g, "") === "localhost" ? "localhost" : url.hostname.replace(/^\[|\]$/g, ""), port: url.port || (url.protocol === "https:" ? 443 : 80), path: url.pathname + url.search, timeout: 1500, headers: { accept: "text/html,*/*" } };
		// A local dev server's certificate is usually self-signed and only whether it answers matters here, so a loopback
		// address skips the check; anything else must present a valid one.
		const loopback = ["localhost", "127.0.0.1", "::1"].includes(options.host);
		const request = url.protocol === "https:" ? https.get({ ...options, rejectUnauthorized: !loopback }, response => { response.resume(); resolve(true); }) : http.get(options, response => { response.resume(); resolve(true); });
		request.on("timeout", () => { request.destroy(); resolve(false); });
		request.on("error", () => resolve(false));
	});
}
