import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import type { DiagnosticsProcess, DiagnosticsProcessKind } from "../../shared/diagnostics";

/** One process from the system table, with cumulative CPU time where the platform reports it. */
export type ProcessSample = { pid: number; ppid: number; name: string; command: string; startTimeMs: number; rssBytes: number; elapsedMs: number; cpuTimeMs?: number; cpuPercent?: number };

const WINDOWS_QUERY = "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-CimInstance Win32_Process -ErrorAction Stop | ForEach-Object { [pscustomobject]@{ p=$_.ProcessId; pp=$_.ParentProcessId; n=$_.Name; c=$_.CommandLine; s=$(if ($_.CreationDate) { ([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds() } else { 0 }); w=$_.WorkingSetSize; k=$_.KernelModeTime; u=$_.UserModeTime } } | ConvertTo-Json -Compress";

/** `Get-CimInstance Win32_Process` as the compact JSON the query above prints. CPU times are in 100 ns units. */
export function parseWindowsProcesses(json: string, now = Date.now()): ProcessSample[] {
	const trimmed = json.trim();
	if (!trimmed) return [];
	const parsed = JSON.parse(trimmed) as unknown;
	const rows = Array.isArray(parsed) ? parsed : [parsed];
	return rows.flatMap(raw => {
		if (!raw || typeof raw !== "object") return [];
		const row = raw as Record<string, unknown>;
		const pid = Number(row.p), ppid = Number(row.pp), start = Number(row.s);
		if (!Number.isSafeInteger(pid) || pid <= 0 || !Number.isSafeInteger(ppid)) return [];
		const name = typeof row.n === "string" ? row.n : "", command = typeof row.c === "string" && row.c.trim() ? row.c : name;
		const cpu = (Number(row.k) || 0) + (Number(row.u) || 0);
		return [{ pid, ppid, name, command, startTimeMs: Number.isFinite(start) ? start : 0, rssBytes: Number(row.w) || 0, elapsedMs: start > 0 ? Math.max(0, now - start) : 0, cpuTimeMs: cpu / 10_000 }];
	});
}

/** `[[dd-]hh:]mm:ss[.cc]` as `ps` prints elapsed and CPU time. */
export function parseClock(value: string): number | undefined {
	const match = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/.exec(value.trim());
	if (!match) return undefined;
	const [, days = "0", hours = "0", minutes, seconds] = match;
	return ((Number(days) * 24 + Number(hours)) * 60 + Number(minutes)) * 60_000 + Number(seconds) * 1000;
}

/**
 * `ps -A -o pid=,ppid=,pcpu=,rss=,etime=,time=,lstart=,args=` in the C locale: `lstart` is five words
 * ("Thu Oct 16 10:00:00 2026") and `args` the rest of the line. `etime` and `time` work on macOS and Linux alike.
 */
export function parsePosixProcesses(text: string): ProcessSample[] {
	return text.split(/\r?\n/).flatMap(line => {
		const parts = line.trim().split(/\s+/);
		if (parts.length < 11) return [];
		const [pid, ppid, pcpu, rss, etime, time, ...rest] = parts;
		const started = Date.parse(rest.slice(0, 5).join(" ")), command = rest.slice(5).join(" ");
		if (!/^\d+$/.test(pid) || !/^\d+$/.test(ppid)) return [];
		const elapsedMs = parseClock(etime) ?? 0, cpuTimeMs = parseClock(time);
		const name = command.split(/\s+/)[0]?.replace(/^.*\//, "") || command;
		return [{ pid: Number(pid), ppid: Number(ppid), name, command, startTimeMs: Number.isFinite(started) ? started : 0, rssBytes: (Number(rss) || 0) * 1024, elapsedMs, ...(cpuTimeMs !== undefined ? { cpuTimeMs } : {}), cpuPercent: Number(pcpu) || 0 }];
	});
}

function run(command: string, args: string[], timeout: number, env?: NodeJS.ProcessEnv) {
	return new Promise<string>((resolve, reject) => {
		execFile(command, args, { timeout, windowsHide: true, maxBuffer: 32 * 1024 * 1024, ...(env ? { env } : {}) }, (error, stdout) => { if (error) reject(error); else resolve(stdout); });
	});
}

/** The whole system process table, once: one PowerShell CIM query on Windows, one `ps` elsewhere. */
export async function queryProcesses(platform = process.platform): Promise<ProcessSample[]> {
	if (platform === "win32") return parseWindowsProcesses(await run("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", WINDOWS_QUERY], 15_000));
	const ps = ["/bin/ps", "/usr/bin/ps"].find(candidate => existsSync(candidate)) ?? "ps";
	return parsePosixProcesses(await run(ps, ["-A", "-o", "pid=,ppid=,pcpu=,rss=,etime=,time=,lstart=,args="], 10_000, { ...process.env, LC_ALL: "C" }));
}

