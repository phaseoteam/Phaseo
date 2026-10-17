import { DurableObject } from "cloudflare:workers";
import type { GatewayBindings } from "@/runtime/env.types";
import {
	DEFAULT_CUSTOMER_LIMITS, parseCustomerLimits,
	type CustomerAdmission, type CustomerLimits,
} from "@core/customer-rate-limits";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
// A restart forgets at most this much of the minute window.
const MINUTE_CHECKPOINT_INTERVAL_MS = 5_000;

/**
 * Exact per-scope admission counter.
 *
 * The rolling minute log is held in memory and checkpointed as one SQLite row
 * at most every few seconds, so deploys and restarts cannot hand a scope a
 * fresh allowance, at a bounded number of billed row writes rather than one
 * per admission. Daily free-model admissions stay in SQLite exactly.
 *
 * Rate limit policy scopes also keep a rolling minute of token usage, charged
 * after each request attempt completes with its real usage, in one-second
 * buckets (at most 60, however busy the scope) checkpointed the same way.
 *
 * Limits are supplied by the caller (see `resolveCustomerLimits`); this object
 * performs no KV or network reads.
 */
export class CustomerRateLimitDurableObject extends DurableObject<GatewayBindings> {
	private scope: string | null = null;
	/** Admission ID -> start time, in arrival order. */
	private readonly minute = new Map<string, number>();
	private lastMinuteCheckpoint = 0;
	/** Second (epoch ms) -> tokens charged in it, oldest first. */
	private readonly tokens = new Map<number, number>();
	private tokensUsed = 0;
	private lastTokenCheckpoint = 0;
	private freeDay = -1;
	private freeUsed = 0;

	constructor(ctx: DurableObjectState, env: GatewayBindings) {
		super(ctx, env);
		ctx.blockConcurrencyWhile(async () => {
			const sql = ctx.storage.sql;
			sql.exec("CREATE TABLE IF NOT EXISTS free_requests (admission_id TEXT PRIMARY KEY, day INTEGER NOT NULL)");
			sql.exec("CREATE TABLE IF NOT EXISTS minute_checkpoint (id INTEGER PRIMARY KEY CHECK (id = 1), entries TEXT NOT NULL)");
			sql.exec("CREATE TABLE IF NOT EXISTS token_checkpoint (id INTEGER PRIMARY KEY CHECK (id = 1), entries TEXT NOT NULL)");
			// Earlier versions persisted one row per minute admission.
			sql.exec("DROP TABLE IF EXISTS minute_requests");
			this.restoreMinute(Date.now());
			this.restoreTokens(Date.now());
			this.rollFreeDay(Math.floor(Date.now() / DAY_MS));
		});
	}

	private restoreMinute(now: number): void {
		const row = this.ctx.storage.sql.exec<{ entries: string }>("SELECT entries FROM minute_checkpoint WHERE id = 1").toArray()[0];
		if (!row) return;
		try {
			const entries = JSON.parse(row.entries) as Array<[string, number]>;
			for (const [id, startedAt] of entries) {
				if (typeof id === "string" && Number.isFinite(startedAt) && startedAt > now - MINUTE_MS) this.minute.set(id, startedAt);
			}
		} catch {
			console.warn("customer_rate_limit_checkpoint_unreadable");
		}
	}

	private checkpointMinute(now: number): void {
		if (now - this.lastMinuteCheckpoint < MINUTE_CHECKPOINT_INTERVAL_MS) return;
		this.lastMinuteCheckpoint = now;
		this.ctx.storage.sql.exec(
			"INSERT OR REPLACE INTO minute_checkpoint (id, entries) VALUES (1, ?)",
			JSON.stringify([...this.minute]),
		);
	}

	private restoreTokens(now: number): void {
		const row = this.ctx.storage.sql.exec<{ entries: string }>("SELECT entries FROM token_checkpoint WHERE id = 1").toArray()[0];
		if (!row) return;
		try {
			const entries = JSON.parse(row.entries) as Array<[number, number]>;
			for (const [second, tokens] of entries) {
				if (!Number.isFinite(second) || !Number.isSafeInteger(tokens) || tokens <= 0 || second <= now - MINUTE_MS) continue;
				this.tokens.set(second, tokens);
				this.tokensUsed += tokens;
			}
		} catch {
			console.warn("customer_rate_limit_token_checkpoint_unreadable");
		}
	}

	private checkpointTokens(now: number): void {
		if (now - this.lastTokenCheckpoint < MINUTE_CHECKPOINT_INTERVAL_MS) return;
		this.lastTokenCheckpoint = now;
		this.ctx.storage.sql.exec(
			"INSERT OR REPLACE INTO token_checkpoint (id, entries) VALUES (1, ?)",
			JSON.stringify([...this.tokens]),
		);
	}

	private expireTokens(now: number): void {
		for (const [second, tokens] of this.tokens) {
			if (second > now - MINUTE_MS) break;
			this.tokens.delete(second);
			this.tokensUsed -= tokens;
		}
	}

	/** Seconds until usage falls below `limit` as buckets leave the rolling minute. */
	private tokenRetryAfter(now: number, limit: number): number {
		let used = this.tokensUsed;
		for (const [second, tokens] of this.tokens) {
			used -= tokens;
			if (used < limit) return Math.max(1, Math.ceil((second + MINUTE_MS - now) / 1000));
		}
		return 1;
	}

