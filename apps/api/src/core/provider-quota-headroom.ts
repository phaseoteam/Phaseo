// Purpose: Ease managed traffic off a provider before it reaches a declared upstream limit.
// Why: Without it a provider keeps its full routing share until a limit refuses an attempt, then
//      drops to almost none; per-minute limits make traffic swing back at every window reset,
//      and every isolate that has not yet been refused sends one attempt over the limit.
// How: The coordinator projects each limited window's use to the end of the window and reports
//      the worst projection with every lease it grants. Routing multiplies the candidate's score
//      by a penalty that starts below the limit and falls smoothly towards `penaltyFloor` as the
//      projection reaches it. A refused scope is still handled by the saturation path, which
//      ranks it behind every other candidate.
// Pure: no runtime imports, so the routing simulation can run it directly.

export const QUOTA_HEADROOM = {
	/** Projected use (fraction of the limit) at which the routing penalty starts. */
	penaltyStart: 0.75,
	/** Score multiplier once the projection reaches the limit. */
	penaltyFloor: 0.05,
	/** Without a previous window, the rate so far is measured over at least this much of the window. */
	minObservedFraction: 1 / 20,
	/** Isolates forget a projection after this long. */
	ttlMs: 20_000,
	/**
	 * Lease lifetime once a scope is projected to reach `penaltyStart`. Every isolate holds about
	 * 20s of its own demand in leases; with many isolates that strands enough allowance for the
	 * coordinator to refuse attempts well below the limit, and each refused attempt is still sent.
	 */
	nearLimitLeaseTtlMs: 10_000,
} as const;

export type QuotaWindowUse = {
	/** Effective limit for this window, or null when the dimension is unlimited. */
	limit: number | null;
	/** Estimated actual use so far (see `unusedLeaseAllowance`). */
	used: number;
	/** Estimated use over the whole previous window, or null when unknown. */
	previous: number | null;
	windowMs: number;
	windowStartMs: number;
};

/** One dimension of a lease that is granted and not yet returned. */
export type OutstandingLease = {
	granted: number;
	/** Use the isolate last reported (initially what was admitted with the grant). */
	reported: number;
};

/**
 * Allowance an outstanding lease has not been reported as used. Counters include whole leases
 * from the moment they are granted, so this is subtracted to estimate actual use. Isolates report
 * progress whenever they call the coordinator, so the estimate trails actual use by at most
 * what each isolate admitted since its last call.
 */
export function unusedLeaseAllowance(lease: OutstandingLease): number {
	return Math.max(0, lease.granted - Math.max(0, lease.reported));
}

/**
 * Worst projected end-of-window use across limited windows, as a fraction of each limit
 * (1 = on course to reach it). The rest of a window is projected at a rate that moves from the
 * previous window's (when known) to the current window's as the window elapses, so a window's
 * first moments neither extrapolate noise nor forget how busy the provider just was.
 */
export function projectedQuotaUse(windows: QuotaWindowUse[], nowMs: number): number {
	let worst = 0;
	for (const window of windows) {
		if (window.limit == null || !(window.limit > 0) || !(window.windowMs > 0)) continue;
		const elapsed = Math.min(window.windowMs, Math.max(0, nowMs - window.windowStartMs));
		const used = Math.max(0, window.used);
		const observedRate = used / Math.max(elapsed, window.windowMs * QUOTA_HEADROOM.minObservedFraction);
		const progress = elapsed / window.windowMs;
		const rate = window.previous == null
			? observedRate
			: progress * observedRate + (1 - progress) * (Math.max(0, window.previous) / window.windowMs);
		const projected = (used + rate * (window.windowMs - elapsed)) / window.limit;
		if (Number.isFinite(projected) && projected > worst) worst = projected;
	}
	return worst;
}

/**
 * Routing score multiplier for a projected use: 1 up to `penaltyStart`, then falling along a
 * quadratic ease-in to `penaltyFloor` at the limit. The curve stays near 1 just past the start,
 * so a provider is only eased off in earnest once it is close to its limit.
 */
export function quotaHeadroomMultiplier(
	projected: number,
	{ penaltyStart, penaltyFloor }: { penaltyStart: number; penaltyFloor: number } = QUOTA_HEADROOM,
): number {
	if (!(projected > penaltyStart)) return 1;
	const progress = Math.min(1, (projected - penaltyStart) / (1 - penaltyStart));
	return 1 - (1 - penaltyFloor) * progress * progress;
}