export const processKey = (pid: number, startTimeMs: number) => `${pid}:${startTimeMs}`;

/** What the app knows about a process it started, by PID. */
export type ProcessOwner = { label: string; kind?: DiagnosticsProcessKind };

export function processKind(command: string, name: string): DiagnosticsProcessKind {
	const head = `${name} ${command}`.toLowerCase(), base = name.toLowerCase().replace(/\.exe$/, "");
	if (/\b(codex|claude|opencode|cursor-agent|grok|gemini)\b|@openai[\\/]codex|@anthropic-ai[\\/]claude-code/.test(head)) return "agent";
	if (base === "git" || base === "gh") return "git";
	if (/\bmcp\b|mcp-server|modelcontextprotocol/.test(head)) return "mcp";
	if (/^(pwsh|powershell|cmd|bash|zsh|fish|sh|nu|wsl)$/.test(base)) return "terminal";
	return "process";
}

/**
 * The tree below `rootPid`, depth first, with CPU % from the change in CPU time since the previous sample (per core,
 * as `ps` counts it). A process seen for the first time uses its lifetime average.
 */
export function buildProcessTree(rows: ProcessSample[], rootPid: number, options: {
	previous?: Map<string, { cpuTimeMs: number; at: number }>; now: number;
	electron?: Map<number, { kind: DiagnosticsProcessKind; label: string }>; owners?: Map<number, ProcessOwner>;
}): DiagnosticsProcess[] {
	const byPid = new Map(rows.map(row => [row.pid, row]));
	const children = new Map<number, ProcessSample[]>();
	for (const row of rows) if (row.pid !== row.ppid) children.set(row.ppid, [...children.get(row.ppid) ?? [], row]);
	const root = byPid.get(rootPid);
	if (!root) return [];
	const result: DiagnosticsProcess[] = [], seen = new Set<number>();
	const visit = (row: ProcessSample, depth: number, inherited?: string) => {
		if (seen.has(row.pid) || depth > 64) return; seen.add(row.pid);
		const previous = options.previous?.get(processKey(row.pid, row.startTimeMs));
		const cpuPercent = row.cpuTimeMs !== undefined && previous && options.now > previous.at ? Math.max(0, (row.cpuTimeMs - previous.cpuTimeMs) / (options.now - previous.at) * 100)
			: row.cpuPercent ?? (row.cpuTimeMs !== undefined && row.elapsedMs > 0 ? row.cpuTimeMs / row.elapsedMs * 100 : 0);
		const electron = options.electron?.get(row.pid), owner = options.owners?.get(row.pid);
		// A child that started before its parent belongs to an earlier process that had the same PID.
		const kids = (children.get(row.pid) ?? []).filter(child => !child.startTimeMs || !row.startTimeMs || child.startTimeMs + 1000 >= row.startTimeMs).sort((left, right) => left.startTimeMs - right.startTimeMs || left.pid - right.pid);
		const kind: DiagnosticsProcessKind = depth === 0 ? "main" : electron?.kind ?? owner?.kind ?? processKind(row.command, row.name);
		const label = depth === 0 ? "Phaseo main process" : electron?.label ?? owner?.label ?? inherited;
		result.push({ pid: row.pid, ppid: row.ppid, startTimeMs: row.startTimeMs, name: row.name, command: row.command.slice(0, 2000), ...(label ? { label } : {}), kind, cpuPercent: Math.round(cpuPercent * 10) / 10, rssBytes: row.rssBytes, elapsedMs: row.elapsedMs, depth, childPids: kids.map(child => child.pid), stoppable: depth > 0 && !electron });
		// A terminal's helpers and the commands run in it say whose they are.
		const passOn = owner?.label ?? (depth === 0 ? undefined : inherited);
		for (const child of kids) visit(child, depth + 1, passOn);
	};
	visit(root, 0);
	return result;
}
