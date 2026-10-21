import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";
import { createWorkflowTurnRunner, type TurnOutcome, type TurnRef, type TurnRunner, type TurnStart } from "./turns";

// ThreadCoordinator: one per Slack thread, named installation:channel:thread_ts.
//
// - Dedupes Slack event ids, so a retried delivery is handled once.
// - Runs one turn at a time: a follow-up while a turn runs waits in a queue and
//   starts when the turn reports back (finishTurn). Starting never waits for the
//   run itself, so the object is idle (and unbilled) while an answer is written.
// - Holds a cancel flag that the running turn checks between steps.
// - Keeps working memory: the bot's earlier replies and short tool summaries, so a
//   turn has context when Slack's history API is rate limited.
// - Deletes everything 7 days after the last activity (an alarm). This is the only
//   place Slack text is kept: an open turn's message, thread history and staged
//   reply until the turn ends, and the working memory, all gone within 7 days, as
//   Slack's API terms require. Workflow step outputs carry ids and statuses only.

const RETENTION_MS = 7 * 24 * 60 * 60_000;
/** A running turn that hasn't reported back after this long is failed, so the queue moves on. */
export const TURN_TIMEOUT_MS = 20 * 60_000;
const MAX_QUEUED = 5;
const MAX_MEMORY_ENTRIES = 20;
const MAX_REPLY_CHARS = 4_000;
const MAX_TOOL_CHARS = 200;
const MAX_TOOLS_PER_TURN = 5;
const MAX_MESSAGE_CHARS = 40_000;

export type TurnRequest = Omit<TurnRef, "turnId"> & {
	/** The person's message. Kept only until the turn ends. */
	text: string;
};

export type EnqueueResult =
	| { status: "started"; turnId: number; position: number }
	| { status: "queued"; turnId: number; position: number }
	| { status: "duplicate" }
	| { status: "queue_full" };

export type MemoryEntry = { kind: "reply" | "tool"; text: string; at: number };

/** A message from the thread's history (conversations.replies), for one turn only. */
export type ContextEntry = { role: "user" | "assistant"; author: string | null; text: string };

export type TurnInput = {
	text: string;
	context: ContextEntry[] | null;
	/** The reply message an earlier attempt of this turn started, if any. */
	replyTs: string | null;
	/** The reply text and tool notes, staged by the run until the turn ends. */
	stagedReply: string | null;
	stagedTools: string[];
	memory: MemoryEntry[];
};

const MAX_CONTEXT_ENTRIES = 20;
const MAX_CONTEXT_CHARS = 4_000;

type TurnRow = {
	id: number;
	thread_key: string;
	event_id: string;
	installation_id: string;
	team_id: string | null;
	channel: string;
	thread_ts: string;
	message_ts: string;
	slack_user_id: string;
	kind: "mention" | "dm";
	status: "queued" | "running";
	started_at: number | null;
};

function turnRef(row: TurnRow): TurnRef {
	return {
		turnId: row.id,
		threadKey: row.thread_key,
		eventId: row.event_id,
		installationId: row.installation_id,
		teamId: row.team_id,
		channel: row.channel,
		threadTs: row.thread_ts,
		messageTs: row.message_ts,
		slackUserId: row.slack_user_id,
		kind: row.kind,
	};
}

const TURN_COLUMNS = "id, thread_key, event_id, installation_id, team_id, channel, thread_ts, message_ts, slack_user_id, kind, status, started_at";

