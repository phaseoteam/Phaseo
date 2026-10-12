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
const MAX_RELEASED_MINUTE = 10_000;

/**
 * Exact per-scope admission counter.
 *
 * The rolling minute log is held in memory and checkpointed as one SQLite row
 * at most every few seconds, so deploys and restarts cannot hand a scope a
 * fresh allowance, at a bounded number of billed row writes rather than one
 * per admission. Daily free-model admissions stay in SQLite exactly.
 *
 * Limits are supplied by the caller (see `resolveCustomerLimits`); this object
 * performs no KV or network reads.
 */
export class CustomerRateLimitDurableObject extends DurableObject<GatewayBindings> {
	private scope: string | null = null;
	/** Admission ID -> start time, in arrival order. */
	private readonly minute = new Map<string, number>();
	/** Minute admissions released before they were counted -> release time. */
	private readonly releasedMinute = new Map<string, number>();
	private lastMinuteCheckpoint = 0;
	private freeDay = -1;
	private freeUsed = 0;

	constructor(ctx: DurableObjectState, env: GatewayBindings) {
		super(ctx, env);
		ctx.blockConcurrencyWhile(async () => {
			const sql = ctx.storage.sql;
			sql.exec("CREATE TABLE IF NOT EXISTS free_requests (admission_id TEXT PRIMARY KEY, day INTEGER NOT NULL)");
			sql.exec("CREATE TABLE IF NOT EXISTS minute_checkpoint (id INTEGER PRIMARY KEY CHECK (id = 1), entries TEXT NOT NULL)");
			// Earlier versions persisted one row per minute admission.
			sql.exec("DROP TABLE IF EXISTS minute_requests");
			this.restoreMinute(Date.now());
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

	/**
	 * Returns a minute admission's slot, for requests served from the response
	 * cache. Counting and release are both dispatched in the background, so a
	 * release can arrive first; it is then remembered and the admission is not
	 * counted when it arrives.
	 */
	async release(scopeKey: string, kind: "minute", admissionId: string): Promise<void> {
		if (this.scope !== null && this.scope !== scopeKey) throw new Error("customer_scope_mismatch");
		this.scope = scopeKey;
		if (kind !== "minute") return;
		const now = Date.now();
		if (this.minute.delete(admissionId)) {
			this.checkpointMinute(now);
			return;
		}
		this.pruneReleased(now);
		this.releasedMinute.set(admissionId, now);
		while (this.releasedMinute.size > MAX_RELEASED_MINUTE) this.releasedMinute.delete(this.releasedMinute.keys().next().value!);
	}

	private pruneReleased(now: number): void {
		for (const [id, releasedAt] of this.releasedMinute) {
			if (releasedAt > now - MINUTE_MS) break;
			this.releasedMinute.delete(id);
		}
	}

	private admitMinute(now: number, admissionId: string, limit: number): CustomerAdmission {
		for (const [id, startedAt] of this.minute) {
			if (startedAt > now - MINUTE_MS) break;
			this.minute.delete(id);
		}
		this.pruneReleased(now);
		if (this.releasedMinute.delete(admissionId)) {
			const remaining = Math.max(0, limit - this.minute.size);
			return { allowed: true, limit, remaining, retryAfterSeconds: remaining ? 0 : this.minuteRetryAfter(now) };
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
