import type { ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { commandEnvironment } from "./commandEnvironment";
import { resolveProjectPath } from "./projectFiles";
import { checkCommand, commandJobAssembly, commandShell, spawnCommand, STOP_DEADLINE_MS, stopCommandTree, wholeEnd, wholeStart, type CommandShell, type ShellName } from "./runProjectCommand";

export const BACKGROUND_LIMIT_PER_TASK = 8, BACKGROUND_LIMIT = 32;
/** Output kept per process; older output is dropped but offsets keep counting. */
export const BACKGROUND_OUTPUT_LIMIT = 1024 * 1024;
/** Default size of one read. */
export const BACKGROUND_READ_LIMIT = 32 * 1024;
/** Finished commands kept per task for reading, oldest dropped first. */
const FINISHED_KEPT = 8;

/** The latest output of a process, addressed by absolute byte offsets from its start. */
export class OutputRing {
	private readonly chunks: Buffer[] = []; private kept = 0;
	end = 0;
	constructor(private readonly limit = BACKGROUND_OUTPUT_LIMIT) {}
	get start() { return this.end - this.kept; }
	push(chunk: Buffer) {
		this.chunks.push(chunk); this.kept += chunk.length; this.end += chunk.length;
		while (this.chunks.length > 1 && this.kept - this.chunks[0].length >= this.limit) this.kept -= this.chunks.shift()!.length;
	}
	/** Bytes between two absolute offsets, clamped to what is kept. */
	slice(from: number, to: number) {
		const base = this.start;
		return Buffer.concat(this.chunks).subarray(Math.max(0, from - base), Math.max(0, Math.min(to, this.end) - base));
	}
}

type Entry = {
	id: string; taskId: string; command: string; directory: string; shell: ShellName; child: ChildProcess; pid: number;
	startedAt: number; exitedAt?: number; output: OutputRing; cursor: number; running: boolean; stopped: boolean; closed: Promise<void>;
};
export type BackgroundRead = { output: string; startOffset: number; nextOffset: number; omitted: number; running: boolean; exitCode: number | null; durationMs: number };
export type BackgroundSummary = { id: string; command: string; directory: string; pid: number; shell: ShellName; running: boolean; stopped: boolean; exitCode: number | null; durationMs: number; outputBytes: number };

/**
 * Long-running commands (dev servers, watchers) for the whole app, each owned by one task. A task sees and controls
 * only its own. Uses the same shell, environment and process-tree handling as `runProjectCommand`.
 */
export class BackgroundCommands {
	private readonly entries = new Map<string, Entry>();
	private closing = false;
	/** Called when one of a task's commands starts or ends, so its chat can show it. */
	onChange?: (taskId: string) => void;
	constructor(private readonly options: { env?: () => NodeJS.ProcessEnv; shell?: CommandShell; jobObject?: boolean } = {}) {}

	async start(taskId: string, root: string, command: string, directory = "."): Promise<{ id: string; pid: number; shell: ShellName }> {
		checkCommand(command);
		this.checkLimits(taskId);
		const cwd = await resolveProjectPath(root, directory);
		const env = this.options.env?.() ?? commandEnvironment(), shell = this.options.shell ?? commandShell(env);
		const job = this.options.jobObject === false ? undefined : await commandJobAssembly(shell);
		// Checked again: other starts may have finished while this one awaited.
		this.checkLimits(taskId);
		const child = spawnCommand(cwd, command, shell, env, job);
		await new Promise<void>((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
		const output = new OutputRing();
		let closed!: () => void;
		const entry: Entry = { id: this.newId(), taskId, command, directory, shell: shell.name, child, pid: child.pid!, startedAt: Date.now(), output, cursor: 0, running: true, stopped: false, closed: new Promise<void>(resolve => { closed = resolve; }) };
		for (const stream of [child.stdout!, child.stderr!]) stream.on("data", (chunk: Buffer) => output.push(chunk));
		child.on("error", () => undefined);
		child.once("exit", () => { entry.exitedAt = Date.now(); });
		// A process the shell left behind may still be writing; the command counts as running until the pipes close.
		child.once("close", () => { entry.running = false; entry.exitedAt ??= Date.now(); closed(); this.onChange?.(taskId); });
		this.entries.set(entry.id, entry);
		this.prune(taskId);
		this.onChange?.(taskId);
		return { id: entry.id, pid: entry.pid, shell: entry.shell };
	}

	/**
	 * Output from `since` (default: where the previous read stopped), at most `maxBytes`. Without `since`, a backlog
	 * larger than that skips to its latest part; `tail` instead returns the last lines.
	 */
	read(taskId: string, id: string, options: { since?: number; tail?: number; maxBytes?: number } = {}): BackgroundRead {
		const entry = this.entry(taskId, id), ring = entry.output, limit = options.maxBytes ?? BACKGROUND_READ_LIMIT;
		let from: number, to = ring.end, omitted = 0;
		if (options.tail !== undefined) from = Math.max(ring.start, to - limit);
		else {
			from = Math.min(options.since ?? entry.cursor, to);
			if (from < ring.start) { omitted = ring.start - from; from = ring.start; }
			if (to - from > limit) {
				if (options.since === undefined) { omitted += to - limit - from; from = to - limit; }
				else to = from + limit;
			}
		}
		const raw = ring.slice(from, to), start = wholeStart(raw), whole = wholeEnd(start);
		from += raw.length - start.length; to = from + whole.length;
		let output = whole.toString("utf8");
		if (options.tail !== undefined) {
			const lines = output.split(/(?<=\n)/), count = Math.max(0, Math.floor(options.tail));
			const kept = lines.length && lines.at(-1) === "" ? lines.slice(0, -1) : lines;
			const last = kept.slice(Math.max(0, kept.length - count)).join("");
			from = to - Buffer.byteLength(last); output = last;
		}
		entry.cursor = Math.max(entry.cursor, to);
		return { output, startOffset: from, nextOffset: to, omitted, running: entry.running, exitCode: entry.child.exitCode, durationMs: (entry.exitedAt ?? Date.now()) - entry.startedAt };
	}

	/** Resolves when the command's pipes close or after `ms`, whichever comes first. */
	async wait(taskId: string, id: string, ms: number) {
		const entry = this.entry(taskId, id);
		let timer: NodeJS.Timeout | undefined;
		await Promise.race([entry.closed, new Promise<void>(resolve => { timer = setTimeout(resolve, ms); })]);
		clearTimeout(timer);
	}

	/** Kills the command and everything it started. The output stays readable until the task's list is pruned. */
	async stop(taskId: string, id: string): Promise<BackgroundSummary> {
		const entry = this.entry(taskId, id);
		await this.kill(entry);
		return this.summary(entry);
	}

	/** The last lines of a command's output for the person, without moving the agent's read position. */
	peek(taskId: string, id: string, maxBytes = 4096) {
		const ring = this.entry(taskId, id).output, raw = ring.slice(Math.max(ring.start, ring.end - maxBytes), ring.end);
		return wholeEnd(wholeStart(raw)).toString("utf8");
	}

	list(taskId: string): BackgroundSummary[] { return [...this.entries.values()].filter(entry => entry.taskId === taskId).map(entry => this.summary(entry)); }

	/** Stops and forgets every command of a task, for a chat that is deleted or archived. */
	async stopTask(taskId: string) {
		const owned = [...this.entries.values()].filter(entry => entry.taskId === taskId);
		for (const entry of owned) this.entries.delete(entry.id);
		await Promise.all(owned.map(entry => this.kill(entry)));
	}

	/** Stops everything, for app quit; later starts are refused. */
	async closeAll() {
		this.closing = true;
		const all = [...this.entries.values()]; this.entries.clear();
		await Promise.all(all.map(entry => this.kill(entry)));
	}

	private async kill(entry: Entry) {
		if (!entry.running) return;
		entry.stopped = true;
		const delay = new Promise<void>(resolve => setTimeout(resolve, STOP_DEADLINE_MS).unref());
		await Promise.race([stopCommandTree(entry.child, entry.startedAt), delay]);
		// Whatever still holds the pipes can no longer keep the entry open.
		entry.child.stdout?.destroy(); entry.child.stderr?.destroy();
		await Promise.race([entry.closed, new Promise<void>(resolve => setTimeout(resolve, 1000).unref())]);
		entry.running = false; entry.exitedAt ??= Date.now();
		this.onChange?.(entry.taskId);
	}

	private summary(entry: Entry): BackgroundSummary {
		return { id: entry.id, command: entry.command, directory: entry.directory, pid: entry.pid, shell: entry.shell, running: entry.running, stopped: entry.stopped, exitCode: entry.child.exitCode, durationMs: (entry.exitedAt ?? Date.now()) - entry.startedAt, outputBytes: entry.output.end };
	}

	private entry(taskId: string, id: string) {
		const entry = typeof id === "string" ? this.entries.get(id) : undefined;
		if (!entry || entry.taskId !== taskId) throw new Error(`There is no background command with id ${JSON.stringify(id)} in this chat. Use list_background_commands to see the ids.`);
		return entry;
	}

	private checkLimits(taskId: string) {
		if (this.closing) throw new Error("The app is quitting, so background commands can't start.");
		const running = [...this.entries.values()].filter(entry => entry.running);
		if (running.filter(entry => entry.taskId === taskId).length >= BACKGROUND_LIMIT_PER_TASK) throw new Error(`This chat already has ${BACKGROUND_LIMIT_PER_TASK} background commands running. Stop one with stop_background_command first.`);
		if (running.length >= BACKGROUND_LIMIT) throw new Error(`${BACKGROUND_LIMIT} background commands are already running across all chats. Stop one with stop_background_command, or ask the user to stop some in other chats.`);
	}

	/** Drops the oldest finished commands of a task beyond the ones kept for reading. */
	private prune(taskId: string) {
		const finished = [...this.entries.values()].filter(entry => entry.taskId === taskId && !entry.running);
		for (const entry of finished.slice(0, Math.max(0, finished.length - FINISHED_KEPT))) this.entries.delete(entry.id);
	}

	private newId() {
		let id: string;
		do id = randomBytes(3).toString("hex"); while (this.entries.has(id));
		return id;
	}
}

let shared: BackgroundCommands | undefined;
/** The app's one set of background commands. */
export function backgroundCommands() { return shared ??= new BackgroundCommands(); }
/** Stops the shared set's commands, if it was ever created. */
export function closeBackgroundCommands() { return shared?.closeAll() ?? Promise.resolve(); }