export class ThreadCoordinator extends DurableObject<Env> {
	/** Starts turns; replaced in tests. */
	runner: TurnRunner;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.runner = createWorkflowTurnRunner(env);
		this.migrate();
	}

	private get sql() {
		return this.ctx.storage.sql;
	}

	private migrate(): void {
		this.sql.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
		this.sql.exec("CREATE TABLE IF NOT EXISTS events (event_id TEXT PRIMARY KEY, at INTEGER NOT NULL)");
		this.sql.exec(`CREATE TABLE IF NOT EXISTS turns (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			thread_key TEXT NOT NULL,
			event_id TEXT NOT NULL UNIQUE,
			installation_id TEXT NOT NULL,
			team_id TEXT,
			channel TEXT NOT NULL,
			thread_ts TEXT NOT NULL,
			message_ts TEXT NOT NULL,
			slack_user_id TEXT NOT NULL,
			kind TEXT NOT NULL,
			text TEXT NOT NULL,
			status TEXT NOT NULL,
			created_at INTEGER NOT NULL,
			started_at INTEGER,
			context TEXT,
			reply_ts TEXT,
			staged_reply TEXT,
			staged_tools TEXT
		)`);
		this.sql.exec("CREATE TABLE IF NOT EXISTS memory (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, text TEXT NOT NULL, at INTEGER NOT NULL)");
	}

	private meta(key: string): string | null {
		const row = this.sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = ?", key).toArray()[0];
		return row ? row.value : null;
	}

	private setMeta(key: string, value: string): void {
		this.sql.exec("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", key, value);
	}

	private running(): TurnRow | null {
		return this.sql.exec<TurnRow>(`SELECT ${TURN_COLUMNS} FROM turns WHERE status = 'running' LIMIT 1`).toArray()[0] ?? null;
	}

	/** Marks activity and keeps one alarm: the running turn's timeout, or deletion 7 days from now. */
	private async touch(now: number): Promise<void> {
		this.setMeta("last_activity", String(now));
		await this.scheduleAlarm(now);
	}

	private async scheduleAlarm(now: number): Promise<void> {
		const lastActivity = Number(this.meta("last_activity") ?? now);
		const running = this.running();
		const deleteAt = lastActivity + RETENTION_MS;
		const at = running?.started_at != null ? Math.min(deleteAt, running.started_at + TURN_TIMEOUT_MS) : deleteAt;
		await this.ctx.storage.setAlarm(at);
	}

	/** True the first time an event id is seen in this thread. */
	async claimEvent(eventId: string, now = Date.now()): Promise<boolean> {
		const fresh = this.ctx.storage.transactionSync(() => {
			if (this.sql.exec("SELECT 1 FROM events WHERE event_id = ?", eventId).toArray().length) return false;
			this.sql.exec("INSERT INTO events (event_id, at) VALUES (?, ?)", eventId, now);
			return true;
		});
		if (fresh) await this.touch(now);
		return fresh;
	}

	/** Queues a turn, and starts it if the thread is idle. Never waits for the run. */
	async enqueue(request: TurnRequest, now = Date.now()): Promise<EnqueueResult> {
		const queued = this.ctx.storage.transactionSync((): EnqueueResult => {
			if (this.sql.exec("SELECT 1 FROM turns WHERE event_id = ?", request.eventId).toArray().length) return { status: "duplicate" };
			const waiting = this.sql.exec<{ count: number }>("SELECT count(*) AS count FROM turns WHERE status = 'queued'").one().count;
			if (waiting >= MAX_QUEUED) return { status: "queue_full" };
			this.setMeta("thread_key", request.threadKey);
			const row = this.sql.exec<{ id: number }>(
				`INSERT INTO turns (thread_key, event_id, installation_id, team_id, channel, thread_ts, message_ts, slack_user_id, kind, text, status, created_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?) RETURNING id`,
				request.threadKey, request.eventId, request.installationId, request.teamId, request.channel, request.threadTs,
				request.messageTs, request.slackUserId, request.kind, request.text.slice(0, MAX_MESSAGE_CHARS), now,
			).one();
			return { status: "queued", turnId: row.id, position: waiting + (this.running() ? 1 : 0) };
		});
		if (queued.status !== "queued") return queued;
		await this.touch(now);
		await this.startNext(now);
		const started = this.sql.exec<{ status: string }>("SELECT status FROM turns WHERE id = ?", queued.turnId).toArray()[0];
		// Gone already means a runner that finishes at once ran it.
		return started?.status === "queued" ? queued : { status: "started", turnId: queued.turnId, position: 0 };
	}

	/** Starts queued turns while the thread is idle. A runner that finishes at once lets the next one start. */
	private async startNext(now: number): Promise<void> {
		for (;;) {
			if (this.running()) return;
			const next = this.sql.exec<TurnRow>(`SELECT ${TURN_COLUMNS} FROM turns WHERE status = 'queued' ORDER BY id LIMIT 1`).toArray()[0];
			if (!next) return;
			this.sql.exec("UPDATE turns SET status = 'running', started_at = ? WHERE id = ?", now, next.id);
			this.sql.exec("DELETE FROM meta WHERE key = 'cancel_turn_id'");
			await this.scheduleAlarm(now);
			let start: TurnStart;
			try {
				start = await this.runner.start(turnRef({ ...next, status: "running", started_at: now }));
			} catch (error) {
				console.error("[slack-agent] turn failed to start", { turnId: next.id, error: error instanceof Error ? error.message : "unknown" });
				start = { finished: { status: "failed" } };
			}
			if ("started" in start) return;
			await this.endTurn(next.id, start.finished, now);
		}
	}

	/** The running turn reports back. Stores its working memory and starts the next queued turn. */
	async finishTurn(turnId: number, outcome: TurnOutcome, now = Date.now()): Promise<{ ok: boolean }> {
		const ended = await this.endTurn(turnId, outcome, now);
		if (ended) await this.startNext(now);
		return { ok: ended };
	}

	private async endTurn(turnId: number, outcome: TurnOutcome, now: number): Promise<boolean> {
		const turn = this.sql.exec<TurnRow & { staged_reply: string | null; staged_tools: string | null }>(
			`SELECT ${TURN_COLUMNS}, staged_reply, staged_tools FROM turns WHERE id = ? AND status = 'running'`, turnId,
		).toArray()[0];
		if (!turn) return false;
		// A turn that staged its reply reports back with ids only.
		const reply = outcome.reply ?? turn.staged_reply ?? undefined;
		const tools = outcome.tools ?? (turn.staged_tools ? JSON.parse(turn.staged_tools) as string[] : []);
		this.ctx.storage.transactionSync(() => {
			// The message and its thread history go with the turn; only the bot's side stays as working memory.
			this.sql.exec("DELETE FROM turns WHERE id = ?", turnId);
			if (this.meta("cancel_turn_id") === String(turnId)) this.sql.exec("DELETE FROM meta WHERE key = 'cancel_turn_id'");
			for (const tool of tools.slice(0, MAX_TOOLS_PER_TURN)) {
				if (tool.trim()) this.sql.exec("INSERT INTO memory (kind, text, at) VALUES ('tool', ?, ?)", tool.trim().slice(0, MAX_TOOL_CHARS), now);
			}
			if (reply?.trim()) this.sql.exec("INSERT INTO memory (kind, text, at) VALUES ('reply', ?, ?)", reply.trim().slice(0, MAX_REPLY_CHARS), now);
			this.sql.exec("DELETE FROM memory WHERE id NOT IN (SELECT id FROM memory ORDER BY id DESC LIMIT ?)", MAX_MEMORY_ENTRIES);
		});
		if (outcome.status !== "done") await this.releaseMeter(turn);
		await this.touch(now);
		return true;
	}

	/** A turn that ends without an answer gives its pending answer back to the meter. */
	private async releaseMeter(turn: Pick<TurnRow, "installation_id" | "event_id">): Promise<void> {
		try {
			await this.env.METERS.get(this.env.METERS.idFromName(turn.installation_id)).release({ eventId: turn.event_id });
		} catch {
			console.error("[slack-agent] meter release failed", { installationId: turn.installation_id });
		}
	}

	/**
	 * Stops the thread: flags the running turn to stop at its next step and drops
	 * the queued ones. Returns the running turn's id, if any.
	 */
	async cancel(now = Date.now()): Promise<{ cancelled: boolean; turnId: number | null; dropped: number }> {
		const running = this.running();
		const queued = this.sql.exec<TurnRow>(`SELECT ${TURN_COLUMNS} FROM turns WHERE status = 'queued'`).toArray();
		this.ctx.storage.transactionSync(() => {
			if (running) this.setMeta("cancel_turn_id", String(running.id));
			this.sql.exec("DELETE FROM turns WHERE status = 'queued'");
		});
		for (const turn of queued) await this.releaseMeter(turn);
		await this.touch(now);
		return { cancelled: Boolean(running) || queued.length > 0, turnId: running?.id ?? null, dropped: queued.length };
	}

	/** For the running turn, between steps. */
	isCancelled(turnId: number): boolean {
		return this.meta("cancel_turn_id") === String(turnId);
	}

	/** What a turn works from, while it is queued or running: its message, thread history, reply and working memory. */
	turnInput(turnId: number): TurnInput | null {
		const row = this.sql.exec<{ text: string; context: string | null; reply_ts: string | null; staged_reply: string | null; staged_tools: string | null }>(
			"SELECT text, context, reply_ts, staged_reply, staged_tools FROM turns WHERE id = ?", turnId,
		).toArray()[0];
		if (!row) return null;
		return {
			text: row.text,
			context: row.context ? JSON.parse(row.context) as ContextEntry[] : null,
			replyTs: row.reply_ts,
			stagedReply: row.staged_reply,
			stagedTools: row.staged_tools ? JSON.parse(row.staged_tools) as string[] : [],
			memory: this.workingMemory(),
		};
	}

	/** The thread's recent messages for one turn; deleted with the turn. */
	setTurnContext(turnId: number, entries: ContextEntry[]): void {
		const kept = entries.slice(-MAX_CONTEXT_ENTRIES).map((entry) => ({ role: entry.role, author: entry.author, text: entry.text.slice(0, MAX_CONTEXT_CHARS) }));
		this.sql.exec("UPDATE turns SET context = ? WHERE id = ?", JSON.stringify(kept), turnId);
	}

	/** Records the reply message as soon as Slack returns it, so a retried run updates it instead of posting again. */
	setReplyTs(turnId: number, ts: string): void {
		this.sql.exec("UPDATE turns SET reply_ts = coalesce(reply_ts, ?) WHERE id = ?", ts, turnId);
	}

	/** The run's reply and tool notes, moved to working memory when the turn ends. */
	stageTurnOutput(turnId: number, output: { reply: string; tools: string[] }): void {
		this.sql.exec(
			"UPDATE turns SET staged_reply = ?, staged_tools = ? WHERE id = ?",
			output.reply.slice(0, MAX_MESSAGE_CHARS), JSON.stringify(output.tools.slice(0, MAX_TOOLS_PER_TURN).map((tool) => tool.slice(0, MAX_TOOL_CHARS))), turnId,
		);
	}

	/** The bot's earlier replies and tool summaries in this thread, oldest first. */
	workingMemory(): MemoryEntry[] {
		return this.sql.exec<MemoryEntry>("SELECT kind, text, at FROM memory ORDER BY id").toArray();
	}

	/** What the thread holds, for tests and diagnostics. Never includes text. */
	status(): { running: number | null; queued: number; events: number; memory: number } {
		const count = (table: string, where = "") => this.sql.exec<{ count: number }>(`SELECT count(*) AS count FROM ${table} ${where}`).one().count;
		return { running: this.running()?.id ?? null, queued: count("turns", "WHERE status = 'queued'"), events: count("events"), memory: count("memory") };
	}

	async alarm(): Promise<void> {
		const now = Date.now();
		const running = this.running();
		if (running?.started_at != null && running.started_at + TURN_TIMEOUT_MS <= now) {
			console.warn("[slack-agent] turn timed out", { turnId: running.id, installationId: running.installation_id });
			await this.endTurn(running.id, { status: "failed" }, now);
			await this.startNext(now);
		}
		const lastActivity = Number(this.meta("last_activity") ?? 0);
		if (lastActivity + RETENTION_MS <= now && !this.running()) {
			// Slack's terms: nothing from a thread is kept beyond 7 days of quiet.
			const queued = this.sql.exec<TurnRow>(`SELECT ${TURN_COLUMNS} FROM turns`).toArray();
			for (const turn of queued) await this.releaseMeter(turn);
			await this.ctx.storage.deleteAlarm();
			await this.ctx.storage.deleteAll();
			this.migrate();
			return;
		}
		await this.scheduleAlarm(now);
	}
}
