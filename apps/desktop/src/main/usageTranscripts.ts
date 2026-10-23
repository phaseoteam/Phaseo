import { closeSync, createReadStream, existsSync, openSync, readdirSync, readSync, statSync } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Worker, type MessagePort } from "node:worker_threads";
import { createZstdDecompress, zstdDecompressSync } from "node:zlib";
import os from "node:os";
import path from "node:path";
import { claudeUsage, codexResponseUsage } from "./harnessUsage";
import type { HarnessUsage } from "../shared/usageLedger";
import type { ScanWriter, SessionOwners } from "./usageLedgerWrites";
import type { Account, Project } from "../shared/workspace";

/** A folder of transcripts: Claude Code's config folder (its `projects`) or a Codex home (its `sessions`). */
export type TranscriptFolder = { harness: "claude" | "codex"; directory: string; added?: boolean };
/** One response read from a transcript, with where and when it ran. */
export type TranscriptUsage = HarnessUsage & { at: string; harness: "claude" | "codex"; sessionId: string; cwd?: string };
/** What a file's reader carries between reads: Codex names the session and model once, ahead of the usage lines. */
export type TranscriptState = { sessionId?: string; cwd?: string; model?: string; /** The session a Codex fork's chain started from. */ root?: string };
/**
 * Codex forks (subagents, and threads forked from others) copy their parent's usage lines into their own file. Keying
 * every response by the chain's first session makes a copy the same response as its original. The store remembers each
 * session's root, so a fork of a fork resolves to the same one.
 */
export type ThreadRoots = { rootOf(id: string): string | undefined; remember(id: string, root: string): void };
export type TranscriptFile = { size: number; mtimeMs: number; offset: number; state: TranscriptState };

/**
 * Where Claude Code and Codex keep transcripts on this computer: their default folders, the folders the environment
 * points them at, each account's own folder, and any the person added. Like T3 Code's Usage page, history comes from
 * these files, so it covers sessions run anywhere, not only in Phaseo.
 */
export function transcriptFolders(accounts: readonly Account[], added: readonly TranscriptFolder[], env: NodeJS.ProcessEnv = process.env, home = os.homedir()): TranscriptFolder[] {
	const folders: TranscriptFolder[] = [
		{ harness: "claude", directory: path.join(home, ".claude") }, { harness: "codex", directory: path.join(home, ".codex") },
		...env.CLAUDE_CONFIG_DIR ? [{ harness: "claude" as const, directory: env.CLAUDE_CONFIG_DIR }] : [],
		...env.CODEX_HOME ? [{ harness: "codex" as const, directory: env.CODEX_HOME }] : [],
		...accounts.flatMap(account => account.kind === "native" && account.configDirectory && (account.harness === "claude" || account.harness === "codex") ? [{ harness: account.harness, directory: account.configDirectory }] : []),
		...added.map(folder => ({ ...folder, added: true })),
	];
	const seen = new Set<string>();
	return folders.filter(folder => { const key = `${folder.harness}:${path.resolve(folder.directory).toLowerCase()}`; if (seen.has(key)) return false; seen.add(key); return true; });
}

/** The transcript files under a folder changed within `days`, newest last. Missing folders have none. */
export async function transcriptFiles(folder: TranscriptFolder, days = 91, now = Date.now()): Promise<{ path: string; size: number; mtimeMs: number }[]> {
	const roots = folder.harness === "claude" ? [path.join(folder.directory, "projects")] : [path.join(folder.directory, "sessions"), path.join(folder.directory, "archived_sessions")];
	const found: { path: string; size: number; mtimeMs: number }[] = [];
	// A folder at a time, synchronously, yielding between: on Windows an awaited stat per file took twenty times as long.
	const walk = async (directory: string, depth: number): Promise<void> => {
		let entries;
		try { entries = readdirSync(directory, { withFileTypes: true }); } catch { return; }
		const folders: string[] = [];
		for (const entry of entries) {
			const full = path.join(directory, entry.name);
			if (entry.isDirectory() && depth < 5) folders.push(full);
			// Codex compresses finished sessions to .jsonl.zst; most of its history is in those.
			else if (entry.isFile() && (entry.name.endsWith(".jsonl") || entry.name.endsWith(".jsonl.zst"))) {
				let info;
				try { info = statSync(full); } catch { continue; }
				if (info && now - info.mtimeMs < days * 86_400_000) found.push({ path: full, size: info.size, mtimeMs: info.mtimeMs });
			}
		}
		await new Promise(resolve => setImmediate(resolve));
		for (const folder of folders) await walk(folder, depth + 1);
	};
	// Real paths, so a folder linked into another (a junction from ~/.codex/sessions) is read once.
	for (const root of roots) { const real = await realpath(root).catch(() => undefined); if (real) await walk(real, 0); }
	return found.sort((a, b) => a.mtimeMs - b.mtimeMs);
}

