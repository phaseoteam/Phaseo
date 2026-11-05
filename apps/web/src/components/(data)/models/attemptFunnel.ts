/**
 * The three per-attempt provider metrics, in display order. Shown as
 * "Reachable", "Accepted" and "Completed": a funnel where each rate is of the
 * attempts that passed the step before it.
 */
export const PROVIDER_HEALTH_METRICS = ["reachability", "capacity", "callErrors"] as const;
export type ProviderHealthMetric = (typeof PROVIDER_HEALTH_METRICS)[number];

/** The funnel's rates, as web-api publishes them. The counts behind them are never published. */
export type AttemptFunnelRates = {
	reachabilityPct: number | null | undefined;
	capacityPct: number | null | undefined;
	callErrorPct: number | null | undefined;
};

/**
 * What to say about one step's failures, from the rates alone:
 * - `none`: nothing failed at this step, or there was nothing to try;
 * - `failed`: this share (in percent) of the attempts that reached the step failed it;
 * - `unmeasured`: no attempt got as far as this step (for example, none reached
 *   the provider, so there is nothing to say about whether it accepted them).
 */
export type AttemptFailureShare =
	| { kind: "none" }
	| { kind: "failed"; pct: number }
	| { kind: "unmeasured" };

const isRate = (value: number | null | undefined): value is number =>
	typeof value === "number" && Number.isFinite(value);

function failureShare(ratePct: number | null | undefined, reachedStep: boolean): AttemptFailureShare {
	if (!isRate(ratePct)) return reachedStep ? { kind: "unmeasured" } : { kind: "none" };
	const failedPct = Math.min(100, Math.max(0, 100 - ratePct));
	return failedPct > 1e-9 ? { kind: "failed", pct: failedPct } : { kind: "none" };
}

/**
 * Each step's failure share. A null reachable rate means there were no eligible
 * attempts at all, so there were no failures; a null later rate after some
 * attempts means none reached that step.
 */
export function attemptFailureShares(rates: AttemptFunnelRates): Record<ProviderHealthMetric, AttemptFailureShare> {
	const hadAttempts = isRate(rates.reachabilityPct);
	return {
		reachability: failureShare(rates.reachabilityPct, false),
		capacity: failureShare(rates.capacityPct, hadAttempts),
		callErrors: failureShare(rates.callErrorPct, hadAttempts),
	};
}

/**
 * A failure share as a locale percentage with one decimal place. Shares that
 * would round to 0.0% read "<0.1%" so a small failure never looks like none.
 */
export function formatFailureShare(pct: number, locale: string): string {
	const format = new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
	return pct < 0.05 ? `<${format.format(0.001)}` : format.format(pct / 100);
}
