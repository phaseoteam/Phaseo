import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";
import { compareTs, MAX_KNOWN_MESSAGES } from "./history";
import { MAX_OWN_ANSWER_CHARS, QUESTION_TIMEOUT_MS, questionMemory, type QuestionAnswer, type QuestionDraft, type QuestionState } from "./questions";
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
// - Keeps the timestamps (never the text) of the thread's newest messages it
//   knows follow one another, so the next turn's one read of the thread starts
//   at the right place (history.ts).
// - Remembers who was sent the Connect your Phaseo account button in this thread,
//   so the agent offers it at most once per person here.
// - Holds the running turn's questions (questions.ts): the paused run, the
//   question and its answer. The first answer from the person asked wins, and
//   wakes the turn's Workflow; so does stopping the thread while it waits.
// - Deletes everything 7 days after the last activity (an alarm). This is the only
//   place Slack text is kept: an open turn's message, thread history, staged
//   reply and questions until the turn ends, and the working memory, all gone
//   within 7 days, as Slack's API terms require. Workflow step outputs carry ids
//   and statuses only.

const RETENTION_MS = 7 * 24 * 60 * 60_000;
/** A running turn that hasn't reported back after this long is failed, so the queue moves on. While its question waits, this counts from when the question closes (turnDeadline). */
export const TURN_TIMEOUT_MS = 20 * 60_000;
const MAX_QUEUED = 5;
const MAX_MEMORY_ENTRIES = 20;
const MAX_REPLY_CHARS = 4_000;
const MAX_TOOL_CHARS = 200;
const MAX_TOOLS_PER_TURN = 5;
const MAX_MESSAGE_CHARS = 40_000;
/** A paused run is kept in one row; SQLite in Durable Objects holds at most 2 MB a value. */
const MAX_PAUSED_RUN_CHARS = 1_500_000;

export type TurnRequest = Omit<TurnRef, "turnId"> & {
	/** The person's message, without a `with <model>:` that chose its model. Kept only until the turn ends. */
	text: string;
};

export type EnqueueResult =
	| { status: "started"; turnId: number; position: number }
	/** waitingFor: the running turn waits for this person's answer to its question. */
	| { status: "queued"; turnId: number; position: number; waitingFor?: string }
	| { status: "duplicate" }
	| { status: "queue_full" };

/** ts: a reply's Slack message, so a read of the thread that shows it isn't repeated from memory. */
export type MemoryEntry = { kind: "reply" | "tool"; text: string; at: number; ts: string | null };

/**
 * A message from the thread's history (conversations.replies), for one turn only.
 * role: a person, the agent itself, or another bot or app (name: what Slack shows for it).
 */
export type ContextEntry = { role: "user" | "assistant" | "app"; author: string | null; name?: string; text: string; ts: string | null };

/** What a turn's read of its thread returned (history.ts). Kept for that turn only. */
export type ThreadContext = {
	/** The thread's first message, when it falls before the messages read. */
	root: ContextEntry | null;
	/** The messages read, oldest first, without the one being answered. */
	messages: ContextEntry[];
	/** The read started at the thread's first message. */
	fromRoot: boolean;
	/** The stretch held more messages than Slack returned. */
	partial: boolean;
};

/** What a turn's read covered: the timestamps it returned from oldest to the answered message, and whether that was all of them. */
export type ThreadReadRecord = { oldest: string; ts: string[]; complete: boolean };

export type TurnInput = {
	text: string;
	context: ThreadContext | null;
	/** The reply message an earlier attempt of this turn started, if any. */
	replyTs: string | null;
	/** The reply text and tool notes, staged by the run until the turn ends. */
	stagedReply: string | null;
	stagedTools: string[];
	/** What each attempt of the run spent, in nanodollars, by attempt ("1", "2"; after question n, "n:1" and so on). */
	attemptCosts: Record<string, number>;
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
	model: string | null;
	status: "queued" | "running";
	started_at: number | null;
	/** Since when the turn has been going again after a question: posted (until it expires), answered or closed. */
	waiting_until: number | null;
};