const record = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

/**
 * One transcript line's usage, if it reports any. Claude Code writes a line per content block of each API response, all
 * with the response's usage, so the response id dedupes them (and matches what Phaseo records live). Codex writes its
 * thread's running total after each response; that total keys the response, as the live capture does.
 */
export function transcriptLine(harness: "claude" | "codex", line: string, state: TranscriptState, roots?: ThreadRoots): TranscriptUsage | undefined {
	if (harness === "claude") {
		if (!line.includes("\"usage\"") || !line.includes("\"assistant\"")) return;
		let value: Record<string, unknown> | undefined;
		try { value = record(JSON.parse(line)); } catch { return; }
		const message = record(value?.message);
		if (value?.type !== "assistant" || typeof message?.id !== "string" || typeof value.timestamp !== "string" || typeof value.sessionId !== "string") return;
		// Claude Code's own synthetic messages (errors it shows) carry no real usage.
		if (message.model === "<synthetic>") return;
		const usage = claudeUsage(message.id, typeof message.model === "string" ? message.model : undefined, message.usage);
		return usage && { ...usage, at: value.timestamp, harness, sessionId: value.sessionId, ...typeof value.cwd === "string" ? { cwd: value.cwd } : {} };
	}
	const kind = line.includes("\"session_meta\"") ? "meta" : line.includes("\"turn_context\"") ? "context" : line.includes("\"token_count\"") ? "count" : undefined;
	if (!kind) return;
	let value: Record<string, unknown> | undefined;
	try { value = record(JSON.parse(line)); } catch { return; }
	const payload = record(value?.payload);
	if (!payload) return;
	// A fork's file also holds its parent's session_meta, copied; the first one is this session's own.
	if (value?.type === "session_meta") {
		if (state.sessionId || typeof payload.id !== "string") return;
		state.sessionId = payload.id;
		if (typeof payload.cwd === "string") state.cwd = payload.cwd;
		const parent = typeof payload.forked_from_id === "string" ? payload.forked_from_id : undefined;
		state.root = parent ? roots?.rootOf(parent) ?? parent : payload.id;
		roots?.remember(payload.id, state.root);
		return;
	}
	if (value?.type === "turn_context") { if (typeof payload.model === "string") state.model = payload.model; if (typeof payload.cwd === "string") state.cwd = payload.cwd; return; }
	const info = record(payload.info);
	if (payload.type !== "token_count" || !info || !state.sessionId || typeof value?.timestamp !== "string") return;
	const usage = codexResponseUsage(state.root ?? state.sessionId, info.total_token_usage, info.last_token_usage);
	return usage && { ...usage, ...state.model ? { model: state.model } : {}, at: value.timestamp, harness, sessionId: state.sessionId, ...state.cwd ? { cwd: state.cwd } : {} };
}

/** Codex names a line's type in its first bytes, so a line that isn't usage (a tool's output, megabytes long) is skipped unread. */
const codexHead = 256, codexTypes = ["\"type\":\"session_meta\"", "\"type\":\"turn_context\"", "\"type\":\"token_count\""].map(mark => Buffer.from(mark));
const claudeUsageMark = Buffer.from("\"usage\"");

/**
 * Splits bytes into lines without decoding the ones a reader skips, so a first read of gigabytes is mostly finding
 * newlines. `consumed` counts the bytes through the last whole line.
 */
