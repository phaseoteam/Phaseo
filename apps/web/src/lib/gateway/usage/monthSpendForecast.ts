const DAY_MS = 86_400_000;
/** Too early in the month the pace swings wildly, so wait before projecting. */
const MIN_ELAPSED_DAYS = 3;
const TRAILING_DAYS = 7;

export type MonthSpendForecast = {
	monthStart: number;
	daysInMonth: number;
	/** Days since the month started, fractional (today is partly elapsed). */
	elapsedDays: number;
	spentNanos: number;
	/** Cumulative spend at the end of each completed day, then now; x is days elapsed. */
	cumulative: Array<{ x: number; nanos: number }>;
	/** Projected month-end totals from the slower and faster of the month-to-date and recent paces. */
	lowNanos: number;
	midNanos: number;
	highNanos: number;
	/** Last month's total, or null when there was none to compare with. */
	previousMonthNanos: number | null;
};

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Projects this UTC month's spend from daily rollup totals running from the
 * start of last month to today. Returns null too early in the month or when
 * there is no spend to project.
 */
export function forecastMonthSpend({
	days,
	observedAt,
}: {
	days: ReadonlyArray<{ date: string; costNanos: number }>;
	observedAt: number;
}): MonthSpendForecast | null {
	const now = new Date(observedAt);
	const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
	const monthEnd = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
	const previousMonthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1);
	const daysInMonth = Math.round((monthEnd - monthStart) / DAY_MS);
	const elapsedDays = (observedAt - monthStart) / DAY_MS;
	if (elapsedDays < MIN_ELAPSED_DAYS) return null;

	const byDay = new Map<string, number>();
	for (const day of days) {
		if (Number.isFinite(day.costNanos) && day.costNanos > 0) byDay.set(day.date, (byDay.get(day.date) ?? 0) + day.costNanos);
	}
	const spendOn = (ms: number) => byDay.get(isoDay(ms)) ?? 0;

	const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
	const cumulative: MonthSpendForecast["cumulative"] = [{ x: 0, nanos: 0 }];
	let spentNanos = 0;
	for (let dayStart = monthStart; dayStart <= todayStart; dayStart += DAY_MS) {
		spentNanos += spendOn(dayStart);
		const x = dayStart === todayStart ? elapsedDays : (dayStart - monthStart) / DAY_MS + 1;
		cumulative.push({ x, nanos: spentNanos });
	}

	let trailingNanos = 0;
	for (let i = 1; i <= TRAILING_DAYS; i += 1) trailingNanos += spendOn(todayStart - i * DAY_MS);
	const monthPace = spentNanos / elapsedDays;
	const recentPace = trailingNanos / TRAILING_DAYS;
	if (!(monthPace > 0) && !(recentPace > 0)) return null;

	const remainingDays = daysInMonth - elapsedDays;
	const project = (pace: number) => Math.round(spentNanos + pace * remainingDays);
	let previousMonthNanos = 0;
	for (let dayStart = previousMonthStart; dayStart < monthStart; dayStart += DAY_MS) previousMonthNanos += spendOn(dayStart);

	return {
		monthStart,
		daysInMonth,
		elapsedDays,
		spentNanos,
		cumulative,
		lowNanos: project(Math.min(monthPace, recentPace)),
		midNanos: project(monthPace),
		highNanos: project(Math.max(monthPace, recentPace)),
		previousMonthNanos: previousMonthNanos > 0 ? previousMonthNanos : null,
	};
}
