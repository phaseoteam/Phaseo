const DAY_MS = 86_400_000;
const NANOS_PER_USD = 1_000_000_000;

/** Below a cent a day the projection is noise, so it is not shown. */
const MIN_DAILY_NANOS = NANOS_PER_USD / 100;
/** Past this the date stops being useful; say "more than N days" instead. */
export const CREDIT_RUNWAY_MAX_DAYS = 90;

export type CreditRunway =
	| { kind: "auto_top_up"; at: number; dailyUsd: number }
	| { kind: "runs_out"; at: number; dailyUsd: number }
	| { kind: "beyond"; days: number; dailyUsd: number };

/**
 * When the balance reaches the auto top-up threshold (or zero without auto
 * top-up) if credits keep being used at the recent daily pace.
 */
export function projectCreditRunway({
	balanceNanos,
	dailyNanos,
	observedAt,
	autoTopUpEnabled,
	autoTopUpThresholdNanos,
}: {
	balanceNanos: number;
	dailyNanos: number;
	observedAt: number;
	autoTopUpEnabled: boolean;
	autoTopUpThresholdNanos: number;
}): CreditRunway | null {
	if (!(dailyNanos >= MIN_DAILY_NANOS) || !(balanceNanos > 0)) return null;
	const dailyUsd = dailyNanos / NANOS_PER_USD;
	const topUp = autoTopUpEnabled && autoTopUpThresholdNanos > 0;
	const floor = topUp ? autoTopUpThresholdNanos : 0;
	// At or under the threshold the next charge triggers the top-up; there is nothing to project.
	if (balanceNanos <= floor) return null;

	const days = (balanceNanos - floor) / dailyNanos;
	if (days > CREDIT_RUNWAY_MAX_DAYS) return { kind: "beyond", days: CREDIT_RUNWAY_MAX_DAYS, dailyUsd };
	return { kind: topUp ? "auto_top_up" : "runs_out", at: Math.round(observedAt + days * DAY_MS), dailyUsd };
}
