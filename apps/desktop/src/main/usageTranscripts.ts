import { createReadStream } from "node:fs";
import { open, readdir, realpath, stat } from "node:fs/promises";
import { StringDecoder } from "node:string_decoder";
import { createZstdDecompress } from "node:zlib";
import os from "node:os";
import path from "node:path";
import { claudeUsage, codexResponseUsage } from "./harnessUsage";
import type { HarnessUsage } from "../shared/usageLedger";
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
	const walk = async (directory: string, depth: number): Promise<void> => {
		let entries;
		try { entries = await readdir(directory, { withFileTypes: true }); } catch { return; }
		for (const entry of entries) {
			const full = path.join(directory, entry.name);
			if (entry.isDirectory() && depth < 5) await walk(full, depth + 1);
			// Codex compresses finished sessions to .jsonl.zst; most of its history is in those.
			else if (entry.isFile() && (entry.name.endsWith(".jsonl") || entry.name.endsWith(".jsonl.zst"))) {
				const info = await stat(full).catch(() => undefined);
				if (info && now - info.mtimeMs < days * 86_400_000) found.push({ path: full, size: info.size, mtimeMs: info.mtimeMs });
			}
		}
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

/**
 * Reads what a file gained since `from`: whole lines only, so a line being written is read next time. Reads in chunks
 * and yields between them, so a first read of gigabytes doesn't hold up the app.
 */
export async function readTranscript(file: string, harness: "claude" | "codex", from: TranscriptFile | undefined, size: number, mtimeMs: number, onUsage: (usage: TranscriptUsage[]) => void, roots?: ThreadRoots): Promise<TranscriptFile> {
	if (file.endsWith(".zst")) return readCompressed(file, harness, size, mtimeMs, onUsage, roots);
	// A file that shrank was replaced; read it again from the start.
	const restart = !from || size < from.offset;
	const state: TranscriptState = restart ? {} : { ...from.state };
	let offset = restart ? 0 : from.offset;
	if (offset >= size) return { size, mtimeMs, offset, state };
	const handle = await open(file, "r");
	try {
		const chunk = Buffer.alloc(4 * 1024 * 1024);
		let carry = Buffer.alloc(0);
		while (offset + carry.length < size) {
			const { bytesRead } = await handle.read(chunk, 0, Math.min(chunk.length, size - offset - carry.length), offset + carry.length);
			if (!bytesRead) break;
			const data = carry.length ? Buffer.concat([carry, chunk.subarray(0, bytesRead)]) : Buffer.from(chunk.subarray(0, bytesRead));
			const end = data.lastIndexOf(10);
			// A line longer than the buffer so far: keep reading until it ends.
			if (end < 0) { carry = data; continue; }
			const found: TranscriptUsage[] = [];
			for (const line of data.subarray(0, end).toString("utf8").split("\n")) { const usage = transcriptLine(harness, line, state, roots); if (usage) found.push(usage); }
			if (found.length) onUsage(found);
			offset += end + 1; carry = data.subarray(end + 1);
			await new Promise(resolve => setImmediate(resolve));
		}
	} finally { await handle.close(); }
	return { size, mtimeMs, offset, state };
}

/** What the scanner needs of the store. */
type ScanStore = {
	getAccounts(): Account[]; getProjects(): Pick<Project, "id" | "directory">[]; addedTranscriptFolders(): TranscriptFolder[];
	sessionOwners(): Map<string, { id: string; projectId?: string }>; transcriptFile(file: string): TranscriptFile | undefined; saveTranscriptFile(file: string, value: TranscriptFile): void;
	recordTranscriptUsage(rows: readonly TranscriptUsage[], owners: Map<string, { id: string; projectId?: string }>, projects: readonly Pick<Project, "id" | "directory">[], cutoff: string): void;
	threadRoots: ThreadRoots;
};

/**
 * Reads new transcript lines into the ledger: on start, then when the Usage page asks, at most once a minute. One scan
 * runs at a time; files unchanged since their last read are skipped by size and time, the rest read from where they
 * stopped. `onChange` says new usage arrived, at most every few seconds while a long first read runs.
 */
export class TranscriptScanner {
	private running?: Promise<number>;
	private lastScan = 0;
	constructor(private readonly store: ScanStore, private readonly onChange: () => void, private readonly now = Date.now) {}
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
		let added = 0, unannounced = 0, announced = now;
		const seen = new Set<string>();
		for (const folder of transcriptFolders(this.store.getAccounts(), this.store.addedTranscriptFolders())) {
			for (const file of await transcriptFiles(folder, 91, now)) {
				if (seen.has(file.path.toLowerCase())) continue;
				seen.add(file.path.toLowerCase());
				const known = this.store.transcriptFile(file.path);
				if (known && known.size === file.size && known.mtimeMs === file.mtimeMs) continue;
				try {
					const next = await readTranscript(file.path, folder.harness, known, file.size, file.mtimeMs, rows => { this.store.recordTranscriptUsage(rows, owners, projects, cutoff); added += rows.length; unannounced += rows.length; }, this.store.threadRoots);
					this.store.saveTranscriptFile(file.path, next);
				} catch { continue; } // A file being replaced or locked is read next time.
				if (unannounced && this.now() - announced > 3000) { this.onChange(); unannounced = 0; announced = this.now(); }
			}
		}
		if (unannounced) this.onChange();
		return added;
	}
}

/**
 * A compressed transcript, read whole as it streams out of zstd: Codex writes these once, when a session is done, so
 * there is nothing to resume. Lines are handled a chunk at a time, so a large session never sits in memory at once.
 */
async function readCompressed(file: string, harness: "claude" | "codex", size: number, mtimeMs: number, onUsage: (usage: TranscriptUsage[]) => void, roots?: ThreadRoots): Promise<TranscriptFile> {
	const state: TranscriptState = {}, decoder = new StringDecoder("utf8");
	let carry = "";
	const handle = (text: string, last = false) => {
		const lines = (carry + text).split("\n");
		carry = last ? "" : lines.pop() ?? "";
		const found = lines.flatMap(line => { const usage = transcriptLine(harness, line, state, roots); return usage ? [usage] : []; });
		if (found.length) onUsage(found);
	};
	for await (const chunk of createReadStream(file).pipe(createZstdDecompress())) { handle(decoder.write(chunk as Buffer)); await new Promise(resolve => setImmediate(resolve)); }
	handle(decoder.end(), true);
	return { size, mtimeMs, offset: size, state };
}
