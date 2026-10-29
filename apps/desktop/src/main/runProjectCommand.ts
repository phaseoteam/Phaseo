import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { commandEnvironment } from "./commandEnvironment";
import { queryProcesses, type ProcessSample } from "./diagnostics/processTable";
import { resolveProjectPath } from "./projectFiles";

export const COMMAND_TIMEOUT_MS = 120_000, MAX_COMMAND_TIMEOUT_MS = 600_000, MIN_COMMAND_TIMEOUT_MS = 1000;
/** Output kept in memory per command, as its start and end. */
export const COMMAND_OUTPUT_LIMIT = 1024 * 1024;
/** Windows rejects command lines over 32,767 characters, and Node's quoting adds to the script. */
const MAX_COMMAND_LENGTH = process.platform === "win32" ? 30_000 : 100_000;
/** After the shell exits, how long output may keep arriving before the pipes are closed. */
const EXIT_GRACE_MS = 500;
/** A stop resolves the call by then even if the processes could not be confirmed dead. */
export const STOP_DEADLINE_MS = 10_000;

export type ShellName = "pwsh" | "powershell" | "sh";
/** `job` is the helper assembly from `commandJobAssembly`, when there is one. */
export type CommandShell = { name: ShellName; file: string; args: (command: string, job?: string) => string[] };
export type CommandResult = { output: string; exitCode: number | null; durationMs: number; shell: ShellName; stopped?: string; truncated?: number };
/** `jobObject: false` skips the Windows job, leaving the process table to find what a command started. */
export type CommandOptions = { signal?: AbortSignal; timeoutMs?: number; env?: NodeJS.ProcessEnv; outputLimit?: number; shell?: CommandShell; jobObject?: boolean };

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
/**
 * PowerShell writes pipes in the OEM code page; this makes it UTF-8, and progress bars would only add CLIXML noise.
 * Each part may fail (Constrained Language Mode blocks both) without stopping the command.
 */
const powershellPrelude = (job?: string) => "try{[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);$OutputEncoding=[Console]::OutputEncoding;$ProgressPreference='SilentlyContinue'}catch{}"
	+ (job ? `;try{[void][Reflection.Assembly]::LoadFrom(${quote(job)});[void][PhaseoCommandJob]::Enter()}catch{}` : "");
