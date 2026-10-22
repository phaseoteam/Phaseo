import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";
import { refreshInstallationBotToken, type Installation } from "./installations";
import { PLAN_TIERS, slackAgentMonthlyCharge, slackAgentPlanNanos } from "./lib/slackAgentPricing";
import { createDb, type Db } from "./supabase";

// WorkspaceMeter: one per installation. It decides who gets an answer this UTC
// month and counts what is billed for it. Because there is exactly one per
// installation and admit() reads and writes in one synchronous transaction, two
// new people arriving together can't both slip past a limit.
//
// - admit() runs before an answer starts. It applies the installation's rules
//   (bots, Slack Connect users, guests, status, plan people, max people, the
//   monthly spending cap, answers per person per hour) and, when it allows, holds
//   a place: the person joins this month's set and the answer is pending.
// - recordAnswer() counts an answer once it has been given, in the month it was
//   admitted in (an answer started before midnight UTC passed that month's
//   limits, not the next one's); release() drops a pending answer that was never
//   given (a failed or cancelled turn).
// - Answers and first-answer times are sent to Postgres (record_slack_agent_people)
//   as running totals, at most about once a minute from an alarm, so a repeated
//   flush can only confirm a count. Only people with an answer are sent: someone
//   whose only turn failed is never billed.
// - Every query is scoped to the UTC month, so a new month starts empty; the
//   alarm flushes what is left of the old month and deletes it once its answers
//   in progress are counted or dropped.
// - uninstalled() closes the meter for good when the app is removed in Slack.
// - Thread reads: Slack limits conversations.replies per app and workspace (about
//   one a minute for apps outside the Slack Marketplace). When a read gets 429,
//   pauseHistoryReads() keeps its Retry-After, and every thread of the
//   installation skips its read until then. Reads aren't spaced otherwise: Slack
//   tolerates small bursts, and a read it refuses only costs that turn its read,
//   which spacing would have skipped anyway.
// It keeps Slack user ids and counts only, never message text.

const FLUSH_INTERVAL_MS = 60_000;
/** A short wait before the first flush, so a burst of answers goes in one call. */
const FLUSH_DELAY_MS = 10_000;
const FLUSH_BATCH = 1_000;
const MAX_BATCHES_PER_ALARM = 20;
/** A pending answer older than this is assumed lost (its turn never reported back). */
const PENDING_TTL_MS = 30 * 60_000;
/** Answered event ids are kept this long so a retried recordAnswer counts once. */
const ANSWERED_TTL_MS = 2 * 24 * 60 * 60_000;
const HOUR_MS = 60 * 60_000;
/** Used when Slack's Retry-After is missing or unreadable. */
const DEFAULT_RETRY_AFTER_SECONDS = 60;
/** The longest pause a Retry-After can set; Slack's windows are a minute. */
const MAX_HISTORY_PAUSE_MS = HOUR_MS;

export type MeterSettings = Pick<Installation,
	"id" | "workspace_id" | "status" | "plan_people" | "over_plan" | "max_people" | "monthly_cap_nanos"
	| "answers_per_person_hour" | "allow_guests" | "allow_external_users">;

export type UserFacts = {
	isBot: boolean;
	/** From another organisation, in a Slack Connect channel. */
	isExternal: boolean;
	/** A single- or multi-channel guest. */
	isGuest: boolean;
};

export type RefuseReason =
	| "bot" | "uninstalled" | "paused" | "payment_due" | "external_user" | "guest"
	| "max_people" | "plan_full" | "hourly_limit" | "monthly_cap";

/** A plan: the most people it covers and its monthly price. */
export type Tier = { people: number; priceNanos: number };

export type AdmitResult =
	| { allowed: true; newPerson: boolean; people: number; tier: Tier }
	/** auditForAdmins: record this refusal in the workspace audit log (once a month per kind). */
	| { allowed: false; reason: RefuseReason; people: number; tier: Tier; auditForAdmins: boolean };

export type AdmitInput = {
	settings: MeterSettings;
	slackUserId: string;
	facts: UserFacts;
	/** The Slack event the answer is for; admitting it again is a no-op. */
	eventId: string;
	now?: number;
};

