const DAY_MS = 86_400_000;

/** How far back to measure the pace credits are being used at. */
export const CREDIT_SPEND_WINDOW_DAYS = 7;

export type RecentCreditSpend = {
	/** Average credits charged per day over the window, in nanos. */
	dailyNanos: number;
	/** Length of the measured window in days. */
	windowDays: number;
	/** When the spend was measured, so clients project from the same instant. */
	observedAt: number;
};

/** Start of the measured window, for `get_workspace_recent_credit_spend`'s `p_since`. */
export function creditSpendWindowStart(observedAt: number): string {
	return new Date(observedAt - CREDIT_SPEND_WINDOW_DAYS * DAY_MS).toISOString();
}

/** Average daily credit spend from the window's total, as summed by `get_workspace_recent_credit_spend`. */
export function recentCreditSpend(totalNanos: unknown, observedAt: number): RecentCreditSpend {
	const total = Number(totalNanos ?? 0);
	return {
		dailyNanos: Number.isFinite(total) && total > 0 ? Math.round(total / CREDIT_SPEND_WINDOW_DAYS) : 0,
		windowDays: CREDIT_SPEND_WINDOW_DAYS,
		observedAt,
	};
}
