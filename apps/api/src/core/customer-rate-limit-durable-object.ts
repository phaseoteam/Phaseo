import { DurableObject } from "cloudflare:workers";
import type { GatewayBindings } from "@/runtime/env.types";
import {
	DEFAULT_CUSTOMER_LIMITS, parseCustomerLimits,
	type CustomerAdmission, type CustomerLimits,
} from "@core/customer-rate-limits";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/**
 * Exact per-scope admission counter.
 *
 * The rolling minute log is held in memory only: an object is evicted only
 * after idling for longer than the window it would have to remember, so
 * persisting it would buy nothing but billed row writes. Daily free-model
 * admissions must survive restarts and stay in SQLite.
 *
 * Limits are supplied by the caller (see `resolveCustomerLimits`); this object
 * performs no KV or network reads.
 */
export class CustomerRateLimitDurableObject extends DurableObject<GatewayBindings> {
	private scope: string | null = null;
	/** Admission ID -> start time, in arrival order. */
	private readonly minute = new Map<string, number>();
	private freeDay = -1;
	private freeUsed = 0;

	constructor(ctx: DurableObjectState, env: GatewayBindings) {
		super(ctx, env);
		ctx.blockConcurrencyWhile(async () => {
			const sql = ctx.storage.sql;
			sql.exec("CREATE TABLE IF NOT EXISTS free_requests (admission_id TEXT PRIMARY KEY, day INTEGER NOT NULL)");
			// Earlier versions persisted the minute log.
			sql.exec("DROP TABLE IF EXISTS minute_requests");
			this.rollFreeDay(Math.floor(Date.now() / DAY_MS));
		});
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
