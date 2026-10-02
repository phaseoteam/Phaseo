import { DurableObject } from "cloudflare:workers";
import type { GatewayBindings } from "@/runtime/env.types";
import { parseCustomerLimits, type CustomerAdmission, type CustomerLimits } from "@core/customer-rate-limits";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

export class CustomerRateLimitDurableObject extends DurableObject<GatewayBindings> {
	private config: { key: string; expiresAt: number; limits: CustomerLimits } | null = null;
	private configLoad: Promise<CustomerLimits> | null = null;

	constructor(ctx: DurableObjectState, env: GatewayBindings) {
		super(ctx, env);
		ctx.blockConcurrencyWhile(async () => {
			ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS minute_requests (admission_id TEXT PRIMARY KEY, started_at INTEGER NOT NULL)");
			ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS free_requests (admission_id TEXT PRIMARY KEY, day INTEGER NOT NULL)");
		});
	}

	private async limits(key: string): Promise<CustomerLimits> {
		if (this.config && this.config.key !== key) throw new Error("customer_scope_mismatch");
		if (this.config && this.config.expiresAt > Date.now()) return this.config.limits;
		if (this.configLoad) return this.configLoad;
		this.configLoad = (async () => {
			const value = await this.env.GATEWAY_CACHE.get(key, "json");
			const limits = parseCustomerLimits(value);
			this.config = { key, expiresAt: Date.now() + MINUTE_MS, limits };
			return limits;
		})();
		try { return await this.configLoad; }
		finally { this.configLoad = null; }
	}

	async admit(scopeKey: string, kind: "minute" | "free-day", admissionId: string): Promise<CustomerAdmission> {
		const limits = await this.limits(scopeKey);
		// No awaits between reading and inserting: admission is atomic inside each object.
		const now = Date.now();
		const day = Math.floor(now / DAY_MS);
		const sql = this.ctx.storage.sql;
		sql.exec("DELETE FROM minute_requests WHERE started_at <= ?", now - MINUTE_MS);
		sql.exec("DELETE FROM free_requests WHERE day <> ?", day);
		const table = kind === "minute" ? "minute_requests" : "free_requests";
		const limit = kind === "minute" ? limits.requestsPerMinute : limits.freeRequestsPerDay;
		const used = sql.exec<{ used: number }>(`SELECT COUNT(*) AS used FROM ${table}`).one().used;
		if (sql.exec(`SELECT admission_id FROM ${table} WHERE admission_id = ?`, admissionId).toArray().length) {
			return { allowed: true, limit, remaining: Math.max(0, limit - used), retryAfterSeconds: 0 };
		}
		if (used >= limit) {
			const reset = kind === "minute"
				? sql.exec<{ oldest: number }>("SELECT MIN(started_at) AS oldest FROM minute_requests").one().oldest + MINUTE_MS
				: (day + 1) * DAY_MS;
			return { allowed: false, limit, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((reset - now) / 1000)) };
		}
		if (kind === "minute") sql.exec("INSERT INTO minute_requests VALUES (?, ?)", admissionId, now);
		else sql.exec("INSERT INTO free_requests VALUES (?, ?)", admissionId, day);
		return { allowed: true, limit, remaining: limit - used - 1, retryAfterSeconds: 0 };
	}
}
