import type { UsageRangePreset } from "./timeRange";

const DAY_MS = 86_400_000;
const NANOS_PER_USD = 1_000_000_000;
/** The recent pace is the average of the last complete UTC days. */
const PACE_DAYS = 7;
/** Too early in a period the pace swings wildly, so wait before projecting. */
const MIN_ELAPSED_DAYS = 3;
/** Daily totals are too coarse to forecast a shorter rolling window. */
const MIN_ROLLING_DAYS = 7;
const MAX_ROLLING_DAYS = 366;

/** One UTC day of exact workspace usage from the daily rollup. */
export type UsageDay = {
	date: string;
	costNanos: number;
	requests: number;
	successfulRequests: number;
	tokens: number;
	cachedTokens: number;
};

export type KpiId = "spend" | "requests" | "tokens" | "cache" | "success_rate" | "blended_price";

/**
 * What a KPI forecast covers. A running period (this week, month, quarter or
 * year, in UTC like billing) is projected to its end; a rolling window that
 * ends now is projected over the same length ahead.
 */
export type ForecastPeriod =
	| { kind: "running"; unit: "week" | "month" | "quarter" | "year"; start: number; end: number }
	| { kind: "rolling"; days: number };

/**
 * A KPI's forecast in its own units: a projected total for counts, or the
 * recent value for rates, which can't be projected. `value` is null when
 * there were no requests to take a rate from.
 */
export type KpiForecast =
	| { kind: "projected"; period: ForecastPeriod; low: number; mid: number; high: number }
	| { kind: "recent"; days: 1 | 7; value: number | null };

/**
 * The period the selected range can be forecast over, or null when there is
 * nothing ahead to forecast: ranges already over, custom ranges, and windows
 * shorter than the daily totals behind the forecast.
 */
export function forecastPeriod({
	preset,
	from,
	to,
	observedAt,
}: {
	preset: UsageRangePreset;
	from: string;
	to: string;
	observedAt: number;
}): ForecastPeriod | null {
	const now = new Date(observedAt);
	const [year, month] = [now.getUTCFullYear(), now.getUTCMonth()];
	switch (preset) {
		case "this_week": {
			// Weeks start on Monday, as in the range picker.
			const start = Date.UTC(year, month, now.getUTCDate() - ((now.getUTCDay() + 6) % 7));
			return { kind: "running", unit: "week", start, end: start + 7 * DAY_MS };
		}
		case "this_month":
			return { kind: "running", unit: "month", start: Date.UTC(year, month, 1), end: Date.UTC(year, month + 1, 1) };
		case "this_quarter": {
			const quarterMonth = Math.floor(month / 3) * 3;
			return { kind: "running", unit: "quarter", start: Date.UTC(year, quarterMonth, 1), end: Date.UTC(year, quarterMonth + 3, 1) };
		}
		case "this_year":
			return { kind: "running", unit: "year", start: Date.UTC(year, 0, 1), end: Date.UTC(year + 1, 0, 1) };
		case "last_7d":
		case "last_30d":
		case "last_90d":
		case "past_1y":
			break;
		default:
			if (!preset.startsWith("rel:")) return null;
	}
	const days = Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
	return days >= MIN_ROLLING_DAYS && days <= MAX_ROLLING_DAYS ? { kind: "rolling", days } : null;
}

type Projection = { low: number; mid: number; high: number };

/**
 * Projects one daily series over the period, between the slower and faster of
 * the period's own pace and the last week's. Null too early in a running
 * period, or when there is no usage to project from.
 */
function projectSeries(valueOn: (dayStart: number) => number, period: ForecastPeriod, observedAt: number): Projection | null {
	const now = new Date(observedAt);
	const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
	const sumDays = (count: number) => {
		let total = 0;
		for (let i = 1; i <= count; i += 1) total += valueOn(todayStart - i * DAY_MS);
		return total;
	};
	const recentPace = sumDays(PACE_DAYS) / PACE_DAYS;
	const range = (total: number, periodPace: number, days: number): Projection | null =>
		periodPace > 0 || recentPace > 0
			? {
				low: total + Math.min(periodPace, recentPace) * days,
				mid: total + periodPace * days,
				high: total + Math.max(periodPace, recentPace) * days,
			}
			: null;

	if (period.kind === "rolling") {
		// The window's complete days; today's partial total would drag its pace down.
		return range(0, sumDays(period.days) / period.days, period.days);
	}
	const elapsedDays = (observedAt - period.start) / DAY_MS;
	if (elapsedDays < Math.min(MIN_ELAPSED_DAYS, (period.end - period.start) / DAY_MS / 4)) return null;
	let total = 0;
	for (let dayStart = period.start; dayStart <= todayStart; dayStart += DAY_MS) total += valueOn(dayStart);
	return range(total, total / elapsedDays, (period.end - observedAt) / DAY_MS);
}

/**
 * A forecast for every overview KPI over the period, or null when there is
 * nothing to project yet. Rates show the last 7 days, or today when the
 * selected window is itself the last 7 days.
 */
export function periodKpiForecasts({
	days,
	observedAt,
	period,
}: {
	days: ReadonlyArray<UsageDay>;
	observedAt: number;
	period: ForecastPeriod;
}): Record<KpiId, KpiForecast> | null {
	const byDay = new Map(days.map((day) => [day.date, day]));
	const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
	const series = (pick: (day: UsageDay) => number) => (dayStart: number) => {
		const day = byDay.get(isoDay(dayStart));
		const value = day ? pick(day) : 0;
		return Number.isFinite(value) && value > 0 ? value : 0;
	};
	const requests = projectSeries(series((day) => day.requests), period, observedAt);
	if (!requests) return null;
	const projected = (projection: Projection | null, scale = 1): KpiForecast => ({
		kind: "projected",
		period,
		low: (projection?.low ?? 0) / scale,
		mid: (projection?.mid ?? 0) / scale,
		high: (projection?.high ?? 0) / scale,
	});

	const recentDays = period.kind === "rolling" && period.days <= PACE_DAYS ? 1 : 7;
	const now = new Date(observedAt);
	const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
	const sumRecent = (pick: (day: UsageDay) => number) => {
		const valueOn = series(pick);
		let total = 0;
		for (let i = 0; i < recentDays; i += 1) total += valueOn(todayStart - i * DAY_MS);
		return total;
	};
	const recentRequests = sumRecent((day) => day.requests);
	const recentTokens = sumRecent((day) => day.tokens);
	const recent = (value: number | null): KpiForecast => ({ kind: "recent", days: recentDays, value });

	return {
		spend: projected(projectSeries(series((day) => day.costNanos), period, observedAt), NANOS_PER_USD),
		requests: projected(requests),
		tokens: projected(projectSeries(series((day) => day.tokens), period, observedAt)),
		cache: recent(recentTokens > 0 ? sumRecent((day) => day.cachedTokens) / recentTokens : null),
		success_rate: recent(recentRequests > 0 ? sumRecent((day) => day.successfulRequests) / recentRequests : null),
		blended_price: recent(recentTokens > 0 ? (sumRecent((day) => day.costNanos) / NANOS_PER_USD / recentTokens) * 1_000_000 : null),
	};
}