/** What recording an answer did. */
export type AnswerResult =
	| { status: "answered"; turnId: number; question: QuestionState; askerId: string }
	| { status: "not_asker"; askerId: string }
	/** Answered already, expired, stopped, or the turn has ended. */
	| { status: "closed"; question: QuestionState | null; askerId: string | null };

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
		...(row.model ? { model: row.model } : {}),
	};
}

const TURN_COLUMNS = "id, thread_key, event_id, installation_id, team_id, channel, thread_ts, message_ts, slack_user_id, kind, model, status, started_at, waiting_until";

/** Columns added after the first release, created on objects that predate them. */
const ADDED_COLUMNS: Array<[table: string, name: string, type: string]> = [
	["turns", "context", "TEXT"],
	["turns", "reply_ts", "TEXT"],
	["turns", "staged_reply", "TEXT"],
	["turns", "staged_tools", "TEXT"],
	["turns", "attempt_costs", "TEXT"],
	["turns", "model", "TEXT"],
	["memory", "ts", "TEXT"],
	["turns", "waiting_until", "INTEGER"],
];

/** When a running turn that hasn't reported back is failed: TURN_TIMEOUT_MS after it started, or after its last question was posted or closed. */
function turnDeadline(turn: Pick<TurnRow, "started_at" | "waiting_until">): number | null {
	if (turn.started_at == null) return null;
	return Math.max(turn.started_at, turn.waiting_until ?? 0) + TURN_TIMEOUT_MS;
}

