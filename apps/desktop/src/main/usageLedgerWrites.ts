import { existsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import type { Project } from "../shared/workspace";
import { tokenTotal } from "../shared/usageLedger";
import type { TranscriptFile, TranscriptUsage } from "./usageTranscripts";

/**
 * How a harness response reported again merges into its ledger row: the larger count of each type, a chat's id over a
 * bare session's, and a project or label once known. The WHERE clause matters for speed: an upsert whose merge
 * changes nothing (most are: Claude Code repeats a response per content block, a Codex fork copies its parent's) writes nothing.
 */
export const harnessMerge = `input = max(input, excluded.input), cached = max(cached, excluded.cached), cache_write = max(cache_write, excluded.cache_write), output = max(output, excluded.output), reasoning = max(reasoning, excluded.reasoning),
	tokens = max(input, excluded.input) + max(cached, excluded.cached) + max(cache_write, excluded.cache_write) + max(output, excluded.output),
	task_id = CASE WHEN usage_ledger.task_id LIKE 'session:%' THEN excluded.task_id ELSE usage_ledger.task_id END,
	project_id = coalesce(usage_ledger.project_id, excluded.project_id), label = coalesce(usage_ledger.label, excluded.label)
	WHERE excluded.input > usage_ledger.input OR excluded.cached > usage_ledger.cached OR excluded.cache_write > usage_ledger.cache_write OR excluded.output > usage_ledger.output OR excluded.reasoning > usage_ledger.reasoning
		OR (usage_ledger.task_id LIKE 'session:%' AND excluded.task_id IS NOT usage_ledger.task_id)
		OR (usage_ledger.project_id IS NULL AND excluded.project_id IS NOT NULL) OR (usage_ledger.label IS NULL AND excluded.label IS NOT NULL)`;
/** A ledger time's quarter hour in UTC, as `YYYY-MM-DDTHH:MM`: every time zone's hours and days start on one. */
export const usageQuarter = (at: string) => `substr(${at}, 1, 14) || printf('%02d', CAST(substr(${at}, 15, 2) AS INTEGER) / 15 * 15)`;
/**
 * Marks a ledger time's hour for summing into quarters again: an hour, as a prefix costs next to nothing on every write
 * where working out the quarter doubled it. NOT EXISTS, not OR IGNORE: an upsert's conflict policy would apply here.
 */
export const staleHour = (at: string) => `INSERT INTO usage_stale (at) SELECT substr(${at}, 1, 13) WHERE NOT EXISTS (SELECT 1 FROM usage_stale WHERE at = substr(${at}, 1, 13));`;

export type SessionOwners = Map<string, { id: string; projectId?: string }>;

/**
 * The ledger writes a transcript scan makes, on whichever connection is given: the store's own, or a writer worker's
 * (see TranscriptWriter), so a first read's hundreds of thousands of rows needn't be written on the app's main thread.
 */
export class TranscriptLedger {
	private readonly statements = new Map<string, StatementSync>();
	constructor(private readonly db: DatabaseSync, private readonly batch: (run: () => void) => void = run => {
		if (db.isTransaction) { run(); return; }
		db.exec("BEGIN IMMEDIATE");
		try { run(); db.exec("COMMIT"); } catch (error) { db.exec("ROLLBACK"); throw error; }
	}) {}
	private statement(sql: string) { let statement = this.statements.get(sql); if (!statement) this.statements.set(sql, statement = this.db.prepare(sql)); return statement; }

	/**
	 * Keeps responses read from Claude Code and Codex transcripts. One from a Phaseo chat's session counts under that chat;
	 * others count under their session, labelled by folder, and under the project whose folder they ran in.
	 */
	record(rows: readonly TranscriptUsage[], owners: SessionOwners, projects: readonly Pick<Project, "id" | "directory">[], cutoff: string) {
		const folder = (value: string) => value.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
		const homes = projects.map(project => ({ id: project.id, directory: folder(project.directory) })).sort((a, b) => b.directory.length - a.directory.length);
		const insert = this.statement(`INSERT INTO usage_ledger (key, task_id, at, kind, autopilot, harness, model, project_id, input, cached, cache_write, output, reasoning, tokens, cost_nanos, label) VALUES (?, ?, ?, 'turn', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
			ON CONFLICT(key) DO UPDATE SET ${harnessMerge}`);
		// Rows come a session at a time, so each folder's project and label are worked out once.
		const places = new Map<string, { projectId?: string; label: string | null }>();
		const place = (cwd: string) => {
			let known = places.get(cwd);
			if (!known) {
				const directory = folder(cwd);
				places.set(cwd, known = { projectId: homes.find(home => directory === home.directory || directory.startsWith(`${home.directory}/`))?.id, label: cwd.split(/[\\/]/).filter(Boolean).at(-1) ?? null });
			}
			return known;
		};
		this.batch(() => {
			for (const row of rows) {
				const total = tokenTotal(row);
				if (row.at < cutoff || !total) continue;
				const owner = owners.get(`${row.harness}:${row.sessionId}`), where = row.cwd ? place(row.cwd) : undefined;
				insert.run(row.key, owner?.id ?? `session:${row.harness}:${row.sessionId}`, row.at, row.harness, row.model ?? "unknown", owner?.projectId ?? where?.projectId ?? null, row.input, row.cached, row.cacheWrite, row.output, row.reasoning, total, where?.label ?? null);
			}
		});
	}
	/** Where a transcript has been read to, saved only after its rows (see TranscriptScanner). */
	saveFile(file: string, value: TranscriptFile) { this.statement("INSERT OR REPLACE INTO usage_files (path, data) VALUES (?, ?)").run(file, JSON.stringify(value)); }
	/**
	 * Sums the ledger's stale hours into quarters again (see usage_quarters), newest first, through the time indexes: up
	 * to `limit` hours in one transaction, so a long first read can sum as it goes without holding up the app. Whether
	 * any are left. An hour `YYYY-MM-DDTHH` holds every time from it up to, not including, `YYYY-MM-DDTHHZ`.
	 */
	sumStale(limit = -1): boolean {
		const stale = "SELECT at FROM usage_stale ORDER BY at DESC LIMIT ?";
		this.batch(() => {
			this.statement(`DELETE FROM usage_quarters WHERE rowid IN (SELECT usage_quarters.rowid FROM (${stale}) AS stale JOIN usage_quarters ON usage_quarters.at >= stale.at AND usage_quarters.at < stale.at || 'Z')`).run(limit);
			this.statement(`INSERT INTO usage_quarters SELECT ${usageQuarter("usage_ledger.at")} AS quarter, harness, model, cost_nanos IS NULL, task_id, project_id, label, autopilot, SUM(input), SUM(cached), SUM(cache_write), SUM(output), SUM(reasoning), SUM(tokens), SUM(cost_nanos)
				FROM (${stale}) AS stale JOIN usage_ledger ON usage_ledger.at >= stale.at AND usage_ledger.at < stale.at || 'Z'
				GROUP BY quarter, harness, model, cost_nanos IS NULL, task_id, project_id, label, autopilot`).run(limit);
			this.statement(`DELETE FROM usage_stale WHERE at IN (${stale})`).run(limit);
		});
		return Boolean(this.statement("SELECT 1 FROM usage_stale LIMIT 1").get());
	}
}

/** What a transcript scan writes through: the store on the main thread, or a TranscriptWriter. */
export type ScanWriter = {
	begin(owners: SessionOwners, projects: readonly Pick<Project, "id" | "directory">[], cutoff: string): void;
	record(rows: TranscriptUsage[]): void;
	saveFile(file: string, value: TranscriptFile): void;
	/** Sums up to `limit` stale hours once everything sent before is written; whether any are left. */
	sum(limit: number): Promise<boolean>;
	close(): void;
};
type WriterRequest = { begin: { owners: [string, { id: string; projectId?: string }][]; projects: Pick<Project, "id" | "directory">[]; cutoff: string } } | { rows: TranscriptUsage[] } | { file: string; value: TranscriptFile } | { sum: number; id: number };
type WriterReply = { id: number; more?: boolean; failed?: string };

/**
 * A worker thread with its own connection to the workspace database that writes a scan's rows, so a first read of
 * Claude Code and Codex history (a quarter of its time was writing on the main thread) neither holds up the app nor
 * waits on it. Requests run in the order sent, so a file is saved as read only after its rows, and a sum's answer
 * means everything before it is written. Once a write fails, nothing more is saved and the next sum fails, so what
 * wasn't kept is read again next time.
 */
export class TranscriptWriter implements ScanWriter {
	private readonly worker: Worker;
	private readonly waiting = new Map<number, { resolve: (more: boolean) => void; reject: (error: Error) => void }>();
	private next = 0;
	private stopped?: Error;
	constructor(database: string, script = path.join(path.dirname(fileURLToPath(import.meta.url)), "usageWorker.mjs")) {
		if (!existsSync(script)) throw new Error("The transcript writer isn't built.");
		this.worker = new Worker(script, { workerData: { writer: database }, resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32 } });
		this.worker.unref();
		this.worker.on("message", (reply: WriterReply) => {
			const waiting = this.waiting.get(reply.id); this.waiting.delete(reply.id);
			if (reply.failed) waiting?.reject(new Error(reply.failed)); else waiting?.resolve(Boolean(reply.more));
		});
		const stop = (error: Error) => { this.stopped ??= error; for (const waiting of this.waiting.values()) waiting.reject(error); this.waiting.clear(); };
		this.worker.on("error", stop);
		this.worker.on("exit", () => stop(new Error("The transcript writer stopped.")));
	}
	private send(request: WriterRequest) { if (!this.stopped) this.worker.postMessage(request); }
	begin(owners: SessionOwners, projects: readonly Pick<Project, "id" | "directory">[], cutoff: string) { this.send({ begin: { owners: [...owners], projects: projects.map(({ id, directory }) => ({ id, directory })), cutoff } }); }
	record(rows: TranscriptUsage[]) { this.send({ rows }); }
	saveFile(file: string, value: TranscriptFile) { this.send({ file, value }); }
	sum(limit: number) {
		if (this.stopped) return Promise.reject(this.stopped);
		const id = this.next++;
		return new Promise<boolean>((resolve, reject) => { this.waiting.set(id, { resolve, reject }); this.send({ sum: limit, id }); });
	}
	close() { void this.worker.terminate(); }
}