class TranscriptLines {
	consumed = 0;
	/** The line so far: its kept bytes, and all its bytes (kept or not). */
	private parts: Buffer[] = [];
	private length = 0;
	private bytes = 0;
	private keep?: boolean;
	constructor(private readonly harness: "claude" | "codex", private readonly onLine: (line: string) => void) {}
	push(chunk: Buffer) {
		let start = 0;
		while (start < chunk.length) {
			const end = chunk.indexOf(10, start), piece = chunk.subarray(start, end < 0 ? chunk.length : end);
			this.bytes += piece.length;
			if (this.keep !== false) { this.parts.push(piece); this.length += piece.length; }
			if (this.keep === undefined && (this.harness === "claude" || this.length >= codexHead)) this.decide();
			if (end < 0) {
				// The chunk's buffer may be reused; keep a copy of the line's start.
				if (this.keep !== false && this.parts.length) this.parts[this.parts.length - 1] = Buffer.from(this.parts.at(-1)!);
				return;
			}
			this.finish();
			this.consumed += this.bytes + 1; this.bytes = 0; start = end + 1;
		}
	}
	/** The last line, at the end of a file that doesn't end in a newline. */
	end() { this.finish(); this.bytes = 0; }
	private joined() { return this.parts.length === 1 ? this.parts[0]! : Buffer.concat(this.parts, this.length); }
	private decide() {
		const line = this.joined();
		this.keep = this.harness === "claude" || codexTypes.some(mark => line.subarray(0, codexHead).indexOf(mark) >= 0);
		this.parts = this.keep ? [line] : []; this.length = this.keep ? line.length : 0;
	}
	private finish() {
		if (this.keep === undefined && this.length) this.decide();
		if (this.keep && this.length) {
			const line = this.joined();
			if (this.harness === "codex" || line.indexOf(claudeUsageMark) >= 0) this.onLine(line.toString("utf8"));
		}
		this.parts = []; this.length = 0; this.keep = undefined;
	}
}

/**
 * Reads what a file gained since `from`: whole lines only, so a line being written is read next time. Reads in chunks
 * and yields between them, so a first read of gigabytes doesn't hold up the app.
 */
export async function readTranscript(file: string, harness: "claude" | "codex", from: TranscriptFile | undefined, size: number, mtimeMs: number, onUsage: (usage: TranscriptUsage[]) => void, roots?: ThreadRoots): Promise<TranscriptFile> {
	if (file.endsWith(".zst")) return readCompressed(file, harness, size, mtimeMs, onUsage, roots);
	// A file that shrank was replaced; read it again from the start.
	const restart = !from || size < from.offset;
	const state: TranscriptState = restart ? {} : { ...from.state };
	const start = restart ? 0 : from.offset;
	if (start >= size) return { size, mtimeMs, offset: start, state };
	let found: TranscriptUsage[] = [];
	const lines = new TranscriptLines(harness, line => { const usage = transcriptLine(harness, line, state, roots); if (usage) found.push(usage); });
	const handle = await open(file, "r");
	try {
		for (let position = start; position < size;) {
			const chunk = Buffer.allocUnsafe(Math.min(4 * 1024 * 1024, size - position));
			const { bytesRead } = await handle.read(chunk, 0, chunk.length, position);
			if (!bytesRead) break;
			lines.push(chunk.subarray(0, bytesRead)); position += bytesRead;
			if (found.length) { onUsage(found); found = []; }
			await new Promise(resolve => setImmediate(resolve));
		}
	} finally { await handle.close(); }
	return { size, mtimeMs, offset: start + lines.consumed, state };
}

/**
 * A compressed transcript, read whole as it streams out of zstd: Codex writes these once, when a session is done, so
 * there is nothing to resume. Lines are handled a chunk at a time, so a large session never sits in memory at once.
 */
async function readCompressed(file: string, harness: "claude" | "codex", size: number, mtimeMs: number, onUsage: (usage: TranscriptUsage[]) => void, roots?: ThreadRoots): Promise<TranscriptFile> {
	const state: TranscriptState = {};
	let found: TranscriptUsage[] = [];
	const lines = new TranscriptLines(harness, line => { const usage = transcriptLine(harness, line, state, roots); if (usage) found.push(usage); });
	for await (const chunk of createReadStream(file, { highWaterMark: 1024 * 1024 }).pipe(createZstdDecompress({ chunkSize: 1024 * 1024 }))) {
		lines.push(chunk as Buffer);
		if (found.length) { onUsage(found); found = []; }
		await new Promise(resolve => setImmediate(resolve));
	}
	lines.end();
	if (found.length) onUsage(found);
	return { size, mtimeMs, offset: size, state };
}