/** A turn's context as stored. Turns read before ThreadContext stored the messages alone. */
function storedContext(value: string): ThreadContext {
	const parsed = JSON.parse(value) as ThreadContext | ContextEntry[];
	if (!Array.isArray(parsed)) return parsed;
	return { root: null, messages: parsed.map((entry) => ({ ...entry, ts: entry.ts ?? null })), fromRoot: true, partial: false };
}

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
			started_at INTEGER
		)`);
		this.sql.exec("CREATE TABLE IF NOT EXISTS memory (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, text TEXT NOT NULL, at INTEGER NOT NULL)");
		this.sql.exec("CREATE TABLE IF NOT EXISTS known_messages (ts TEXT PRIMARY KEY)");
		this.sql.exec("CREATE TABLE IF NOT EXISTS link_offers (slack_user_id TEXT PRIMARY KEY, at INTEGER NOT NULL)");
		this.sql.exec("CREATE TABLE IF NOT EXISTS questions (turn_id INTEGER NOT NULL, n INTEGER NOT NULL, state TEXT NOT NULL, paused_run TEXT, PRIMARY KEY (turn_id, n))");
		// Columns added after the first release. CREATE TABLE IF NOT EXISTS leaves an
		// existing object's table as it was, so add whichever are missing.
		const columns = new Map<string, Set<string>>();
		for (const [table, name, type] of ADDED_COLUMNS) {
			if (!columns.has(table)) columns.set(table, new Set(this.sql.exec<{ name: string }>(`PRAGMA table_info(${table})`).toArray().map((column) => column.name)));
			if (!columns.get(table)!.has(name)) this.sql.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
		}
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
		const deadline = running ? turnDeadline(running) : null;
		await this.ctx.storage.setAlarm(deadline !== null ? Math.min(deleteAt, deadline) : deleteAt);
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
				`INSERT INTO turns (thread_key, event_id, installation_id, team_id, channel, thread_ts, message_ts, slack_user_id, kind, model, text, status, created_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?) RETURNING id`,
				request.threadKey, request.eventId, request.installationId, request.teamId, request.channel, request.threadTs,
				request.messageTs, request.slackUserId, request.kind, request.model ?? null, request.text.slice(0, MAX_MESSAGE_CHARS), now,
			).one();
			return { status: "queued", turnId: row.id, position: waiting + (this.running() ? 1 : 0) };
		});
		if (queued.status !== "queued") return queued;
		await this.touch(now);
		await this.startNext(now);
		const started = this.sql.exec<{ status: string }>("SELECT status FROM turns WHERE id = ?", queued.turnId).toArray()[0];
		// Gone already means a runner that finishes at once ran it.
		if (started?.status !== "queued") return { status: "started", turnId: queued.turnId, position: 0 };
		const running = this.running();
		const waiting = running ? this.openQuestion(running.id) : null;
		return running && waiting && running.slack_user_id !== request.slackUserId ? { ...queued, waitingFor: running.slack_user_id } : queued;
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
		const turn = this.sql.exec<TurnRow & { staged_reply: string | null; staged_tools: string | null; reply_ts: string | null }>(
			`SELECT ${TURN_COLUMNS}, staged_reply, staged_tools, reply_ts FROM turns WHERE id = ? AND status = 'running'`, turnId,
		).toArray()[0];
		if (!turn) return false;
		// A turn that staged its reply reports back with ids only.
		const reply = outcome.reply ?? turn.staged_reply ?? undefined;
		const tools = outcome.tools ?? (turn.staged_tools ? JSON.parse(turn.staged_tools) as string[] : []);
		const questions = this.questions(turnId);
		this.ctx.storage.transactionSync(() => {
			// The message and its thread history go with the turn; only the bot's side stays as working memory.
			this.sql.exec("DELETE FROM turns WHERE id = ?", turnId);
			this.sql.exec("DELETE FROM questions WHERE turn_id = ?", turnId);
			if (this.meta("cancel_turn_id") === String(turnId)) this.sql.exec("DELETE FROM meta WHERE key = 'cancel_turn_id'");
			const remember = (entry: { reply?: string; ts: string | null; tools: string[] }) => {
				for (const tool of entry.tools.slice(0, MAX_TOOLS_PER_TURN)) {
					if (tool.trim()) this.sql.exec("INSERT INTO memory (kind, text, at) VALUES ('tool', ?, ?)", tool.trim().slice(0, MAX_TOOL_CHARS), now);
				}
				if (entry.reply?.trim()) this.sql.exec("INSERT INTO memory (kind, text, at, ts) VALUES ('reply', ?, ?, ?)", entry.reply.trim().slice(0, MAX_REPLY_CHARS), now, entry.ts);
			};
			// An answer that asked questions: what it wrote before each, and each question with what became of it.
			for (const question of questions) {
				if (question.leg) remember(question.leg);
				if (question.ts) remember({ reply: questionMemory(question, turn.slack_user_id), ts: question.ts, tools: [] });
			}
			remember({ reply, ts: turn.reply_ts, tools });
			this.sql.exec("DELETE FROM memory WHERE id NOT IN (SELECT id FROM memory ORDER BY id DESC LIMIT ?)", MAX_MEMORY_ENTRIES);
			// The replies and questions are messages in the thread too.
			const posted = [...questions.flatMap((question) => [question.leg?.ts ?? null, question.ts]), turn.reply_ts].filter((ts): ts is string => ts !== null);
			if (posted.length) this.storeKnown([...this.knownMessages(), ...posted]);
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
	 * the queued ones. A turn waiting for an answer to its question is woken, so it
	 * stops now rather than when the question expires. Returns the running turn's
	 * id, if any.
	 */
	async cancel(now = Date.now()): Promise<{ cancelled: boolean; turnId: number | null; dropped: number }> {
		const running = this.running();
		const queued = this.sql.exec<TurnRow>(`SELECT ${TURN_COLUMNS} FROM turns WHERE status = 'queued'`).toArray();
		this.ctx.storage.transactionSync(() => {
			if (running) this.setMeta("cancel_turn_id", String(running.id));
			this.sql.exec("DELETE FROM turns WHERE status = 'queued'");
		});
		for (const turn of queued) await this.releaseMeter(turn);
		const waiting = running ? this.openQuestion(running.id) : null;
		if (running && waiting) await this.wake(running, waiting.n);
		await this.touch(now);
		return { cancelled: Boolean(running) || queued.length > 0, turnId: running?.id ?? null, dropped: queued.length };
	}

	/** Tells a turn's Workflow that its question has an answer, or that it should stop waiting. A failure only leaves it to the question's timeout. */
	private async wake(turn: TurnRow, n: number): Promise<void> {
		try {
			await this.runner.wake?.(turnRef(turn), n);
		} catch (error) {
			console.error("[slack-agent] waiting turn not woken", { turnId: turn.id, question: n, error: error instanceof Error ? error.message : "unknown" });
		}
	}

	private questions(turnId: number): QuestionState[] {
		return this.sql.exec<{ state: string }>("SELECT state FROM questions WHERE turn_id = ? ORDER BY n", turnId).toArray().map((row) => JSON.parse(row.state) as QuestionState);
	}

	/** A turn's question n, while the turn is queued or running. */
	question(turnId: number, n: number): QuestionState | null {
		const row = this.sql.exec<{ state: string }>("SELECT state FROM questions WHERE turn_id = ? AND n = ?", turnId, n).toArray()[0];
		return row ? JSON.parse(row.state) as QuestionState : null;
	}

	private saveQuestion(turnId: number, question: QuestionState): void {
		this.sql.exec("UPDATE questions SET state = ? WHERE turn_id = ? AND n = ?", JSON.stringify(question), turnId, question.n);
	}

	/** The person a running turn answers (the only one who may answer its questions), or null when it isn't running. */
	askerOf(turnId: number): string | null {
		const running = this.running();
		return running?.id === turnId ? running.slack_user_id : null;
	}

	/** The running turn's question that is posted and waiting for its answer. */
	private openQuestion(turnId: number): QuestionState | null {
		return this.questions(turnId).find((question) => question.status === "open") ?? null;
	}

	/**
	 * The run paused for the person's answer: keeps the paused run and question n
	 * until the turn ends. A retried run replaces its own question while it is
	 * still unposted, never one that was posted. False when the turn has ended,
	 * or the paused run is too big to keep.
	 */
	holdForAnswer(turnId: number, n: number, input: { run: string; question: QuestionDraft }): boolean {
		if (input.run.length > MAX_PAUSED_RUN_CHARS) return false;
		return this.ctx.storage.transactionSync(() => {
			if (!this.sql.exec("SELECT 1 FROM turns WHERE id = ? AND status = 'running'", turnId).toArray().length) return false;
			const existing = this.question(turnId, n);
			if (existing && existing.status !== "pending") return false;
			const question: QuestionState = { ...input.question, n, status: "pending", ts: null, expiresAt: null, answer: null, leg: null };
			this.sql.exec(
				"INSERT INTO questions (turn_id, n, state, paused_run) VALUES (?, ?, ?, ?) ON CONFLICT (turn_id, n) DO UPDATE SET state = excluded.state, paused_run = excluded.paused_run",
				turnId, n, JSON.stringify(question), input.run,
			);
			return true;
		});
	}

	/** The paused run question n continues, once it is answered. */
	pausedRun(turnId: number, n: number): { run: string; question: QuestionState } | null {
		const row = this.sql.exec<{ state: string; paused_run: string | null }>("SELECT state, paused_run FROM questions WHERE turn_id = ? AND n = ?", turnId, n).toArray()[0];
		return row?.paused_run ? { run: row.paused_run, question: JSON.parse(row.state) as QuestionState } : null;
	}

	/**
	 * Before question n is posted, the reply written so far is finished: it moves
	 * from the turn's staged reply to the question, so the answer after the
	 * question starts a new message. Safe to repeat.
	 */
	closeLegReply(turnId: number, n: number): void {
		this.ctx.storage.transactionSync(() => {
			const question = this.question(turnId, n);
			const turn = this.sql.exec<{ staged_reply: string | null; staged_tools: string | null; reply_ts: string | null }>(
				"SELECT staged_reply, staged_tools, reply_ts FROM turns WHERE id = ?", turnId,
			).toArray()[0];
			if (!question || question.leg || !turn) return;
			question.leg = { reply: turn.staged_reply ?? "", ts: turn.reply_ts, tools: turn.staged_tools ? JSON.parse(turn.staged_tools) as string[] : [] };
			this.saveQuestion(turnId, question);
			this.sql.exec("UPDATE turns SET staged_reply = NULL, staged_tools = NULL, reply_ts = NULL WHERE id = ?", turnId);
		});
	}

	/**
	 * Question n's message is in Slack: it opens for an hour. Recorded as soon as
	 * Slack returns the ts, so a retry updates the message instead of posting it
	 * again. Earlier paused runs are dropped: their answers have run. Returns the
	 * question as it is now (a quick answer may already be in).
	 */
	async questionPosted(turnId: number, n: number, ts: string, now = Date.now()): Promise<QuestionState | null> {
		const question = this.ctx.storage.transactionSync(() => {
			const current = this.question(turnId, n);
			if (!current) return null;
			current.ts ??= ts;
			// Stopped while the question was being posted: cancel() found nothing open to wake, so it never opens.
			if (current.status === "pending" && this.isCancelled(turnId)) current.status = "cancelled";
			if (current.status === "pending") {
				current.status = "open";
				current.expiresAt = now + QUESTION_TIMEOUT_MS;
				this.sql.exec("UPDATE turns SET waiting_until = ? WHERE id = ?", current.expiresAt, turnId);
			}
			this.saveQuestion(turnId, current);
			this.sql.exec("UPDATE questions SET paused_run = NULL WHERE turn_id = ? AND n < ?", turnId, n);
			return current;
		});
		if (question) await this.touch(now);
		return question;
	}

	/**
	 * An answer to the running turn's question n. Only the person the turn answers
	 * may answer, and only once, while the question is open. The answer wakes the
	 * turn's Workflow.
	 */
	async answerQuestion(input: { turnId: number; n: number; slackUserId: string; answer: QuestionAnswer; now?: number }): Promise<AnswerResult> {
		const now = input.now ?? Date.now();
		const running = this.running();
		if (!running || running.id !== input.turnId) return { status: "closed", question: null, askerId: null };
		const result = this.ctx.storage.transactionSync((): AnswerResult => {
			const question = this.question(running.id, input.n);
			if (!question) return { status: "closed", question: null, askerId: running.slack_user_id };
			if (input.slackUserId !== running.slack_user_id) return { status: "not_asker", askerId: running.slack_user_id };
			const expired = question.expiresAt !== null && question.expiresAt <= now;
			if (question.status !== "open" || expired || this.isCancelled(running.id)) return { status: "closed", question, askerId: running.slack_user_id };
			const choice = input.answer.by === "button" && input.answer.choice !== null && question.options[input.answer.choice] !== undefined ? input.answer.choice : null;
			if (input.answer.by === "button" && choice === null) return { status: "closed", question, askerId: running.slack_user_id };
			const text = choice !== null ? question.options[choice] : input.answer.text.trim().slice(0, MAX_OWN_ANSWER_CHARS);
			if (!text) return { status: "closed", question, askerId: running.slack_user_id };
			question.status = "answered";
			question.answer = { by: input.answer.by, choice, text };
			this.saveQuestion(running.id, question);
			// The answer starts the turn's next run: its timeout counts from here.
			this.sql.exec("UPDATE turns SET waiting_until = ? WHERE id = ?", now, running.id);
			return { status: "answered", turnId: running.id, question, askerId: running.slack_user_id };
		});
		if (result.status === "answered") {
			await this.wake(running, input.n);
			await this.touch(now);
		}
		return result;
	}

	/**
	 * A message from the person the running turn waits on, while its question is
	 * open, is their answer. Null when it isn't one (no open question, or someone
	 * else wrote it): it is a new message to answer.
	 */
	async answerWithMessage(input: { slackUserId: string; text: string; now?: number }): Promise<Extract<AnswerResult, { status: "answered" }> | null> {
		const running = this.running();
		const question = running ? this.openQuestion(running.id) : null;
		if (!running || !question || running.slack_user_id !== input.slackUserId || !input.text.trim()) return null;
		const result = await this.answerQuestion({ turnId: running.id, n: question.n, slackUserId: input.slackUserId, answer: { by: "message", choice: null, text: input.text }, now: input.now });
		return result.status === "answered" ? result : null;
	}

	/**
	 * The turn stops waiting on question n: answered, or else stopped (the thread
	 * was cancelled, or `stop`: the installation no longer answers) or expired.
	 * Later clicks are told it is closed. Null when the turn has ended.
	 */
	async closeQuestion(turnId: number, n: number, options: { stop?: boolean; now?: number } = {}): Promise<QuestionState | null> {
		const now = options.now ?? Date.now();
		const question = this.ctx.storage.transactionSync(() => {
			const current = this.question(turnId, n);
			if (!current) return null;
			if (current.status === "pending" || current.status === "open") {
				current.status = this.isCancelled(turnId) || options.stop ? "cancelled" : "expired";
				this.saveQuestion(turnId, current);
				this.sql.exec("UPDATE turns SET waiting_until = ? WHERE id = ?", now, turnId);
			}
			return current;
		});
		if (question) await this.touch(now);
		return question;
	}

	/** For the running turn, between steps. */
	isCancelled(turnId: number): boolean {
		return this.meta("cancel_turn_id") === String(turnId);
	}

	/** What a turn works from, while it is queued or running: its message, thread history, reply and working memory. */
	turnInput(turnId: number): TurnInput | null {
		const row = this.sql.exec<{ text: string; context: string | null; reply_ts: string | null; staged_reply: string | null; staged_tools: string | null; attempt_costs: string | null }>(
			"SELECT text, context, reply_ts, staged_reply, staged_tools, attempt_costs FROM turns WHERE id = ?", turnId,
		).toArray()[0];
		if (!row) return null;
		return {
			text: row.text,
			context: row.context ? storedContext(row.context) : null,
			replyTs: row.reply_ts,
			stagedReply: row.staged_reply,
			stagedTools: row.staged_tools ? JSON.parse(row.staged_tools) as string[] : [],
			attemptCosts: row.attempt_costs ? JSON.parse(row.attempt_costs) as Record<string, number> : {},
			memory: this.workingMemory(),
		};
	}

	/** The thread's recent messages for one turn; deleted with the turn. */
	setTurnContext(turnId: number, context: ThreadContext): void {
		const trim = (entry: ContextEntry): ContextEntry => ({
			role: entry.role,
			author: entry.author,
			...(entry.name ? { name: entry.name } : {}),
			text: entry.text.slice(0, MAX_CONTEXT_CHARS),
			ts: entry.ts,
		});
		const kept: ThreadContext = {
			root: context.root ? trim(context.root) : null,
			messages: context.messages.slice(-MAX_CONTEXT_ENTRIES).map(trim),
			fromRoot: context.fromRoot,
			partial: context.partial,
		};
		this.sql.exec("UPDATE turns SET context = ? WHERE id = ?", JSON.stringify(kept), turnId);
	}

	/** Timestamps of the thread's newest messages known to follow one another, oldest first. */
	knownMessages(): string[] {
		return this.sql.exec<{ ts: string }>("SELECT ts FROM known_messages").toArray().map((row) => row.ts).sort(compareTs);
	}

	private storeKnown(timestamps: string[]): void {
		const kept = [...new Set(timestamps)].sort(compareTs).slice(-MAX_KNOWN_MESSAGES);
		this.sql.exec("DELETE FROM known_messages");
		for (const ts of kept) this.sql.exec("INSERT INTO known_messages (ts) VALUES (?)", ts);
	}

	/**
	 * After a turn's read of the thread. A complete read keeps everything it
	 * returned, and the known messages before it when it started at one of them
	 * (a read that started at a time instead may have skipped some). After a
	 * partial or failed read, nothing before the turn's own message is known to
	 * follow on, so the next read starts there. Known messages after it (replies
	 * to earlier turns) stay either way.
	 */
	recordThreadRead(turnId: number, read: ThreadReadRecord | null): void {
		const turn = this.sql.exec<{ message_ts: string }>("SELECT message_ts FROM turns WHERE id = ?", turnId).toArray()[0];
		if (!turn) return;
		this.ctx.storage.transactionSync(() => {
			const known = this.knownMessages();
			const after = known.filter((ts) => compareTs(ts, turn.message_ts) > 0);
			const joined = read?.complete === true && known.some((ts) => compareTs(ts, read.oldest) === 0);
			const before = joined ? known.filter((ts) => compareTs(ts, read.oldest) < 0) : [];
			this.storeKnown([...before, ...(read?.complete ? read.ts : []), turn.message_ts, ...after]);
		});
	}

	/** True the first time a person is sent the Connect button in this thread. */
	claimLinkOffer(slackUserId: string, now = Date.now()): boolean {
		return this.ctx.storage.transactionSync(() => {
			if (this.sql.exec("SELECT 1 FROM link_offers WHERE slack_user_id = ?", slackUserId).toArray().length) return false;
			this.sql.exec("INSERT INTO link_offers (slack_user_id, at) VALUES (?, ?)", slackUserId, now);
			return true;
		});
	}

	/** The button never reached them, so a later question can send it. */
	releaseLinkOffer(slackUserId: string): void {
		this.sql.exec("DELETE FROM link_offers WHERE slack_user_id = ?", slackUserId);
	}

	/** Records the reply message as soon as Slack returns it, so a retried run updates it instead of posting again. */
	setReplyTs(turnId: number, ts: string): void {
		this.sql.exec("UPDATE turns SET reply_ts = coalesce(reply_ts, ?) WHERE id = ?", ts, turnId);
	}

	/**
	 * The run's reply and tool notes so far, staged after every agent step for the
	 * reply step to deliver and moved to working memory when the turn ends, with
	 * what this attempt has spent, so a retried run counts it against the turn's cap.
	 */
	stageTurnOutput(turnId: number, output: { attempt: number | string; costNanos: number; reply: string; tools: string[] }): void {
		this.ctx.storage.transactionSync(() => {
			const row = this.sql.exec<{ attempt_costs: string | null }>("SELECT attempt_costs FROM turns WHERE id = ?", turnId).toArray()[0];
			if (!row) return;
			const costs = row.attempt_costs ? JSON.parse(row.attempt_costs) as Record<string, number> : {};
			costs[String(output.attempt)] = Math.max(costs[String(output.attempt)] ?? 0, Math.round(output.costNanos));
			this.sql.exec(
				"UPDATE turns SET staged_reply = ?, staged_tools = ?, attempt_costs = ? WHERE id = ?",
				output.reply.slice(0, MAX_MESSAGE_CHARS), JSON.stringify(output.tools.slice(0, MAX_TOOLS_PER_TURN).map((tool) => tool.slice(0, MAX_TOOL_CHARS))),
				JSON.stringify(costs), turnId,
			);
		});
	}

	/** The bot's earlier replies and tool summaries in this thread, oldest first. */
	workingMemory(): MemoryEntry[] {
		return this.sql.exec<MemoryEntry>("SELECT kind, text, at, ts FROM memory ORDER BY id").toArray();
	}

	/** What the thread holds, for tests and diagnostics. Never includes text. */
	status(): { running: number | null; queued: number; events: number; memory: number } {
		const count = (table: string, where = "") => this.sql.exec<{ count: number }>(`SELECT count(*) AS count FROM ${table} ${where}`).one().count;
		return { running: this.running()?.id ?? null, queued: count("turns", "WHERE status = 'queued'"), events: count("events"), memory: count("memory") };
	}

	async alarm(): Promise<void> {
		const now = Date.now();
		const running = this.running();
		const deadline = running ? turnDeadline(running) : null;
		if (running && deadline !== null && deadline <= now) {
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
