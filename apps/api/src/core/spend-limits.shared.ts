// Purpose: Types, lease parameters and UTC window arithmetic shared by the spend-limit
//          coordinator (Durable Object) and its isolate-side client.
// Why: Both sides must agree exactly on windows and on the decision shape (`GateCheck`).

import type { GateCheck } from "@pipeline/before/types";

export const DAY_MS = 86_400_000;

export const SPEND_LEASE = {
	/** Maximum lease lifetime. Leases also end before the next UTC day. */
	ttlMs: 30_000,
	/** Lifetime for keys and workspaces without any limit. */
	unlimitedTtlMs: 60_000,
	/** Leases end this long before a UTC day boundary (clock-skew margin). */
	windowSkewMs: 2_000,
	minLifetimeMs: 3_000,
	/** A lease takes at most 1/shareDivisor of the allowance above the reserve floor. */
	shareDivisor: 4,
	/** The last 5 % of each limit (at least 4 requests / 4 average requests' cost) is admitted one by one. */
	reserveFraction: 0.05,
	reserveRequests: 4,
	reserveAverageCosts: 4,
	/**
	 * An unreturned lease keeps holding its allowance this long after expiry, covering requests
	 * still running in its isolate. Isolates return expired leases on their next admission or
	 * settlement for the key, which replaces this with the exact in-flight count.
	 */
	expiryGraceMs: 120_000,
	/** Admitted requests still running when a lease was returned stay held until recorded, at most this long. */
	inFlightHoldMs: 10 * 60_000,
	/** A seed from the previous UTC day is still accepted this long after midnight (clock skew). */
	midnightToleranceMs: 5_000,
	/** Background reseed interval, and the age after which a seed is awaited. */
	reseedMs: 60_000,
	maxSeedAgeMs: 5 * 60_000,
	/** Recorded requests not yet visible in gateway_requests after this long stop being tracked. */
	pendingTtlMs: 15 * 60_000,
	/** Exclusion-list cap of gateway_spend_limit_seed; reaching it forces a reseed. */
	maxExcludedRequestIds: 5_000,
	maxKeysPerSeed: 100,
	/** Keys without requests for this long are dropped from reseeds (seeded again when used). */
	keyIdleMs: 10 * 60_000,
	/** After a contended (hold-caused) decision, ask holders to return their slices for this long. */
	drainMs: 15_000,
} as const;

export type KeyWindow = "daily" | "weekly" | "monthly";
export const KEY_WINDOWS: KeyWindow[] = ["daily", "weekly", "monthly"];
export type BudgetInterval = KeyWindow | "lifetime";

export type WindowStarts = Record<KeyWindow, number>;

export function utcDayStart(ms: number): number {
	const date = new Date(ms);
	return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** ISO week start (Monday 00:00 UTC), matching Postgres `date_trunc('week', ...)`. */
export function utcWeekStart(ms: number): number {
	const day = utcDayStart(ms);
	const weekday = new Date(day).getUTCDay();
	return day - ((weekday + 6) % 7) * DAY_MS;
}

export function utcMonthStart(ms: number): number {
	const date = new Date(ms);
	return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

export function windowStarts(ms: number): WindowStarts {
	return { daily: utcDayStart(ms), weekly: utcWeekStart(ms), monthly: utcMonthStart(ms) };
}

export function windowEnd(window: KeyWindow, start: number): number {
	if (window === "daily") return start + DAY_MS;
	if (window === "weekly") return start + 7 * DAY_MS;
	const date = new Date(start);
	return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}

/** Isolate-held lease metadata. */
export type SpendLeaseMeta = {
	keyId: string;
	/** Usage snapshot when the lease was granted (reported as the gate's buckets). */
	buckets: GateCheck["buckets"];
	/** True when neither the key nor the workspace has any limit. */
	unlimited: boolean;
};

export type SpendDenial = {
	gate: GateCheck;
	/** The limit is not yet used, but its remainder is held by other isolates' slices. */
	contended: boolean;
};

export type SpendRecordEntry = {
	keyId: string;
	/** Idempotency key: one billable pipeline execution. */
	billingRequestId: string;
	/** gateway_requests.request_id of the row this spend produces (used to avoid double counting). */
	requestId: string;
	costNanos: number;
	/** Number of successful gateway_requests rows (normally 1). */
	requests: number;
	/** gateway_requests.created_at of the row, in epoch ms. Defaults to the record time. */
	occurredAtMs?: number;
	/** Lease the request was admitted from, if any. */
	leaseId?: string | null;
};

export type SpendRecordResult = { duplicates: number; drainKeyIds: string[] };