/**
 * A Codex session file's own session and the one it was forked from, from its first line. Reads only the file's start,
 * synchronously (zstd hands back what a partial frame holds), as a thousand awaited reads would take far longer.
 */
export function codexSession(file: string): { id: string; parent?: string } | undefined {
	let first: Buffer | undefined;
	try {
		const handle = openSync(file, "r");
		try {
			for (const length of [64 * 1024, 1024 * 1024]) {
				const start = Buffer.allocUnsafe(length), read = readSync(handle, start, 0, length, 0), whole = read < length;
				const text = file.endsWith(".zst") ? zstdDecompressSync(start.subarray(0, read), { maxOutputLength: 32 * 1024 * 1024 }) : start.subarray(0, read);
				const end = text.indexOf(10);
				if (end >= 0 || whole) { first = end >= 0 ? text.subarray(0, end) : text; break; }
			}
		} finally { closeSync(handle); }
	} catch { return; }
	let payload: Record<string, unknown> | undefined;
	try { const value = record(JSON.parse(first?.toString("utf8") ?? "")); payload = value?.type === "session_meta" ? record(value.payload) : undefined; } catch { return; }
	return typeof payload?.id === "string" ? { id: payload.id, ...typeof payload.forked_from_id === "string" ? { parent: payload.forked_from_id } : {} } : undefined;
}

/** One file for a reader: where to start, and the root of the session it was forked from (see ThreadRoots). */
export type TranscriptJob = { path: string; harness: "claude" | "codex"; from?: TranscriptFile; size: number; mtimeMs: number; roots: Record<string, string> };
type ReadJob = (job: TranscriptJob, onUsage: (usage: TranscriptUsage[]) => void) => Promise<TranscriptFile>;
const readHere: ReadJob = (job, onUsage) => readTranscript(job.path, job.harness, job.from, job.size, job.mtimeMs, onUsage, { rootOf: id => job.roots[id], remember() {} });

/**
 * Worker threads that read transcripts, a few files at once: decompressing and parsing Codex's history is most of a
 * first read, and off the main thread it neither holds up the app nor waits on one core. Without the worker's file
 * (in tests) files are read here, one at a time.
 */
export class TranscriptReaders {
	private readonly idle: Worker[] = [];
	private readonly all: Worker[] = [];
	private readonly here: boolean;
	readonly size: number;
	constructor(private readonly script = path.join(path.dirname(fileURLToPath(import.meta.url)), "usageWorker.mjs")) {
		this.here = !existsSync(script);
		this.size = this.here ? 1 : Math.max(1, Math.min(4, os.availableParallelism() - 1));
	}
	read: ReadJob = (job, onUsage) => this.here ? readHere(job, onUsage) : this.ask<TranscriptFile>({ job }, onUsage);
	/**
	 * Codex files' sessions, from their first lines, split across the workers: opening a file to read is what costs
	 * (a virus scanner reads it first), so these go a few at a time too.
	 */
	async sessions(files: readonly string[]): Promise<(CodexSession | undefined)[]> {
		if (this.here) return files.map(codexSession);
		const share = Math.ceil(files.length / this.size), parts = Array.from({ length: Math.ceil(files.length / share) }, (_, index) => files.slice(index * share, (index + 1) * share));
		return (await Promise.all(parts.map(part => this.ask<(CodexSession | null)[]>({ sessions: part }).catch(() => part.map(() => null))))).flat().map(session => session ?? undefined);
	}
	close() { for (const worker of this.all) void worker.terminate(); this.all.length = 0; this.idle.length = 0; }
	private async ask<T>(request: ReaderRequest, onUsage?: (usage: TranscriptUsage[]) => void): Promise<T> {
		const worker = this.idle.pop() ?? this.spawn();
		try {
			return await new Promise<T>((resolve, reject) => {
				const settle = (error?: Error, done?: T) => {
					worker.off("message", message); worker.off("error", settle); worker.off("exit", exit);
					if (done !== undefined) resolve(done); else reject(error);
				};
				const exit = () => settle(new Error("The transcript reader stopped."));
				const message = (value: ReaderReply) => {
					if (value.rows?.length) onUsage?.(value.rows);
					if (value.done !== undefined || value.failed) settle(new Error(value.failed ?? "The transcript reader stopped."), value.done as T);
				};
				worker.on("message", message); worker.on("error", settle); worker.on("exit", exit);
				worker.postMessage(request);
			});
		} finally { if (this.all.includes(worker)) this.idle.push(worker); }
	}
	private spawn() {
		const worker = new Worker(this.script, { resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32 } });
		worker.unref();
		worker.once("exit", () => { const index = this.all.indexOf(worker); if (index >= 0) this.all.splice(index, 1); });
		this.all.push(worker);
		return worker;
	}
}
type CodexSession = { id: string; parent?: string };
type ReaderRequest = { job: TranscriptJob } | { sessions: readonly string[] };
type ReaderReply = { rows?: TranscriptUsage[]; done?: unknown; failed?: string };

