import type { UsageRangePreset } from "./timeRange";

const DAY_MS = 86_400_000;
/** The recent pace is the average over the last 7 days. */
export const RECENT_PACE_DAYS = 7;
/** Too early in a period its own pace swings wildly, so project from the recent pace alone until then. */
const MIN_ELAPSED_DAYS = 3;
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
type TotalId = "spend" | "requests" | "tokens";

/**
 * What a KPI forecast covers. A running period (today, this week, month,
 * quarter or year) is projected to its local end, as the card counts it. A
 * rolling window that ends now is projected over the same length ahead.
 */
export type ForecastPeriod =
	| { kind: "running"; unit: "day" | "week" | "month" | "quarter" | "year"; start: number; end: number }
	| { kind: "rolling"; days: number };

/**
 * A KPI card's footer, in the KPI's own units.
 * - `projected`: a total projected over the period.
 * - `change`: a total's change from the previous period, for ranges with nothing ahead to forecast.
 * - `previous`: a rate in the previous period, since rates can't be projected.
 * A `value` is null when the previous period had no requests to take a rate from.
 */
export type KpiFooter =
	| { kind: "projected"; period: ForecastPeriod; low: number; mid: number; high: number }
	| { kind: "change"; value: number }
	| { kind: "previous"; value: number | null };

/** A card's figure for the selected range and the previous period. */
export type KpiCard = { value: number; previous: number };

/** Totals over the last {@link RECENT_PACE_DAYS} days, under the same filters as the cards. */
export type RecentTotals = Record<TotalId, number>;

const RUNNING_PERIODS = {
	today: { unit: "day", next: (date: Date) => date.setDate(date.getDate() + 1) },
	this_week: { unit: "week", next: (date: Date) => date.setDate(date.getDate() + 7) },
	this_month: { unit: "month", next: (date: Date) => date.setMonth(date.getMonth() + 1) },
	this_quarter: { unit: "quarter", next: (date: Date) => date.setMonth(date.getMonth() + 3) },
	this_year: { unit: "year", next: (date: Date) => date.setFullYear(date.getFullYear() + 1) },
} as const;

/**
 * The period the selected range can be forecast over, or null when there is
 * nothing ahead to forecast: finished ranges, custom ranges, and windows
 * shorter than a day. `from` and `to` are the resolved range, whose running
 * periods start on local boundaries.
 */
export function forecastPeriod({
	preset,
	from,
	to,
}: {
	preset: UsageRangePreset;
	from: string;
	to: string;
}): ForecastPeriod | null {
	const start = Date.parse(from);
	if (!Number.isFinite(start)) return null;
	if (Object.hasOwn(RUNNING_PERIODS, preset)) {
		const { unit, next } = RUNNING_PERIODS[preset as keyof typeof RUNNING_PERIODS];
		// Local calendar arithmetic, so a day with a clock change still ends at midnight.
		const end = new Date(start);
		next(end);
		return { kind: "running", unit, start, end: end.getTime() };
	}
	switch (preset) {
		case "past_24h":
		case "past_2d":
		case "last_7d":
		case "last_30d":
		case "last_90d":
		case "past_1y":
			break;
		default:
			// Relative windows of whole days or longer; minutes and hours are too short.
			if (!/^rel:\d+(d|w|mo|y)$/.test(preset)) return null;
	}
	const days = Math.round((Date.parse(to) - start) / DAY_MS);
	return days >= 1 && days <= MAX_ROLLING_DAYS ? { kind: "rolling", days } : null;
}

type Projection = { low: number; mid: number; high: number };

/**
 * Projects a total between the slower and faster of the period's own pace and
 * the last week's, from `base` (the total so far for a running period, zero
 * for the window ahead of a rolling one). Null when there is no usage to
 * project from.
 */
function project({ base, total, elapsedDays, remainingDays, minElapsedDays, recentPace }: {
	base: number;
	total: number;
	elapsedDays: number;
	remainingDays: number;
	minElapsedDays: number;
	recentPace: number;
}): Projection | null {
	const periodPace = elapsedDays >= minElapsedDays && elapsedDays > 0 ? total / elapsedDays : null;
	if (!((periodPace ?? 0) > 0) && !(recentPace > 0)) return null;
	const [slow, fast] = periodPace === null ? [recentPace, recentPace] : [Math.min(periodPace, recentPace), Math.max(periodPace, recentPace)];
	return {
		low: base + slow * remainingDays,
		mid: base + (periodPace ?? recentPace) * remainingDays,
		high: base + fast * remainingDays,
	};
}

/**
 * A forecast for each overview total over the period, from the cards' totals
 * so far and the last week's pace, or null when there is nothing to project.
 * `observedAt` is when the cards' totals end.
 */
export function periodKpiForecasts({
	observedAt,
	period,
	cards,
	recent,
}: {
	observedAt: number;
	period: ForecastPeriod;
	cards: Record<TotalId, KpiCard>;
	recent: RecentTotals;
}): Record<TotalId, KpiFooter> | null {
	const projectTotal = (id: TotalId): Projection | null => {
		const total = cards[id].value;
		const recentPace = recent[id] / RECENT_PACE_DAYS;
		if (period.kind === "rolling") {
			return project({ base: 0, total, elapsedDays: period.days, remainingDays: period.days, minElapsedDays: 0, recentPace });
		}
		return project({
			base: total,
			total,
			elapsedDays: (observedAt - period.start) / DAY_MS,
			remainingDays: Math.max(0, (period.end - observedAt) / DAY_MS),
			minElapsedDays: Math.min(MIN_ELAPSED_DAYS, (period.end - period.start) / DAY_MS / 4),
			recentPace,
		});
	};
	const requests = projectTotal("requests");
	if (!requests) return null;
	// Free usage has requests to project but no spend.
	const projected = (projection: Projection | null): KpiFooter => ({
		kind: "projected",
		period,
		low: projection?.low ?? 0,
		mid: projection?.mid ?? 0,
		high: projection?.high ?? 0,
	});
	return {
		spend: projected(projectTotal("spend")),
		requests: projected(requests),
		tokens: projected(projectTotal("tokens")),
	};
}

/**
 * Every KPI card's footer. Totals show a forecast over the selected period
 * where there is one, otherwise their change from the previous period; rates
 * show their value in the previous period. `period` is null for ranges with
 * nothing ahead to forecast.
 */
export function kpiFooters({
	observedAt,
	period,
	cards,
	recent,
}: {
	observedAt: number;
	period: ForecastPeriod | null;
	cards: Record<KpiId, KpiCard>;
	recent: RecentTotals | null;
}): Record<KpiId, KpiFooter> {
	const forecasts = period && recent ? periodKpiForecasts({ observedAt, period, cards, recent }) : null;
	const total = (id: TotalId): KpiFooter => forecasts?.[id] ?? { kind: "change", value: cards[id].value - cards[id].previous };
	// A rate needs requests to come from.
	const previous = (id: KpiId): KpiFooter => ({ kind: "previous", value: cards.requests.previous > 0 ? cards[id].previous : null });
	return {
		spend: total("spend"),
		requests: total("requests"),
		tokens: total("tokens"),
		cache: previous("cache"),
		success_rate: previous("success_rate"),
		blended_price: previous("blended_price"),
	};
}
