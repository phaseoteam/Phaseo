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
	/** Daily workspace usage from {@link usageDaysStartDate} to today (UTC), oldest first. */
	days: MonthUsageDay[];
};

const DAY_MS = 86_400_000;
/** The overview projects from the last week's pace as well as the period's own. */
const PACE_DAYS = 7;
/** A cap on how far back the overview reads, whatever range is selected. */
const MAX_HISTORY_DAYS = 400;

/**
 * The first rollup day (`usage_date`, YYYY-MM-DD) the overview's forecasts need:
 * the start of last month for the month chart, or a week before the selected
 * period starts when that is earlier, but never more than 400 days back.
 */
export function usageDaysStartDate(now: number, periodFrom: number): string {
	const date = new Date(now);
	const previousMonthStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1);
	const periodStart = Number.isFinite(periodFrom) ? periodFrom - (PACE_DAYS + 1) * DAY_MS : previousMonthStart;
	const start = Math.max(now - MAX_HISTORY_DAYS * DAY_MS, Math.min(previousMonthStart, periodStart));
	return new Date(start).toISOString().slice(0, 10);
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
