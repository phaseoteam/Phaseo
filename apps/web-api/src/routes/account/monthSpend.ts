/** Rows are per workspace, day, model, app and colo; this bounds a two-month read generously. */
export const MONTH_SPEND_ROW_LIMIT = 20_000;

export type MonthSpendDays = {
	/** When the totals were read, so clients project from the same instant. */
	observedAt: number;
	/** Daily spend from the start of last month (UTC) to today, oldest first. */
	days: Array<{ date: string; costNanos: number }>;
};

/** The first day of the previous UTC month, as the rollup's `usage_date` (YYYY-MM-DD). */
export function monthSpendStartDate(now: number): string {
	const date = new Date(now);
	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
}

/** Sums rollup rows into one total per UTC day. */
export function dailySpendTotals(
	rows: ReadonlyArray<{ usage_date: string | null; cost_nanos: number | string | null }>,
	observedAt: number,
): MonthSpendDays {
	const totals = new Map<string, number>();
	for (const row of rows) {
		const date = typeof row.usage_date === "string" ? row.usage_date.slice(0, 10) : "";
		const nanos = Number(row.cost_nanos ?? 0);
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(nanos)) continue;
		totals.set(date, (totals.get(date) ?? 0) + nanos);
	}
	return {
		observedAt,
		days: [...totals.entries()]
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([date, costNanos]) => ({ date, costNanos: Math.round(costNanos) })),
	};
}