export type FlushedPerson = { slack_user_id: string; first_answer_at: string; answers: number };

/** The first day of the UTC month, as the date the billing tables use. */
export function periodStart(now: number): string {
	const date = new Date(now);
	return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function nextPeriodStart(now: number): number {
	const date = new Date(now);
	return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}

/** The plan covering this many people: the smallest standard plan, or the per-person price above them. */
export function tierFor(people: number): Tier {
	const count = Math.max(1, Math.ceil(people));
	const tier = PLAN_TIERS.find((entry) => count <= entry.people);
	return tier ? { people: tier.people, priceNanos: tier.priceNanos } : { people: count, priceNanos: slackAgentPlanNanos(count) };
}

/** Which refusals go in the workspace audit log, at most once a month per key. Null: none (it is expected, or the admin caused it). */
function noticeKey(reason: RefuseReason, slackUserId: string): string | null {
	switch (reason) {
		case "plan_full":
		case "max_people":
		case "monthly_cap":
			return reason;
		case "external_user":
		case "guest":
		case "hourly_limit":
			return `${reason}:${slackUserId}`;
		default:
			return null;
	}
}

type PersonRow = { admitted_at: number; first_answer_at: number | null; answers: number; hour: number; hour_admits: number };

export class WorkspaceMeter extends DurableObject<Env> {
	/** Postgres; replaced in tests. */
	db: Db;
	/** Sends running totals to Postgres; replaced in tests. */
	recordPeople: (installationId: string, period: string, people: FlushedPerson[]) => Promise<void>;
	private refreshing: Promise<string | null> | null = null;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.db = createDb(env);
		this.recordPeople = async (installationId, period, people) => {
			await this.db.rpc("record_slack_agent_people", { p_installation_id: installationId, p_period_start: period, p_people: people });
		};
		this.migrate();
	}

	private get sql() {
		return this.ctx.storage.sql;
	}

	private migrate(): void {
		this.sql.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
		this.sql.exec("CREATE TABLE IF NOT EXISTS months (period TEXT PRIMARY KEY, people INTEGER NOT NULL DEFAULT 0, answers INTEGER NOT NULL DEFAULT 0)");
		this.sql.exec(`CREATE TABLE IF NOT EXISTS people (
			period TEXT NOT NULL,
			slack_user_id TEXT NOT NULL,
			admitted_at INTEGER NOT NULL,
			first_answer_at INTEGER,
			answers INTEGER NOT NULL DEFAULT 0,
			flushed_answers INTEGER NOT NULL DEFAULT 0,
			hour INTEGER NOT NULL DEFAULT 0,
			hour_admits INTEGER NOT NULL DEFAULT 0,
			PRIMARY KEY (period, slack_user_id)
		)`);
		this.sql.exec("CREATE INDEX IF NOT EXISTS people_unflushed ON people (period, slack_user_id) WHERE answers > flushed_answers");
		this.sql.exec("CREATE TABLE IF NOT EXISTS pending (event_id TEXT PRIMARY KEY, period TEXT NOT NULL, slack_user_id TEXT NOT NULL, at INTEGER NOT NULL)");
		this.sql.exec("CREATE TABLE IF NOT EXISTS answered (event_id TEXT PRIMARY KEY, at INTEGER NOT NULL)");
		this.sql.exec("CREATE TABLE IF NOT EXISTS notices (period TEXT NOT NULL, key TEXT NOT NULL, PRIMARY KEY (period, key))");
	}

	private meta(key: string): string | null {
		const row = this.sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = ?", key).toArray()[0];
		return row ? row.value : null;
	}

	private setMeta(key: string, value: string): void {
		this.sql.exec("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", key, value);
	}

	private month(period: string): { people: number; answers: number } {
		this.sql.exec("INSERT OR IGNORE INTO months (period) VALUES (?)", period);
		return this.sql.exec<{ people: number; answers: number }>("SELECT people, answers FROM months WHERE period = ?", period).one();
	}

	private person(period: string, slackUserId: string): PersonRow | null {
		return this.sql.exec<PersonRow>(
			"SELECT admitted_at, first_answer_at, answers, hour, hour_admits FROM people WHERE period = ? AND slack_user_id = ?",
			period, slackUserId,
		).toArray()[0] ?? null;
	}

	/** Whether this person may get an answer now; when allowed, holds their place and the pending answer. */
	admit(input: AdmitInput): AdmitResult {
		const now = input.now ?? Date.now();
		return this.ctx.storage.transactionSync(() => this.admitNow(input, now));
	}

	private admitNow(input: AdmitInput, now: number): AdmitResult {
		const { settings, slackUserId, facts, eventId } = input;
		const period = periodStart(now);
		if (!this.meta("installation_id")) this.setMeta("installation_id", settings.id);
		this.sql.exec("DELETE FROM pending WHERE at <= ?", now - PENDING_TTL_MS);
		const month = this.month(period);
		const person = this.person(period, slackUserId);
		const refuse = (reason: RefuseReason, people = month.people): AdmitResult => {
			const key = noticeKey(reason, slackUserId);
			let auditForAdmins = false;
			if (key && !this.sql.exec("SELECT 1 FROM notices WHERE period = ? AND key = ?", period, key).toArray().length) {
				this.sql.exec("INSERT INTO notices (period, key) VALUES (?, ?)", period, key);
				auditForAdmins = true;
			}
			return { allowed: false, reason, people, tier: tierFor(Math.max(people, settings.plan_people)), auditForAdmins };
		};

		// A retried event that was already admitted keeps its place.
		if (this.sql.exec("SELECT 1 FROM pending WHERE event_id = ?", eventId).toArray().length) {
			return { allowed: true, newPerson: false, people: month.people, tier: tierFor(Math.max(month.people, settings.plan_people)) };
		}

		if (facts.isBot) return refuse("bot");
		// Removed in Slack: an event that read the installation just before that gets nothing.
		if (this.meta("uninstalled_at") || settings.status === "uninstalled") return refuse("uninstalled");
		if (settings.status === "paused") return refuse("paused");
		if (settings.status !== "active") return refuse("payment_due");
		if (facts.isExternal && !settings.allow_external_users) return refuse("external_user");
		if (facts.isGuest && !settings.allow_guests) return refuse("guest");

		const newPerson = person === null;
		const people = month.people + (newPerson ? 1 : 0);
		if (newPerson) {
			if (settings.max_people != null && people > settings.max_people) return refuse("max_people");
			if (people > settings.plan_people && settings.over_plan !== "move_up") return refuse("plan_full");
		}

		const hour = Math.floor(now / HOUR_MS);
		const hourAdmits = person && person.hour === hour ? person.hour_admits : 0;
		if (hourAdmits >= settings.answers_per_person_hour) return refuse("hourly_limit");

		// The month's charge with this answer and every answer still in progress.
		const pending = this.sql.exec<{ count: number }>("SELECT count(*) AS count FROM pending WHERE period = ?", period).one().count;
		const charge = slackAgentMonthlyCharge({ people, answers: month.answers + pending + 1 });
		if (charge.totalNanos > Number(settings.monthly_cap_nanos)) return refuse("monthly_cap");

		if (newPerson) {
			this.sql.exec(
				"INSERT INTO people (period, slack_user_id, admitted_at, hour, hour_admits) VALUES (?, ?, ?, ?, 1)",
				period, slackUserId, now, hour,
			);
			this.sql.exec("UPDATE months SET people = people + 1 WHERE period = ?", period);
		} else {
			this.sql.exec("UPDATE people SET hour = ?, hour_admits = ? WHERE period = ? AND slack_user_id = ?", hour, hourAdmits + 1, period, slackUserId);
		}
		this.sql.exec("INSERT INTO pending (event_id, period, slack_user_id, at) VALUES (?, ?, ?, ?)", eventId, period, slackUserId, now);
		return { allowed: true, newPerson, people, tier: tierFor(Math.max(people, settings.plan_people)) };
	}

	/** Counts a given answer (once per event) and schedules a flush. */
	async recordAnswer(input: { eventId: string; slackUserId: string; now?: number }): Promise<{ counted: boolean }> {
		const now = input.now ?? Date.now();
		const counted = this.ctx.storage.transactionSync(() => {
			if (this.sql.exec("SELECT 1 FROM answered WHERE event_id = ?", input.eventId).toArray().length) return false;
			this.sql.exec("INSERT INTO answered (event_id, at) VALUES (?, ?)", input.eventId, now);
			// The answer counts in the month it was admitted in, whose limits it passed, even when it
			// finishes after midnight. A place that was released or expired meanwhile falls back to the
			// latest month the person holds one; a person with no place is never added unchecked.
			const admitted = this.sql.exec<{ period: string }>("SELECT period FROM pending WHERE event_id = ?", input.eventId).toArray()[0];
			const period = admitted?.period ?? this.sql.exec<{ period: string }>(
				"SELECT period FROM people WHERE slack_user_id = ? AND period <= ? ORDER BY period DESC LIMIT 1",
				input.slackUserId, periodStart(now),
			).toArray()[0]?.period;
			this.sql.exec("DELETE FROM pending WHERE event_id = ?", input.eventId);
			if (!period || !this.person(period, input.slackUserId)) {
				console.warn("[slack-agent] answer not counted: the person holds no place", { installationId: this.meta("installation_id") });
				return false;
			}
			this.month(period);
			this.sql.exec(
				"UPDATE people SET answers = answers + 1, first_answer_at = coalesce(first_answer_at, ?) WHERE period = ? AND slack_user_id = ?",
				now, period, input.slackUserId,
			);
			this.sql.exec("UPDATE months SET answers = answers + 1 WHERE period = ?", period);
			return true;
		});
		if (counted) await this.scheduleFlush(now);
		return { counted };
	}

	/** Drops a pending answer that was never given. */
	release(input: { eventId: string }): void {
		this.sql.exec("DELETE FROM pending WHERE event_id = ?", input.eventId);
	}

	/**
	 * The app was removed in Slack: nothing more is admitted and answers in progress
	 * are dropped. Answers already given are still sent, since this month is billed.
	 * A reinstall is a new installation with its own meter.
	 */
	uninstalled(now = Date.now()): void {
		this.ctx.storage.transactionSync(() => {
			if (!this.meta("uninstalled_at")) this.setMeta("uninstalled_at", String(now));
			this.sql.exec("DELETE FROM pending");
		});
	}

	/** This month's counts as the meter sees them (people includes anyone holding a place). */
	usage(now = Date.now()): { period: string; people: number; answers: number; pending: number } {
		const period = periodStart(now);
		const month = this.month(period);
		const pending = this.sql.exec<{ count: number }>("SELECT count(*) AS count FROM pending WHERE period = ? AND at > ?", period, now - PENDING_TTL_MS).one().count;
		return { period, ...month, pending };
	}

	/** Until when Slack asked this installation not to read threads (its last Retry-After), or null when reads may go ahead. */
	historyReadsPausedUntil(now = Date.now()): number | null {
		const until = Number(this.meta("history_paused_until") ?? 0);
		return until > now ? until : null;
	}

	/** A thread read got 429: no thread of this installation reads again until Retry-After has passed. */
	pauseHistoryReads(input: { retryAfterSeconds?: number; now?: number }): { until: number } {
		const now = input.now ?? Date.now();
		const seconds = input.retryAfterSeconds !== undefined && Number.isFinite(input.retryAfterSeconds) && input.retryAfterSeconds > 0
			? input.retryAfterSeconds
			: DEFAULT_RETRY_AFTER_SECONDS;
		// A longer pause already set (another thread's 429) stays.
		const until = Math.max(Number(this.meta("history_paused_until") ?? 0), now + Math.min(Math.ceil(seconds * 1000), MAX_HISTORY_PAUSE_MS));
		this.setMeta("history_paused_until", String(until));
		return { until };
	}

	/**
	 * The installation's bot token after refreshing it, when Slack rotates it.
	 * The meter is the installation's one serial point, so concurrent events share
	 * one refresh (Slack's refresh tokens are single use).
	 */
	async refreshBotToken(installationId: string): Promise<string | null> {
		this.refreshing ??= refreshInstallationBotToken(this.env, this.db, installationId).finally(() => {
			this.refreshing = null;
		});
		return this.refreshing;
	}

	private async scheduleFlush(now: number): Promise<void> {
		const lastFlush = Number(this.meta("last_flush_at") ?? 0);
		const due = Math.max(now + FLUSH_DELAY_MS, lastFlush + FLUSH_INTERVAL_MS);
		const current = await this.ctx.storage.getAlarm();
		if (current === null || current > due) await this.ctx.storage.setAlarm(due);
	}

	/** Sends every unflushed person's running totals, in batches of at most 1,000. Returns whether any are left. */
	async flush(now = Date.now()): Promise<boolean> {
		const installationId = this.meta("installation_id");
		if (!installationId) return false;
		let batches = 0;
		const periods = this.sql.exec<{ period: string }>("SELECT DISTINCT period FROM people WHERE answers > flushed_answers ORDER BY period").toArray();
		for (const { period } of periods) {
			while (batches < MAX_BATCHES_PER_ALARM) {
				const rows = this.sql.exec<{ slack_user_id: string; first_answer_at: number; answers: number }>(
					"SELECT slack_user_id, first_answer_at, answers FROM people WHERE period = ? AND answers > flushed_answers ORDER BY slack_user_id LIMIT ?",
					period, FLUSH_BATCH,
				).toArray();
				if (!rows.length) break;
				batches += 1;
				await this.recordPeople(installationId, period, rows.map((row) => ({
					slack_user_id: row.slack_user_id,
					first_answer_at: new Date(row.first_answer_at).toISOString(),
					answers: row.answers,
				})));
				// Answers given while the call was out stay unflushed for the next one.
				for (const row of rows) {
					this.sql.exec(
						"UPDATE people SET flushed_answers = max(flushed_answers, ?) WHERE period = ? AND slack_user_id = ?",
						row.answers, period, row.slack_user_id,
					);
				}
				if (rows.length < FLUSH_BATCH) break;
			}
		}
		this.setMeta("last_flush_at", String(now));
		return this.sql.exec("SELECT 1 FROM people WHERE answers > flushed_answers LIMIT 1").toArray().length > 0;
	}

	/** Removes finished months (flushed in full, no answer still in progress), expired pending answers and old answered ids. */
	private cleanUp(now: number): void {
		this.sql.exec("DELETE FROM pending WHERE at <= ?", now - PENDING_TTL_MS);
		this.sql.exec("DELETE FROM answered WHERE at <= ?", now - ANSWERED_TTL_MS);
		const period = periodStart(now);
		const done = this.sql.exec<{ period: string }>(
			`SELECT period FROM months WHERE period < ?
				AND NOT EXISTS (SELECT 1 FROM people WHERE people.period = months.period AND answers > flushed_answers)
				AND NOT EXISTS (SELECT 1 FROM pending WHERE pending.period = months.period)`,
			period,
		).toArray();
		for (const row of done) {
			this.sql.exec("DELETE FROM people WHERE period = ?", row.period);
			this.sql.exec("DELETE FROM notices WHERE period = ?", row.period);
			this.sql.exec("DELETE FROM months WHERE period = ?", row.period);
		}
	}

	async alarm(): Promise<void> {
		const now = Date.now();
		let unflushed: boolean;
		try {
			unflushed = await this.flush(now);
		} catch (error) {
			console.error("[slack-agent] meter flush failed", { installationId: this.meta("installation_id"), error: error instanceof Error ? error.message : "unknown" });
			await this.ctx.storage.setAlarm(now + FLUSH_INTERVAL_MS);
			return;
		}
		this.cleanUp(now);
		if (unflushed) {
			await this.ctx.storage.setAlarm(now + FLUSH_INTERVAL_MS);
		} else if (this.sql.exec("SELECT 1 FROM months WHERE period < ? LIMIT 1", periodStart(now)).toArray().length) {
			// Last month still has answers in progress: close it once they are counted or dropped.
			await this.ctx.storage.setAlarm(now + FLUSH_INTERVAL_MS);
		} else if (this.sql.exec("SELECT 1 FROM months LIMIT 1").toArray().length) {
			// Wake once at the start of next month to close this one.
			await this.ctx.storage.setAlarm(nextPeriodStart(now) + FLUSH_INTERVAL_MS);
		}
	}
}