/** Runs in a reader worker: reads each file it's sent, posting its usage two thousand rows at a time. */
export function serveTranscriptReads(port: Pick<MessagePort, "on" | "postMessage">) {
	const reply = (value: ReaderReply) => port.postMessage(value), failed = (error: unknown) => reply({ failed: error instanceof Error ? error.message : String(error) });
	port.on("message", (request: ReaderRequest) => {
		if ("sessions" in request) { try { reply({ done: request.sessions.map(file => codexSession(file) ?? null) }); } catch (error) { failed(error); } return; }
		let rows: TranscriptUsage[] = [];
		void readHere(request.job, found => { rows.push(...found); if (rows.length >= 2000) { reply({ rows }); rows = []; } }).then(done => reply({ rows, done }), failed);
	});
}

/** Writes on the store's own connection, on this thread: in tests, and where no writer worker is given. */
function storeWriter(store: ScanStore): ScanWriter {
	let context: [SessionOwners, readonly Pick<Project, "id" | "directory">[], string] = [new Map(), [], ""];
	return { begin: (...value) => { context = value; }, record: rows => store.recordTranscriptUsage(rows, ...context), saveFile: (file, value) => store.saveTranscriptFile(file, value), sum: async limit => store.sumStaleQuarters(limit), close() {} };
}

/** What the scanner needs of the store. */
type ScanStore = {
	getAccounts(): Account[]; getProjects(): Pick<Project, "id" | "directory">[]; addedTranscriptFolders(): TranscriptFolder[];
	sessionOwners(): Map<string, { id: string; projectId?: string }>; transcriptFile(file: string): TranscriptFile | undefined; saveTranscriptFile(file: string, value: TranscriptFile): void;
	recordTranscriptUsage(rows: readonly TranscriptUsage[], owners: Map<string, { id: string; projectId?: string }>, projects: readonly Pick<Project, "id" | "directory">[], cutoff: string): void;
	sumStaleQuarters(limit?: number): boolean;
	threadRoots: ThreadRoots;
};

/**
 * Reads new transcript lines into the ledger: on start, then when the Usage page asks, at most once a minute. One scan
 * runs at a time; files unchanged since their last read are skipped by size and time, the rest read from where they
 * stopped, so after the first read a scan reads only what was written since. `onChange` says new usage arrived, at
 * most every few seconds while a long first read runs.
 */
