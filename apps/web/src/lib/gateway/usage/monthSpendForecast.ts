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

/** One daily series projected to the end of this UTC month. */
export type MonthSeriesForecast = {
	monthStart: number;
	daysInMonth: number;
	elapsedDays: number;
	/** This month's total so far. */
	total: number;
	cumulative: Array<{ x: number; value: number }>;
	low: number;
	mid: number;
	high: number;
	previousMonth: number;
};

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Projects this UTC month's total of a daily series running from the start of
 * last month to today. Returns null too early in the month or when there is
 * nothing to project.
 */
export function forecastMonthSeries({
	days,
	observedAt,
}: {
	days: ReadonlyArray<{ date: string; value: number }>;
	observedAt: number;
}): MonthSeriesForecast | null {
	const now = new Date(observedAt);
	const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
	const monthEnd = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
	const previousMonthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1);
	const daysInMonth = Math.round((monthEnd - monthStart) / DAY_MS);
	const elapsedDays = (observedAt - monthStart) / DAY_MS;
	if (elapsedDays < MIN_ELAPSED_DAYS) return null;

	const byDay = new Map<string, number>();
	for (const day of days) {
		if (Number.isFinite(day.value) && day.value > 0) byDay.set(day.date, (byDay.get(day.date) ?? 0) + day.value);
	}
	const valueOn = (ms: number) => byDay.get(isoDay(ms)) ?? 0;

	const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
	const cumulative: MonthSeriesForecast["cumulative"] = [{ x: 0, value: 0 }];
	let total = 0;
	for (let dayStart = monthStart; dayStart <= todayStart; dayStart += DAY_MS) {
		total += valueOn(dayStart);
		const x = dayStart === todayStart ? elapsedDays : (dayStart - monthStart) / DAY_MS + 1;
		cumulative.push({ x, value: total });
	}

	let trailing = 0;
	for (let i = 1; i <= TRAILING_DAYS; i += 1) trailing += valueOn(todayStart - i * DAY_MS);
	const monthPace = total / elapsedDays;
	const recentPace = trailing / TRAILING_DAYS;
	if (!(monthPace > 0) && !(recentPace > 0)) return null;

	const remainingDays = daysInMonth - elapsedDays;
	const project = (pace: number) => total + pace * remainingDays;
	let previousMonth = 0;
	for (let dayStart = previousMonthStart; dayStart < monthStart; dayStart += DAY_MS) previousMonth += valueOn(dayStart);

	return {
		monthStart,
		daysInMonth,
		elapsedDays,
		total,
		cumulative,
		low: project(Math.min(monthPace, recentPace)),
		mid: project(monthPace),
		high: project(Math.max(monthPace, recentPace)),
		previousMonth,
	};
}

/** Projects this UTC month's spend from daily rollup totals; see {@link forecastMonthSeries}. */
export function forecastMonthSpend({
	days,
	observedAt,
}: {
	days: ReadonlyArray<{ date: string; costNanos: number }>;
	observedAt: number;
}): MonthSpendForecast | null {
	const forecast = forecastMonthSeries({ days: days.map((day) => ({ date: day.date, value: day.costNanos })), observedAt });
	if (!forecast) return null;
	return {
		monthStart: forecast.monthStart,
		daysInMonth: forecast.daysInMonth,
		elapsedDays: forecast.elapsedDays,
		spentNanos: forecast.total,
		cumulative: forecast.cumulative.map((point) => ({ x: point.x, nanos: point.value })),
		lowNanos: Math.round(forecast.low),
		midNanos: Math.round(forecast.mid),
		highNanos: Math.round(forecast.high),
		previousMonthNanos: forecast.previousMonth > 0 ? forecast.previousMonth : null,
	};
}
