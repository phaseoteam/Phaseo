export type MonthUsageDay = {
	date: string;
	costNanos: number;
	requests: number;
	successfulRequests: number;
	tokens: number;
	cachedTokens: number;
};

export type MonthUsageDays = {
	/** When the totals were read, so clients project from the same instant. */
	observedAt: number;
	/** Daily workspace usage from the start of last month (UTC) to today, oldest first. */
	days: MonthUsageDay[];
};

/** The first day of the previous UTC month, as the rollup's `usage_date` (YYYY-MM-DD). */
export function monthUsageStartDate(now: number): string {
	const date = new Date(now);
	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
}

const count = (value: unknown) => {
	const number = Number(value ?? 0);
	return Number.isFinite(number) && number > 0 ? number : 0;
};

/** Reads `get_private_usage_month_days` output, dropping malformed days. */
export function parseMonthUsageDays(value: unknown, observedAt: number): MonthUsageDays {
	const days = (Array.isArray(value) ? value : []).flatMap((item): MonthUsageDay[] => {
		const day = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
		const date = typeof day.date === "string" ? day.date.slice(0, 10) : "";
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
		return [{
			date,
			costNanos: count(day.costNanos),
			requests: count(day.requests),
			successfulRequests: count(day.successfulRequests),
			tokens: count(day.tokens),
			cachedTokens: count(day.cachedTokens),
		}];
	});
	return { observedAt, days: days.sort((left, right) => left.date.localeCompare(right.date)) };
}
