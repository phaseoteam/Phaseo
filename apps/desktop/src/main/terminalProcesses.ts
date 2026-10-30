import { execFile } from "node:child_process";
import { existsSync } from "node:fs";

/** One row of the system process table. */
export type ProcessRow = { pid: number; ppid: number; name: string };

/** `ps -eo pid=,ppid=,comm=` output. */
export function parsePosixProcessTable(text: string): ProcessRow[] {
	return text.split(/\r?\n/).flatMap(line => {
		const match = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
		return match ? [{ pid: Number(match[1]), ppid: Number(match[2]), name: match[3].trim() }] : [];
	});
}

/** "pid|ppid|name" lines, as the Windows query below prints them. */
export function parseWindowsProcessTable(text: string): ProcessRow[] {
	return text.split(/\r?\n/).flatMap(line => {
		const [pid, ppid, name = ""] = line.trim().split("|", 3);
		return /^\d+$/.test(pid ?? "") && /^\d+$/.test(ppid ?? "") && Number(pid) > 0 ? [{ pid: Number(pid), ppid: Number(ppid), name }] : [];
	});
}

const commandName = (name: string) => name.trim().replace(/^.*[\\/]/, "").replace(/\.exe$/i, "").replace(/^-/, "").toLowerCase();
// Console hosts belong to the terminal, not to anything the person ran.
const consoleHosts = new Set(["conhost", "openconsole"]);

/**
 * Whether a terminal's shell is running a command, after T3's terminal manager: any child of the shell counts,
 * except a copy of the shell with no children of its own (async prompt themes fork one) and console hosts.
 */
export function shellIsBusy(rows: readonly ProcessRow[], shellPid: number) {
	const children = new Map<number, ProcessRow[]>();
	for (const row of rows) children.set(row.ppid, [...children.get(row.ppid) ?? [], row]);
	const shell = rows.find(row => row.pid === shellPid);
	const shellName = shell ? commandName(shell.name) : undefined;
	return (children.get(shellPid) ?? []).some(child => {
		const name = commandName(child.name);
		if (consoleHosts.has(name)) return false;
		return name !== shellName || (children.get(child.pid)?.length ?? 0) > 0;
	});
}

function run(command: string, args: string[], timeout: number) {
	return new Promise<string>((resolve, reject) => {
		execFile(command, args, { timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => { if (error) reject(error); else resolve(stdout); });
	});
}

/**
 * The system process table, read once per check. Throws when it cannot be read in full, so a caller
 * that cannot tell whether a terminal is busy keeps it.
 */
export async function readProcessTable(platform = process.platform): Promise<ProcessRow[]> {
	const rows = platform === "win32"
		? parseWindowsProcessTable(await run("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "Get-CimInstance Win32_Process -ErrorAction Stop | ForEach-Object { \"$($_.ProcessId)|$($_.ParentProcessId)|$($_.Name)\" }"], 5_000))
		: parsePosixProcessTable(await run(["/bin/ps", "/usr/bin/ps"].find(candidate => existsSync(candidate)) ?? "ps", ["-eo", "pid=,ppid=,comm="], 2_000));
	if (!rows.length) throw new Error("The process table was empty.");
	return rows;
}