/** `-Command` exits with only 0 or 1; this passes on the exit code of a native program that failed last. */
const POWERSHELL_EXIT = "if(-not $?){if($LASTEXITCODE){exit $LASTEXITCODE}exit 1}";
const powershell = (name: ShellName, file: string): CommandShell => ({ name, file, args: (command, job) => ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", `${powershellPrelude(job)}\n${command}\n${POWERSHELL_EXIT}`] });

const pwshByPath = new Map<string, string | undefined>();
function findPwsh(env: NodeJS.ProcessEnv) {
	const value = Object.entries(env).find(([name]) => name.toUpperCase() === "PATH")?.[1] ?? "";
	if (!pwshByPath.has(value)) pwshByPath.set(value, value.split(path.delimiter).filter(Boolean).map(directory => path.join(directory, "pwsh.exe")).find(candidate => existsSync(candidate)));
	return pwshByPath.get(value);
}
/** PowerShell 7 when it is on PATH, else Windows PowerShell 5.1; `/bin/sh` elsewhere. */
export function commandShell(env: NodeJS.ProcessEnv = process.env, platform = process.platform): CommandShell {
	if (platform !== "win32") return { name: "sh", file: "/bin/sh", args: command => ["-c", command] };
	const pwsh = findPwsh(env);
	return pwsh ? powershell("pwsh", pwsh) : powershell("powershell", "powershell.exe");
}

/**
 * Puts the PowerShell process in a new job object that kills its members when the shell's handle closes, so
 * everything a command starts dies with its shell, including daemons whose own parent has already exited (the
 * process table can't link those back). Breakaway stays allowed, so tools that ask for it still start.
 */
const JOB_SOURCE = `using System; using System.Runtime.InteropServices;
public static class PhaseoCommandJob {
	[StructLayout(LayoutKind.Sequential)] struct Basic { public long PerProcessUserTimeLimit, PerJobUserTimeLimit; public uint LimitFlags; public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize; public uint ActiveProcessLimit; public UIntPtr Affinity; public uint PriorityClass, SchedulingClass; }
	[StructLayout(LayoutKind.Sequential)] struct Io { public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount, ReadTransferCount, WriteTransferCount, OtherTransferCount; }
	[StructLayout(LayoutKind.Sequential)] struct Extended { public Basic BasicLimitInformation; public Io IoInfo; public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed; }
	[DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr CreateJobObjectW(IntPtr attributes, IntPtr name);
	[DllImport("kernel32.dll", SetLastError = true)] static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref Extended info, int length);
	[DllImport("kernel32.dll", SetLastError = true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
	[DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
	static IntPtr job;
	public static bool Enter() {
		job = CreateJobObjectW(IntPtr.Zero, IntPtr.Zero);
		if (job == IntPtr.Zero) return false;
		Extended info = new Extended(); info.BasicLimitInformation.LimitFlags = 0x2000 | 0x800;
		return SetInformationJobObject(job, 9, ref info, Marshal.SizeOf(typeof(Extended))) && AssignProcessToJobObject(job, GetCurrentProcess());
	}
}`;
const jobAssemblies = new Map<string, Promise<string | undefined>>();
/**
 * The job helper, compiled by the shell's own Add-Type once and cached in the temp folder by content.
 * Undefined off Windows or when it can't be built; commands then rely on the process table alone.
 */
export function commandJobAssembly(shell: CommandShell): Promise<string | undefined> {
	if (shell.name === "sh") return Promise.resolve(undefined);
	let pending = jobAssemblies.get(shell.file);
	if (!pending) { pending = buildJobAssembly(shell).catch(() => undefined); jobAssemblies.set(shell.file, pending); }
	return pending;
}
async function buildJobAssembly(shell: CommandShell) {
	const target = path.join(tmpdir(), `phaseo-command-job-${shell.name}-${createHash("sha256").update(JOB_SOURCE).digest("hex").slice(0, 12)}.dll`);
	if (existsSync(target)) return target;
	const temporary = `${target.slice(0, -4)}-${randomBytes(4).toString("hex")}.dll`;
	await new Promise<void>((resolve, reject) => { execFile(shell.file, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", `Add-Type -TypeDefinition ${quote(JOB_SOURCE)} -OutputAssembly ${quote(temporary)} -OutputType Library`], { windowsHide: true, timeout: 60_000 }, error => error ? reject(error) : resolve()); });
	// Another window may have built it meanwhile; both copies are the same.
	await rename(temporary, target).catch(async error => { await rm(temporary, { force: true }); if (!existsSync(target)) throw error; });
	return target;
}

/** Throws a message for the model when a command can't be run as given. */
export function checkCommand(command: unknown): asserts command is string {
	if (typeof command !== "string" || !command.trim()) throw new Error("The command is empty. Pass the shell command to run.");
	if (command.includes("\0")) throw new Error("The command contains a NUL character. Remove it and try again.");
	if (command.length > MAX_COMMAND_LENGTH) throw new Error(`The command is ${command.length.toLocaleString("en-GB")} characters long; the limit is ${MAX_COMMAND_LENGTH.toLocaleString("en-GB")}. Write a script file with write_project_file and run that instead.`);
}
export function commandTimeout(timeoutMs = COMMAND_TIMEOUT_MS) {
	if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs < MIN_COMMAND_TIMEOUT_MS || timeoutMs > MAX_COMMAND_TIMEOUT_MS) throw new Error(`The timeout must be between 1 and ${MAX_COMMAND_TIMEOUT_MS / 1000} seconds. Use start_background_command for servers, watchers and anything else that keeps running.`);
	return timeoutMs;
}

/** On Linux every process a command starts inherits this variable, which finds daemons that left its process group. */
const MARKER = "PHASEO_COMMAND_ID";
const markers = new WeakMap<ChildProcess, string>();
/** Detached on POSIX so the command's process group can be killed as one. */
export function spawnCommand(cwd: string, command: string, shell: CommandShell, env: NodeJS.ProcessEnv, job?: string): ChildProcess {
	const marker = process.platform === "linux" ? randomBytes(8).toString("hex") : undefined;
	const child = spawn(shell.file, shell.args(command, job), { cwd, env: marker ? { ...env, [MARKER]: marker } : env, windowsHide: true, shell: false, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
	if (marker) markers.set(child, marker);
	return child;
}

export const formatBytes = (bytes: number) => bytes < 1024 ? `${bytes} bytes` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const continuation = (byte: number) => (byte & 0xc0) === 0x80;
/** Bytes from the first whole UTF-8 character. */
export function wholeStart(buffer: Buffer) { let index = 0; while (index < 3 && index < buffer.length && continuation(buffer[index])) index++; return buffer.subarray(index); }
/** Bytes up to the last whole UTF-8 character. */
export function wholeEnd(buffer: Buffer) {
	for (let index = buffer.length - 1; index >= Math.max(0, buffer.length - 4); index--) {
		if (continuation(buffer[index])) continue;
		const byte = buffer[index], size = byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : byte >= 0xc0 ? 2 : 1;
		return index + size <= buffer.length ? buffer : buffer.subarray(0, index);
	}
	return buffer;
}

/** stdout and stderr in arrival order, keeping a quarter of the limit from the start and the rest from the end. */
export class CommandOutput {
	private readonly head: Buffer[] = []; private headBytes = 0;
	private readonly tail: Buffer[] = []; private tailBytes = 0;
	total = 0;
	constructor(private readonly limit = COMMAND_OUTPUT_LIMIT) {}
	private get headLimit() { return Math.floor(this.limit / 4); }
	push(chunk: Buffer) {
		this.total += chunk.length;
		const room = this.headLimit - this.headBytes;
		if (room > 0) { const part = chunk.subarray(0, room); this.head.push(part); this.headBytes += part.length; chunk = chunk.subarray(part.length); }
		if (!chunk.length) return;
		this.tail.push(chunk); this.tailBytes += chunk.length;
		while (this.tail.length > 1 && this.tailBytes - this.tail[0].length >= this.limit - this.headLimit) this.tailBytes -= this.tail.shift()!.length;
	}
	/** The output as text, with a marker where the middle was dropped, and how many bytes that was. */
	text(): { text: string; omitted: number } {
		const head = Buffer.concat(this.head), keep = this.limit - this.headLimit;
		let tail = Buffer.concat(this.tail);
		if (tail.length > keep) tail = tail.subarray(tail.length - keep);
		if (head.length + tail.length >= this.total) return { text: Buffer.concat([head, tail]).toString("utf8"), omitted: 0 };
		const start = wholeEnd(head), end = wholeStart(tail), omitted = this.total - start.length - end.length;
		return { text: `${start.toString("utf8")}\n[… ${formatBytes(omitted)} omitted …]\n${end.toString("utf8")}`, omitted };
	}
}

/**
 * Every process below `rootPid` that started after the command did. Windows keeps a dead parent's PID as
 * ParentProcessId, so orphans whose shell already exited are still found. Start times guard against PID reuse.
 */
export function commandDescendants(rows: ProcessSample[], rootPid: number, startedAt: number): ProcessSample[] {
	const children = new Map<number, ProcessSample[]>();
	for (const row of rows) if (row.pid !== row.ppid) children.set(row.ppid, [...children.get(row.ppid) ?? [], row]);
	// A process holding the root's PID that started well after the command is a later process reusing it: its children aren't ours.
	const reused = rows.find(row => row.pid === rootPid && row.startTimeMs > startedAt + 5000);
	const found: ProcessSample[] = [], seen = new Set([rootPid, process.pid]);
	// `ps` reports start times to the second, hence the slack.
	const visit = (pid: number, from: number, until: number) => {
		for (const row of children.get(pid) ?? []) {
			if (seen.has(row.pid) || !row.startTimeMs || row.startTimeMs < from || row.startTimeMs >= until) continue;
			seen.add(row.pid); found.push(row); visit(row.pid, row.startTimeMs - 2000, Infinity);
		}
	};
	visit(rootPid, startedAt - 2000, reused?.startTimeMs ?? Infinity);
	return found;
}

/** Linux processes whose environment carries the command's marker. */
async function markedProcesses(marker: string) {
	const needle = `${MARKER}=${marker}\0`;
	const pids = (await readdir("/proc").catch(() => [] as string[])).filter(name => /^\d+$/.test(name) && Number(name) !== process.pid);
	const matches = await Promise.all(pids.map(async pid => (await readFile(`/proc/${pid}/environ`, "latin1").catch(() => "")).includes(needle) ? Number(pid) : 0));
	return matches.filter(Boolean);
}

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const isRunning = (child: ChildProcess) => child.exitCode === null && child.signalCode === null;
const taskkill = (pid: number) => new Promise<void>(resolve => { execFile("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, timeout: 5000 }, () => resolve()); });
const signal = (pid: number) => { try { process.kill(pid, "SIGKILL"); return true; } catch { return false; } };
/** Stops running together (app quit) share one query: on Windows each one starts PowerShell. */
let pendingSnapshot: Promise<ProcessSample[] | undefined> | undefined;
const snapshot = () => pendingSnapshot ??= Promise.race([queryProcesses(), delay(8000).then(() => undefined)]).catch(() => undefined).finally(() => { pendingSnapshot = undefined; });

/**
 * Kills a command's shell and everything it started, orphans included, then reads the process table again until
 * nothing is left (three rounds at most). Resolves with how many descendants it found; never rejects.
 */
export async function stopCommandTree(child: ChildProcess, startedAt: number): Promise<number> {
	const pid = child.pid, marker = markers.get(child);
	if (!pid) return 0;
	let found = 0;
	for (let round = 0; round < 3; round++) {
		// The shell's PID is only used while it runs: once it has exited, the PID may belong to someone else.
		const tree = round === 0 && process.platform === "win32" && isRunning(child) ? taskkill(pid) : undefined;
		const [rows, marked] = await Promise.all([snapshot(), marker ? markedProcesses(marker) : []]);
		if (process.platform !== "win32") { signal(-pid); if (isRunning(child)) signal(pid); }
		await tree;
		const left = new Set([...rows ? commandDescendants(rows, pid, startedAt).map(row => row.pid) : [], ...marked]);
		found += left.size;
		for (const descendant of left) signal(descendant);
		if (!left.size || (!rows && !marker)) break;
		await delay(150);
	}
	if (isRunning(child)) child.kill("SIGKILL");
	return found;
}

/**
 * Runs one command in a project folder and resolves once its shell has exited. Output still arriving after that is
 * read for a short grace period; if something the command started still holds the pipes then, it is stopped, so a
 * stray server or daemon can't keep the call open. Timeouts and cancellation stop the whole process tree.
 */
export async function runProjectCommand(root: string, command: string, directory: string, options: CommandOptions = {}): Promise<CommandResult> {
	const timeoutMs = commandTimeout(options.timeoutMs); checkCommand(command);
	const cwd = await resolveProjectPath(root, directory);
	const env = options.env ?? commandEnvironment(), shell = options.shell ?? commandShell(env), job = options.jobObject === false ? undefined : await commandJobAssembly(shell);
	if (options.signal?.aborted) throw new Error("Command cancelled.");
	return new Promise<CommandResult>((resolve, reject) => {
		const startedAt = Date.now(), child = spawnCommand(cwd, command, shell, env, job), output = new CommandOutput(options.outputLimit);
		const streams = [child.stdout!, child.stderr!];
		let stopped: string | undefined, stopping = false, finished = false, exitedAt: number | undefined, grace: NodeJS.Timeout | undefined;
		for (const stream of streams) stream.on("data", (chunk: Buffer) => output.push(chunk));
		const finish = () => {
			if (finished) return; finished = true; cleanup();
			for (const stream of streams) stream.destroy();
			const { text, omitted } = output.text();
			resolve({ output: text, exitCode: child.exitCode, durationMs: (exitedAt ?? Date.now()) - startedAt, shell: shell.name, ...(stopped ? { stopped } : {}), ...(omitted ? { truncated: omitted } : {}) });
		};
		const stop = (reason: string) => {
			if (stopping || finished) return; stopping = true; stopped = reason;
			// Resolves once the tree is dead or by the deadline: a process that can't be killed must not hang the agent.
			void Promise.race([stopCommandTree(child, startedAt), delay(STOP_DEADLINE_MS)]).then(finish, finish);
		};
		const timer = setTimeout(() => stop(`The command exceeded its ${Math.round(timeoutMs / 1000)} s timeout and was stopped.`), timeoutMs);
		const abort = () => stop("Command cancelled.");
		const cleanup = () => { clearTimeout(timer); clearTimeout(grace); options.signal?.removeEventListener("abort", abort); };
		options.signal?.addEventListener("abort", abort, { once: true });
		child.once("error", error => { if (!child.pid && !finished) { finished = true; cleanup(); reject(error); } });
		child.once("exit", () => {
			exitedAt = Date.now();
			if (!stopping) grace = setTimeout(() => {
				if (streams.every(stream => stream.readableEnded)) return finish();
				stop("The command exited but left processes running that held its output; they were stopped. Use start_background_command for servers, watchers and other long-running processes.");
			}, EXIT_GRACE_MS);
		});
		// Every holder of the pipes has closed them: nothing the command started is still writing.
		child.once("close", () => { if (!stopping) finish(); });
	});
}