	private tokenStatus(now: number, limit: number): CustomerAdmission {
		const remaining = Math.max(0, limit - this.tokensUsed);
		return { allowed: remaining > 0, limit, remaining, retryAfterSeconds: remaining ? 0 : this.tokenRetryAfter(now, limit) };
	}

	/**
	 * Charges one completed attempt's token usage to the rolling minute and
	 * reports what is left. The caller charges each attempt once.
	 */
	async chargeTokens(scopeKey: string, tokens: number, tokensPerMinute: number): Promise<CustomerAdmission> {
		if (this.scope !== null && this.scope !== scopeKey) throw new Error("customer_scope_mismatch");
		this.scope = scopeKey;
		const limit = Number.isSafeInteger(tokensPerMinute) && tokensPerMinute > 0 ? tokensPerMinute : Number.MAX_SAFE_INTEGER;
		const now = Date.now();
		this.expireTokens(now);
		if (Number.isSafeInteger(tokens) && tokens > 0) {
			const second = Math.floor(now / 1000) * 1000;
			this.tokens.set(second, (this.tokens.get(second) ?? 0) + tokens);
			this.tokensUsed += tokens;
			this.checkpointTokens(now);
		}
		return this.tokenStatus(now, limit);
	}

	/** The scope's token allowance left in the rolling minute, without charging anything. */
	async peekTokens(scopeKey: string, tokensPerMinute: number): Promise<CustomerAdmission> {
		if (this.scope !== null && this.scope !== scopeKey) throw new Error("customer_scope_mismatch");
		this.scope = scopeKey;
		const limit = Number.isSafeInteger(tokensPerMinute) && tokensPerMinute > 0 ? tokensPerMinute : Number.MAX_SAFE_INTEGER;
		const now = Date.now();
		this.expireTokens(now);
		return this.tokenStatus(now, limit);
	}

	private rollFreeDay(day: number): void {
		if (day === this.freeDay) return;
		const sql = this.ctx.storage.sql;
		sql.exec("DELETE FROM free_requests WHERE day <> ?", day);
		this.freeUsed = sql.exec<{ used: number }>("SELECT COUNT(*) AS used FROM free_requests").one().used;
		this.freeDay = day;
	}

	private limits(value: Partial<CustomerLimits> | undefined): CustomerLimits {
		try {
			return parseCustomerLimits(value);
		} catch {
			console.warn("customer_rate_limit_invalid_limits");
			return { ...DEFAULT_CUSTOMER_LIMITS };
		}
	}

	async admit(
		scopeKey: string,
		kind: "minute" | "free-day",
		admissionId: string,
		requested?: Partial<CustomerLimits>,
	): Promise<CustomerAdmission> {
		if (this.scope !== null && this.scope !== scopeKey) throw new Error("customer_scope_mismatch");
		this.scope = scopeKey;
		const limits = this.limits(requested);
		// No awaits from here on: admission is atomic inside each object.
		const now = Date.now();
		return kind === "minute"
			? this.admitMinute(now, admissionId, limits.requestsPerMinute)
			: this.admitFreeDay(now, admissionId, limits.freeRequestsPerDay);
	}

	private admitMinute(now: number, admissionId: string, limit: number): CustomerAdmission {
		for (const [id, startedAt] of this.minute) {
			if (startedAt > now - MINUTE_MS) break;
			this.minute.delete(id);
		}
		const used = this.minute.size;
		if (this.minute.has(admissionId)) {
			const remaining = Math.max(0, limit - used);
			return { allowed: true, limit, remaining, retryAfterSeconds: remaining ? 0 : this.minuteRetryAfter(now) };
		}
		if (used >= limit) return { allowed: false, limit, remaining: 0, retryAfterSeconds: this.minuteRetryAfter(now) };
		this.minute.set(admissionId, now);
		this.checkpointMinute(now);
		const remaining = limit - used - 1;
		return { allowed: true, limit, remaining, retryAfterSeconds: remaining ? 0 : this.minuteRetryAfter(now) };
	}

	private minuteRetryAfter(now: number): number {
		const oldest = this.minute.values().next().value ?? now;
		return Math.max(1, Math.ceil((oldest + MINUTE_MS - now) / 1000));
	}

	private admitFreeDay(now: number, admissionId: string, limit: number): CustomerAdmission {
		const day = Math.floor(now / DAY_MS);
		this.rollFreeDay(day);
		const sql = this.ctx.storage.sql;
		const used = this.freeUsed;
		const retryAfterSeconds = Math.max(1, Math.ceil(((day + 1) * DAY_MS - now) / 1000));
		if (sql.exec("SELECT admission_id FROM free_requests WHERE admission_id = ?", admissionId).toArray().length) {
			const remaining = Math.max(0, limit - used);
			return { allowed: true, limit, remaining, retryAfterSeconds: remaining ? 0 : retryAfterSeconds };
		}
		if (used >= limit) return { allowed: false, limit, remaining: 0, retryAfterSeconds };
		sql.exec("INSERT INTO free_requests VALUES (?, ?)", admissionId, day);
		this.freeUsed = used + 1;
		const remaining = limit - used - 1;
		return { allowed: true, limit, remaining, retryAfterSeconds: remaining ? 0 : retryAfterSeconds };
	}
}