/** Runs in a writer worker (see TranscriptWriter); closes its connection when called, though ending the worker does too. */
export function serveTranscriptWrites(port: { on(event: "message", listener: (request: WriterRequest) => void): unknown; postMessage(value: WriterReply): void }, database: string): () => void {
	const db = new DatabaseSync(database);
	// The app's own connection writes too: wait for its lock rather than fail.
	db.exec("PRAGMA busy_timeout=5000; PRAGMA synchronous=NORMAL;");
	const ledger = new TranscriptLedger(db);
	let owners: SessionOwners = new Map(), projects: Pick<Project, "id" | "directory">[] = [], cutoff = "", failed: string | undefined;
	port.on("message", (request: WriterRequest) => {
		if ("begin" in request) { owners = new Map(request.begin.owners); projects = request.begin.projects; cutoff = request.begin.cutoff; failed = undefined; return; }
		if ("sum" in request) {
			let reply: WriterReply;
			try { reply = failed ? { id: request.id, failed } : { id: request.id, more: ledger.sumStale(request.sum) }; } catch (error) { reply = { id: request.id, failed: failed = error instanceof Error ? error.message : String(error) }; }
			port.postMessage(reply); return;
		}
		if (failed) return;
		try { if ("rows" in request) ledger.record(request.rows, owners, projects, cutoff); else ledger.saveFile(request.file, request.value); }
		catch (error) { failed = error instanceof Error ? error.message : String(error); }
	});
	return () => db.close();
}
