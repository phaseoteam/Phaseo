const DAY_MS = 86_400_000;

/** How far back to measure the pace credits are being used at. */
export const CREDIT_SPEND_WINDOW_DAYS = 7;
/** Bounds the rows read; busier workspaces are measured over the span these rows cover. */
export const CREDIT_SPEND_ROW_LIMIT = 5000;

export type RecentCreditSpend = {
	/** Average credits charged per day over the measured span, in nanos. */
	dailyNanos: number;
	/** Length of the measured span in days (shorter than the window when the row limit is hit). */
	windowDays: number;
	/** When the spend was measured, so clients project from the same instant. */
	observedAt: number;
};

/**
 * Average daily credit spend from the wallet charges applied recently.
 * `rows` must be the newest charges first, as returned by the bounded query.
 */
export function summariseRecentCreditSpend(
	rows: ReadonlyArray<{ cost_nanos: number | string | null; created_at: string | null }>,
	observedAt: number,
	rowLimit = CREDIT_SPEND_ROW_LIMIT,
): RecentCreditSpend {
	const windowStart = observedAt - CREDIT_SPEND_WINDOW_DAYS * DAY_MS;
	let start = windowStart;
	if (rows.length >= rowLimit) {
		const oldest = Date.parse(String(rows[rows.length - 1]?.created_at ?? ""));
		if (Number.isFinite(oldest)) start = Math.max(windowStart, oldest);
	}
	const spanMs = Math.max(observedAt - start, DAY_MS / 24);
	const totalNanos = rows.reduce((sum, row) => {
		const nanos = Number(row.cost_nanos ?? 0);
		return Number.isFinite(nanos) && nanos > 0 ? sum + nanos : sum;
	}, 0);
	return {
		dailyNanos: Math.round((totalNanos * DAY_MS) / spanMs),
		windowDays: Number((spanMs / DAY_MS).toFixed(2)),
		observedAt,
	};
}