export class TranscriptScanner {
	private running?: Promise<number>;
	private lastScan = 0;
	private readonly now: () => number;
	private readonly readers: () => Pick<TranscriptReaders, "size" | "read" | "sessions" | "close">;
	private readonly folders: () => TranscriptFolder[];
	private readonly writer: () => ScanWriter;
	constructor(private readonly store: ScanStore, private readonly onChange: () => void, options: { now?: () => number; readers?: () => Pick<TranscriptReaders, "size" | "read" | "sessions" | "close">; folders?: () => TranscriptFolder[]; writer?: () => ScanWriter } = {}) {
		this.now = options.now ?? Date.now;
		this.readers = options.readers ?? (() => new TranscriptReaders());
		this.folders = options.folders ?? (() => transcriptFolders(store.getAccounts(), store.addedTranscriptFolders()));
		this.writer = options.writer ?? (() => storeWriter(store));
	}
	scan(force = false): Promise<number> {
		if (this.running) return this.running;
		if (!force && this.now() - this.lastScan < 60_000) return Promise.resolve(0);
		this.lastScan = this.now();
		this.running = this.read().finally(() => { this.running = undefined; this.lastScan = this.now(); });
		return this.running;
	}
	private async read() {
		const now = this.now(), cutoff = new Date(now - 91 * 86_400_000).toISOString();
		const owners = this.store.sessionOwners(), projects = this.store.getProjects();
		const jobs: TranscriptJob[] = [], seen = new Set<string>();
		for (const folder of this.folders()) {
			for (const file of await transcriptFiles(folder, 91, now)) {
				if (seen.has(file.path.toLowerCase())) continue;
				seen.add(file.path.toLowerCase());
				const known = this.store.transcriptFile(file.path);
				if (known && known.size === file.size && known.mtimeMs === file.mtimeMs) continue;
				jobs.push({ ...file, harness: folder.harness, ...known ? { from: known } : {}, roots: {} });
			}
		}
		if (!jobs.length) return 0;
		// Newest first, so a first read fills today and this week in seconds and older history after.
		jobs.sort((a, b) => b.mtimeMs - a.mtimeMs);
		const readers = this.readers(), writer = this.writer();
		writer.begin(owners, projects, cutoff);
		let added = 0, unannounced = 0, announced = now, next = 0, pending: TranscriptUsage[] = [];
		// Written two thousand rows to a transaction: one per worker message cost twice as long, and more holds up the app.
		const write = () => { if (!pending.length) return; writer.record(pending); added += pending.length; unannounced += pending.length; pending = []; };
		try {
			await this.resolveRoots(jobs.filter(job => job.harness === "codex" && (job.path.endsWith(".zst") || !job.from || job.size < job.from.offset)), readers);
			await Promise.all(Array.from({ length: Math.min(readers.size, jobs.length) }, async () => {
				while (next < jobs.length) {
					const job = jobs[next++]!;
					try {
						const done = await readers.read(job, rows => { pending.push(...rows); if (pending.length >= 2000) write(); });
						// The rows first, so a file is never marked read past rows that weren't kept.
						write();
						writer.saveFile(job.path, done);
					} catch { write(); continue; } // A file being replaced or locked is read next time.
					if (unannounced && this.now() - announced > 3000) { await this.sum(writer); this.onChange(); unannounced = 0; announced = this.now(); }
				}
			}));
			// Also waits for the last rows and files to be written.
			await this.sum(writer);
		} finally { readers.close(); writer.close(); }
		if (unannounced) this.onChange();
		return added;
	}
	/** Sums what the ledger gained into its quarter hours, a day of hours at a time, yielding between, so a report needn't. */
	private async sum(writer: ScanWriter) {
		while (await writer.sum(24)) await new Promise(resolve => setImmediate(resolve));
	}
	/**
	 * Codex files read from the start get their fork chain's root before any is read, from every new file's first line
	 * and the roots already known, so files can be read in any order and a fork's copied lines still count once.
	 */
	private async resolveRoots(jobs: TranscriptJob[], readers: Pick<TranscriptReaders, "sessions">) {
		const parents = new Map<string, string | undefined>(), sessions = new Map<TranscriptJob, string | undefined>();
		const found = await readers.sessions(jobs.map(job => job.path));
		jobs.forEach((job, index) => { const session = found[index]; if (session) { parents.set(session.id, session.parent); sessions.set(job, session.parent); } });
		const rootOf = (id: string, depth = 0): string => {
			const known = this.store.threadRoots.rootOf(id), parent = parents.get(id);
			return known ?? (parent && depth < 64 ? rootOf(parent, depth + 1) : id);
		};
		for (const id of parents.keys()) this.store.threadRoots.remember(id, rootOf(id));
		for (const [job, parent] of sessions) if (parent) job.roots = { [parent]: rootOf(parent) };
	}
}
