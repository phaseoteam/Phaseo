// Purpose: Coordinate fixed-window provider quota counters globally.
// Why: Native Workers rate-limit counters are location-local and cannot account for completed token usage.
// How: Stores one durable counter row per managed provider credential scope, and grants isolates
//      leases (slices of the remaining allowance) that are counted as consumed when granted.

import { DurableObject } from "cloudflare:workers";
import type { GatewayBindings } from "@/runtime/env.types";
import { BATCH_DOWNLOAD_LIMIT, BATCH_DOWNLOAD_WINDOW_MS, type BatchDownloadAdmission } from "@core/batch-download-limits";
import type { LeaseAcquireResult, LeaseProgress, LeaseReturn, LeaseVector } from "@core/lease-pool";
import { QUOTA_HEADROOM, projectedQuotaUse, unusedLeaseAllowance } from "@core/provider-quota-headroom";
import {
	PROVIDER_LEASE,
	effectiveTokenLimit,
	resolveProviderRateLimitDenial,
	type ProviderLeaseMeta,
	type ProviderRateLimitAdmission,
	type ProviderRateLimitConfig,
	type ProviderTokenReservation,
} from "@core/provider-rate-limits";

type LeaseRow = {
	id: string;
	minute_window: number;
	day_window: number;
	requests: number;
	tokens: number;
	expires_at: number;
};

const MAX_RECONCILED_IDS = 50_000;

type CounterRow = {
	id: number;
	minute_window: number;
	day_window: number;
	minute_requests: number;
	day_requests: number;
	minute_tokens: number;
	day_tokens: number;
};

const DAY_MS = 86_400_000;

/** Lease use as last reported by its isolate (instance memory; lost when the object restarts). */
type LeaseUse = {
	minuteWindow: number;
	dayWindow: number;
	requests: number;
	tokens: number;
	reportedRequests: number;
	reportedTokens: number;
	expiresAt: number;
};

type WindowUse = { window: number; requests: number; tokens: number };

export class ProviderRateLimitDurableObject extends DurableObject<GatewayBindings> {
	/** Reservation ids already reconciled; makes reconcile retries idempotent within this instance. */
	private readonly reconciled = new Set<string>();
	private leaseSweepAt = 0;
	/** Outstanding leases and their reported use, for estimating actual use (not for admission). */
	private readonly leaseUse = new Map<string, LeaseUse>();
	/** Estimated use of the previous minute and day, kept when the counters roll over. */
	private previousMinute: WindowUse | null = null;
	private previousDay: WindowUse | null = null;

	constructor(ctx: DurableObjectState, env: GatewayBindings) {
		super(ctx, env);
		ctx.blockConcurrencyWhile(async () => {
			this.ctx.storage.sql.exec(`
				CREATE TABLE IF NOT EXISTS counters (
					id INTEGER PRIMARY KEY CHECK (id = 1),
					minute_window INTEGER NOT NULL,
					day_window INTEGER NOT NULL,
					minute_requests INTEGER NOT NULL,
					day_requests INTEGER NOT NULL,
					minute_tokens INTEGER NOT NULL,
					day_tokens INTEGER NOT NULL
				)
			`);
			// Outstanding leases survive restarts so returns of unused allowance stay exact
			// and idempotent. Granted amounts are already included in the counters.
			this.ctx.storage.sql.exec(`
				CREATE TABLE IF NOT EXISTS leases (
					id TEXT PRIMARY KEY,
					minute_window INTEGER NOT NULL,
					day_window INTEGER NOT NULL,
					requests INTEGER NOT NULL,
					tokens INTEGER NOT NULL,
					expires_at INTEGER NOT NULL
				)
			`);
		});
	}

	async admitBatchDownload(): Promise<BatchDownloadAdmission> {
		// Synchronous SQL admission cannot interleave with another request. At most ten rows
		// are retained, in a separate object per workspace/batch from provider quotas.
		const now = Date.now();
		const sql = this.ctx.storage.sql;
		sql.exec("CREATE TABLE IF NOT EXISTS batch_downloads (started_at INTEGER NOT NULL)");
		sql.exec("DELETE FROM batch_downloads WHERE started_at <= ?", now - BATCH_DOWNLOAD_WINDOW_MS);
		const rows = sql.exec<{ started_at: number }>("SELECT started_at FROM batch_downloads ORDER BY started_at").toArray();
		if (rows.length >= BATCH_DOWNLOAD_LIMIT) {
			return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((rows[0].started_at + BATCH_DOWNLOAD_WINDOW_MS - now) / 1000)) };
		}
		sql.exec("INSERT INTO batch_downloads (started_at) VALUES (?)", now);
		await this.ctx.storage.setAlarm(now + BATCH_DOWNLOAD_WINDOW_MS);
		return { allowed: true, retryAfterSeconds: 0 };
	}

	async alarm(): Promise<void> {
		await this.ctx.blockConcurrencyWhile(async () => {
			const sql = this.ctx.storage.sql;
			const table = sql.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'batch_downloads'").toArray();
			if (!table.length) return;
			const latest = sql.exec<{ latest: number | null }>("SELECT MAX(started_at) AS latest FROM batch_downloads").toArray()[0]?.latest;
			if (latest != null && latest + BATCH_DOWNLOAD_WINDOW_MS > Date.now()) {
				await this.ctx.storage.setAlarm(latest + BATCH_DOWNLOAD_WINDOW_MS);
			} else {
				await this.ctx.storage.deleteAll();
			}
		});
	}

	private current(nowMs: number): CounterRow {
		const minuteWindow = Math.floor(nowMs / 60_000);
		const dayWindow = Math.floor(nowMs / DAY_MS);
		let row = this.ctx.storage.sql.exec<CounterRow>("SELECT * FROM counters WHERE id = 1").toArray()[0];
		if (!row) {
			this.ctx.storage.sql.exec(
				"INSERT INTO counters VALUES (1, ?, ?, 0, 0, 0, 0)",
				minuteWindow,
				dayWindow,
			);
			row = { id: 1, minute_window: minuteWindow, day_window: dayWindow, minute_requests: 0, day_requests: 0, minute_tokens: 0, day_tokens: 0 };
		}
		if (row.minute_window !== minuteWindow) {
			this.previousMinute = this.closingUse(row.minute_window, row.minute_requests, row.minute_tokens, minuteWindow, "minute");
			row.minute_window = minuteWindow;
			row.minute_requests = 0;
			row.minute_tokens = 0;
		}
		if (row.day_window !== dayWindow) {
			this.previousDay = this.closingUse(row.day_window, row.day_requests, row.day_tokens, dayWindow, "day");
			row.day_window = dayWindow;
			row.day_requests = 0;
			row.day_tokens = 0;
		}
		return row;
	}

	private persist(row: CounterRow): void {
		this.ctx.storage.sql.exec(
			`UPDATE counters SET minute_window = ?, day_window = ?, minute_requests = ?,
			 day_requests = ?, minute_tokens = ?, day_tokens = ? WHERE id = 1`,
			row.minute_window,
			row.day_window,
			row.minute_requests,
			row.day_requests,
			row.minute_tokens,
			row.day_tokens,
		);
	}

	/** Leased allowance not reported as used, in the given minute and day windows. */
	private unreportedLeases(minuteWindow: number, dayWindow: number) {
		const unused = { minuteRequests: 0, minuteTokens: 0, dayRequests: 0, dayTokens: 0 };
		for (const lease of this.leaseUse.values()) {
			const requests = unusedLeaseAllowance({ granted: lease.requests, reported: lease.reportedRequests });
			const tokens = unusedLeaseAllowance({ granted: lease.tokens, reported: lease.reportedTokens });
			if (lease.minuteWindow === minuteWindow) { unused.minuteRequests += requests; unused.minuteTokens += tokens; }
			if (lease.dayWindow === dayWindow) { unused.dayRequests += requests; unused.dayTokens += tokens; }
		}
		return unused;
	}

	/** Estimated use of a window that is closing, kept as the next window's prior when adjacent. */
	private closingUse(window: number, requests: number, tokens: number, nextWindow: number, kind: "minute" | "day"): WindowUse {
		if (window !== nextWindow - 1) return { window: nextWindow - 1, requests: 0, tokens: 0 };
		const unused = kind === "minute" ? this.unreportedLeases(window, -1) : this.unreportedLeases(-1, window);
		const unusedRequests = kind === "minute" ? unused.minuteRequests : unused.dayRequests;
		const unusedTokens = kind === "minute" ? unused.minuteTokens : unused.dayTokens;
		return { window, requests: Math.max(0, requests - unusedRequests), tokens: Math.max(0, tokens - unusedTokens) };
	}

	private recordProgress(held: LeaseProgress[]): void {
		for (const progress of Array.isArray(held) ? held.slice(0, 64) : []) {
			const lease = progress && typeof progress.id === "string" ? this.leaseUse.get(progress.id) : undefined;
			if (!lease) continue;
			const used = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : 0;
			lease.reportedRequests = Math.max(lease.reportedRequests, used(progress.usedRequests));
			lease.reportedTokens = Math.max(lease.reportedTokens, used(progress.usedUnits));
		}
	}

	/**
	 * Projected use reported with a lease (see `projectedQuotaUse`): counted use less leased
	 * allowance not reported as used, plus what is being admitted now. Isolates apply it for
	 * `QUOTA_HEADROOM.ttlMs`; the previous window's use carries it across window boundaries.
	 */
	private quotaProjection(config: ProviderRateLimitConfig, row: CounterRow, requests: number, tokens: number, nowMs: number) {
		const unused = this.unreportedLeases(row.minute_window, row.day_window);
		const minuteStart = row.minute_window * 60_000;
		const dayStart = row.day_window * DAY_MS;
		const previousMinute = this.previousMinute?.window === row.minute_window - 1 ? this.previousMinute : null;
		const previousDay = this.previousDay?.window === row.day_window - 1 ? this.previousDay : null;
		const projectedUse = projectedQuotaUse([
			{ limit: config.requestsPerMinute, used: row.minute_requests - unused.minuteRequests + requests,
				previous: previousMinute?.requests ?? null, windowMs: 60_000, windowStartMs: minuteStart },
			{ limit: config.requestsPerDay, used: row.day_requests - unused.dayRequests + requests,
				previous: previousDay?.requests ?? null, windowMs: DAY_MS, windowStartMs: dayStart },
			{ limit: effectiveTokenLimit(config.tokensPerMinute, config.headroomBps), used: row.minute_tokens - unused.minuteTokens + tokens,
				previous: previousMinute?.tokens ?? null, windowMs: 60_000, windowStartMs: minuteStart },
			{ limit: effectiveTokenLimit(config.tokensPerDay, config.headroomBps), used: row.day_tokens - unused.dayTokens + tokens,
				previous: previousDay?.tokens ?? null, windowMs: DAY_MS, windowStartMs: dayStart },
		], nowMs);
		return { projectedUse, projectedUntil: nowMs + QUOTA_HEADROOM.ttlMs };
	}

	async admit(
		config: ProviderRateLimitConfig,
		reservationTokens: number | null,
		reservationId: string,
		nowMs = Date.now(),
		reservationRequests = 1,
	): Promise<ProviderRateLimitAdmission> {
		if (!Number.isSafeInteger(reservationRequests) || reservationRequests < 1) {
			return { allowed: false, reason: "requests_per_minute", retryAfterSeconds: 60, reservation: null };
		}
		const row = this.current(nowMs);
		const hasTokenLimit = config.tokensPerMinute != null || config.tokensPerDay != null;
		const requestedTokens = hasTokenLimit
			? (Number.isSafeInteger(reservationTokens) && Number(reservationTokens) > 0
				? Number(reservationTokens)
				: Number.MAX_SAFE_INTEGER)
			: 0;
		const denial = resolveProviderRateLimitDenial(config, {
			minuteWindow: row.minute_window,
			dayWindow: row.day_window,
			minuteRequests: row.minute_requests,
			dayRequests: row.day_requests,
			minuteTokens: row.minute_tokens,
			dayTokens: row.day_tokens,
		}, nowMs, requestedTokens, reservationRequests);
		if (denial) return denial;

		row.minute_requests += reservationRequests;
		row.day_requests += reservationRequests;
		row.minute_tokens += requestedTokens;
		row.day_tokens += requestedTokens;
		this.persist(row);
		return {
			allowed: true,
			reason: null,
			retryAfterSeconds: null,
			reservation: requestedTokens > 0
				? {
					id: reservationId,
					providerId: config.providerId,
					tokens: requestedTokens,
					minuteWindow: row.minute_window,
					dayWindow: row.day_window,
				}
				: null,
		};
	}

	/**
	 * Admits `need` (when `need.requests > 0`) and grants a lease for part of the remaining
	 * allowance. The whole grant is counted immediately, so leases never exceed a limit.
	 * `need.requests === 0` is a background top-up: nothing is granted when no surplus exists.
	 * `returns` carries leases the isolate no longer uses; their unused allowance is refunded.
	 */
	async acquireLease(
		config: ProviderRateLimitConfig,
		need: LeaseVector,
		want: LeaseVector,
		returns: LeaseReturn[],
		reservationId: string,
		nowMs = Date.now(),
		held: LeaseProgress[] = [],
	): Promise<LeaseAcquireResult<ProviderLeaseMeta, ProviderRateLimitAdmission>> {
		const topUp = need.requests === 0;
		if (!Number.isSafeInteger(need.requests) || need.requests < 0) {
			return { ok: false, denial: { allowed: false, reason: "requests_per_minute", retryAfterSeconds: 60, reservation: null } };
		}
		this.recordProgress(held);
		const row = this.current(nowMs);
		let dirty = this.applyReturns(row, returns);
		this.sweepLeases(row, nowMs);
		const hasTokenLimit = config.tokensPerMinute != null || config.tokensPerDay != null;
		const hasRequestLimit = config.requestsPerMinute != null || config.requestsPerDay != null;
		// Zero means the caller counts the tokens once they are known (reconcileTokens).
		const needTokens = !hasTokenLimit || topUp
			? 0
			: Number.isSafeInteger(need.units) && need.units >= 0 ? need.units : Number.MAX_SAFE_INTEGER;
		const counters = () => ({
			minuteWindow: row.minute_window,
			dayWindow: row.day_window,
			minuteRequests: row.minute_requests,
			dayRequests: row.day_requests,
			minuteTokens: row.minute_tokens,
			dayTokens: row.day_tokens,
		});
		if (!topUp) {
			const denial = resolveProviderRateLimitDenial(config, counters(), nowMs, needTokens, need.requests);
			if (denial) {
				if (dirty) this.persist(row);
				return { ok: false, denial };
			}
		}

		// Surplus is at most a quarter of what remains above a reserve floor, so the last
		// part of every window is admitted one request at a time and little allowance can
		// be stranded in idle isolates.
		const surplus = (limits: Array<[number | null, number]>, wanted: number): number => {
			let value = Math.max(0, wanted);
			for (const [limit, used] of limits) {
				if (limit == null) continue;
				const floor = Math.max(PROVIDER_LEASE.minReserve, Math.ceil(limit * PROVIDER_LEASE.reserveFraction));
				value = Math.min(value, Math.floor(Math.max(0, limit - used - floor) / PROVIDER_LEASE.shareDivisor));
			}
			return value;
		};
		const usedRequests = need.requests;
		const extraRequests = hasRequestLimit
			? surplus([[config.requestsPerMinute, row.minute_requests + usedRequests], [config.requestsPerDay, row.day_requests + usedRequests]],
				want.requests - need.requests)
			: Math.max(0, want.requests - need.requests);
		const extraTokens = hasTokenLimit
			? surplus([
				[effectiveTokenLimit(config.tokensPerMinute, config.headroomBps), row.minute_tokens + needTokens],
				[effectiveTokenLimit(config.tokensPerDay, config.headroomBps), row.day_tokens + needTokens],
			], Math.min(Number.MAX_SAFE_INTEGER, want.units) - needTokens)
			: 0;
		const minuteBound = config.requestsPerMinute != null || config.tokensPerMinute != null;
		const windowEnd = Math.min(
			minuteBound ? (row.minute_window + 1) * 60_000 : Number.MAX_SAFE_INTEGER,
			(row.day_window + 1) * DAY_MS,
		) - PROVIDER_LEASE.windowSkewMs;
		const meta: ProviderLeaseMeta = {
			minuteWindow: row.minute_window,
			dayWindow: row.day_window,
			...this.quotaProjection(config, row, need.requests, needTokens, nowMs),
		};
		// Near a limit, shorter leases strand less allowance in isolates that are not using it.
		const ttlMs = meta.projectedUse! >= QUOTA_HEADROOM.penaltyStart ? QUOTA_HEADROOM.nearLimitLeaseTtlMs : PROVIDER_LEASE.ttlMs;
		const expiresAt = Math.min(nowMs + ttlMs, windowEnd);
		const useful = (!hasRequestLimit || extraRequests >= 1) && (!hasTokenLimit || extraTokens >= 1) &&
			expiresAt - nowMs >= PROVIDER_LEASE.minLifetimeMs;

		if (!useful) {
			if (topUp) {
				if (dirty) this.persist(row);
				return { ok: false, denial: null };
			}
			row.minute_requests += need.requests;
			row.day_requests += need.requests;
			row.minute_tokens += needTokens;
			row.day_tokens += needTokens;
			this.persist(row);
			// A single-use grant: the caller settles it through reconcileTokens as before.
			return { ok: true, lease: { id: reservationId, expiresAt: 0, requests: need.requests, units: needTokens, meta } };
		}

		const grantedRequests = need.requests + (hasRequestLimit ? extraRequests : 0);
		const grantedTokens = needTokens + extraTokens;
		row.minute_requests += grantedRequests;
		row.day_requests += grantedRequests;
		row.minute_tokens += grantedTokens;
		row.day_tokens += grantedTokens;
		dirty = true;
		const leaseId = `${reservationId}:lease`;
		this.ctx.storage.sql.exec(
			"INSERT OR REPLACE INTO leases VALUES (?, ?, ?, ?, ?, ?)",
			leaseId, row.minute_window, row.day_window, grantedRequests, grantedTokens, expiresAt,
		);
		this.leaseUse.set(leaseId, {
			minuteWindow: row.minute_window,
			dayWindow: row.day_window,
			requests: grantedRequests,
			tokens: grantedTokens,
			reportedRequests: need.requests,
			reportedTokens: needTokens,
			expiresAt,
		});
		if (dirty) this.persist(row);
		return {
			ok: true,
			lease: {
				id: leaseId,
				expiresAt,
				requests: hasRequestLimit ? grantedRequests : null,
				units: hasTokenLimit ? grantedTokens : null,
				meta,
			},
		};
	}

	/** Refunds the unused part of returned leases. Unknown (already returned) leases are ignored. */
	async returnLeases(returns: LeaseReturn[], nowMs = Date.now()): Promise<void> {
		const row = this.current(nowMs);
		if (this.applyReturns(row, returns)) this.persist(row);
	}

	private applyReturns(row: CounterRow, returns: LeaseReturn[]): boolean {
		let dirty = false;
		for (const returned of Array.isArray(returns) ? returns.slice(0, 64) : []) {
			if (!returned || typeof returned.id !== "string") continue;
			this.leaseUse.delete(returned.id);
			const lease = this.ctx.storage.sql.exec<LeaseRow>("SELECT * FROM leases WHERE id = ?", returned.id).toArray()[0];
			if (!lease) continue;
			this.ctx.storage.sql.exec("DELETE FROM leases WHERE id = ?", returned.id);
			// Negative deltas refund unused allowance; positive deltas count admissions beyond the
			// grant on an unlimited dimension (e.g. requests when only tokens are limited).
			const used = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : 0;
			const requestDelta = used(returned.usedRequests) - lease.requests;
			const tokenDelta = used(returned.usedUnits) - lease.tokens;
			if (row.minute_window === lease.minute_window) {
				row.minute_requests = Math.max(0, row.minute_requests + requestDelta);
				row.minute_tokens = Math.max(0, row.minute_tokens + tokenDelta);
			}
			if (row.day_window === lease.day_window) {
				row.day_requests = Math.max(0, row.day_requests + requestDelta);
				row.day_tokens = Math.max(0, row.day_tokens + tokenDelta);
			}
			dirty = true;
		}
		return dirty;
	}

	/** Forgets leases that can no longer be refunded. Their allowance stays consumed (conservative). */
	private sweepLeases(row: CounterRow, nowMs: number): void {
		if (nowMs < this.leaseSweepAt) return;
		this.leaseSweepAt = nowMs + 60_000;
		this.ctx.storage.sql.exec(
			"DELETE FROM leases WHERE day_window <> ? OR expires_at < ?",
			row.day_window,
			nowMs - PROVIDER_LEASE.returnGraceMs,
		);
		for (const [id, lease] of this.leaseUse) {
			if (lease.dayWindow !== row.day_window || lease.expiresAt < nowMs - PROVIDER_LEASE.returnGraceMs) this.leaseUse.delete(id);
		}
	}

	/** Counts requests that were sent upstream although this scope refused them (deranked, not blocked). */
	async recordRequests(requests: number, nowMs = Date.now()): Promise<void> {
		if (!Number.isSafeInteger(requests) || requests <= 0) return;
		const row = this.current(nowMs);
		row.minute_requests += requests;
		row.day_requests += requests;
		this.persist(row);
	}

	async recordTokens(tokens: number, nowMs = Date.now()): Promise<void> {
		if (!Number.isSafeInteger(tokens) || tokens <= 0) return;
		const row = this.current(nowMs);
		row.minute_tokens += tokens;
		row.day_tokens += tokens;
		this.persist(row);
	}

	async reconcileTokens(
		reservation: ProviderTokenReservation,
		actualTokens: number,
		nowMs = Date.now(),
	): Promise<void> {
		if (!Number.isSafeInteger(reservation.tokens) || reservation.tokens < 0) return;
		if (!Number.isSafeInteger(actualTokens) || actualTokens < 0) return;
		if (typeof reservation.id === "string") {
			// Reconciliation is a delta; applying a retried call twice would double-count it.
			if (this.reconciled.has(reservation.id)) return;
			this.reconciled.add(reservation.id);
			if (this.reconciled.size > MAX_RECONCILED_IDS) {
				const oldest = this.reconciled.values().next();
				if (!oldest.done) this.reconciled.delete(oldest.value);
			}
		}
		const row = this.current(nowMs);
		const delta = actualTokens - reservation.tokens;
		if (row.minute_window === reservation.minuteWindow) {
			row.minute_tokens = Math.max(0, row.minute_tokens + delta);
		}
		if (row.day_window === reservation.dayWindow) {
			row.day_tokens = Math.max(0, row.day_tokens + delta);
		}
		this.persist(row);
	}
}
