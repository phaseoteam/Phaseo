import type { UsageRangePreset } from "./timeRange";

const DAY_MS = 86_400_000;
const NANOS_PER_USD = 1_000_000_000;
/** The recent pace is the average of the last complete UTC days. */
const PACE_DAYS = 7;
/** Too early in a period its own pace swings wildly, so project from the recent pace alone until then. */
const MIN_ELAPSED_DAYS = 3;
/** Rolling windows this long are summed from the daily rollup; shorter ones from the card's own figure. */
const MIN_ROLLUP_DAYS = 7;
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
 * What a KPI forecast covers. A running period is projected to its end: today
 * in local time, as the card counts it, and this week, month, quarter or year
 * in UTC, like billing. A rolling window that ends now is projected over the
 * same length ahead.
 */
export type ForecastPeriod =
	| { kind: "running"; unit: "day" | "week" | "month" | "quarter" | "year"; start: number; end: number }
	| { kind: "rolling"; days: number };

/**
 * A KPI card's footer, in the KPI's own units.
 * - `projected`: a total projected over the period.
 * - `recent`: a rate over the last 7 days (or today), since rates can't be projected.
 * - `change`: a total's change from the previous period, for ranges with nothing ahead to forecast.
 * - `previous`: a rate in the previous period, alongside `change`.
 * A `value` is null when there were no requests to take a rate from.
 */
export type KpiFooter =
	| { kind: "projected"; period: ForecastPeriod; low: number; mid: number; high: number }
	| { kind: "recent"; days: 1 | 7; value: number | null }
	| { kind: "change"; value: number }
	| { kind: "previous"; value: number | null };

/** A card's figure for the selected range and the same length before it. */
export type KpiCard = { value: number; previous: number };

/**
 * The period the selected range can be forecast over, or null when there is
 * nothing ahead to forecast: finished ranges, custom ranges, and windows
 * shorter than a day.
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
		case "today": {
			const start = Date.parse(from);
			return Number.isFinite(start) ? { kind: "running", unit: "day", start, end: start + DAY_MS } : null;
		}
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
	const days = Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
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

/** Whether the period's total so far comes from the card (today, short windows) rather than the UTC daily rollup. */
function usesCardTotal(period: ForecastPeriod) {
	return period.kind === "running" ? period.unit === "day" : period.days < MIN_ROLLUP_DAYS;
}

const TOTALS = [
	{ id: "spend", pick: (day: UsageDay) => day.costNanos, scale: NANOS_PER_USD },
	{ id: "requests", pick: (day: UsageDay) => day.requests, scale: 1 },
	{ id: "tokens", pick: (day: UsageDay) => day.tokens, scale: 1 },
] as const;

/**
 * A forecast for every overview KPI over the period, or null when there is
 * nothing to project. Totals for today and windows under a week come from
 * `cards`, which must then be complete; everything else comes from the
 * rollup. Rates show the last 7 days, or today when the selected window is a
 * week or less.
 */
export function periodKpiForecasts({
	days,
	observedAt,
	period,
	cards,
}: {
	days: ReadonlyArray<UsageDay>;
	observedAt: number;
	period: ForecastPeriod;
	cards?: Partial<Record<KpiId, KpiCard>>;
}): Record<KpiId, KpiFooter> | null {
	const byDay = new Map(days.map((day) => [day.date, day]));
	const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
	const now = new Date(observedAt);
	const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
	const valueOn = (pick: (day: UsageDay) => number, dayStart: number) => {
		const day = byDay.get(isoDay(dayStart));
		const value = day ? pick(day) : 0;
		return Number.isFinite(value) && value > 0 ? value : 0;
	};
	/** The `count` UTC days before today, or ending today when `includeToday`. */
	const sumDays = (pick: (day: UsageDay) => number, count: number, includeToday = false) => {
		let total = 0;
		for (let i = includeToday ? 0 : 1; i < count + (includeToday ? 0 : 1); i += 1) total += valueOn(pick, todayStart - i * DAY_MS);
		return total;
	};
	const fromCard = usesCardTotal(period);

	const projectTotal = ({ id, pick, scale }: (typeof TOTALS)[number]): Projection | null => {
		const recentPace = sumDays(pick, PACE_DAYS) / PACE_DAYS;
		const card = cards?.[id];
		if (fromCard && !card) return null;
		if (period.kind === "rolling") {
			// From the rollup, the window's complete days; today's partial total would drag its pace down.
			const total = fromCard ? card!.value * scale : sumDays(pick, period.days);
			return project({ base: 0, total, elapsedDays: period.days, remainingDays: period.days, minElapsedDays: 0, recentPace });
		}
		let total = 0;
		if (fromCard) total = card!.value * scale;
		else for (let dayStart = period.start; dayStart <= todayStart; dayStart += DAY_MS) total += valueOn(pick, dayStart);
		const minElapsedDays = Math.min(MIN_ELAPSED_DAYS, (period.end - period.start) / DAY_MS / 4);
		return project({ base: total, total, elapsedDays: (observedAt - period.start) / DAY_MS, remainingDays: (period.end - observedAt) / DAY_MS, minElapsedDays, recentPace });
	};

	const [spend, requests, tokens] = TOTALS.map(projectTotal);
	if (!requests) return null;
	const projected = (projection: Projection | null, scale = 1): KpiFooter => ({
		kind: "projected",
		period,
		low: (projection?.low ?? 0) / scale,
		mid: (projection?.mid ?? 0) / scale,
		high: (projection?.high ?? 0) / scale,
	});

	const recentDays = period.kind === "rolling" && period.days <= PACE_DAYS ? 1 : 7;
	const sumRecent = (pick: (day: UsageDay) => number) => sumDays(pick, recentDays, true);
	const recentRequests = sumRecent((day) => day.requests);
	const recentTokens = sumRecent((day) => day.tokens);
	const recent = (value: number | null): KpiFooter => ({ kind: "recent", days: recentDays, value });

	return {
		spend: projected(spend, NANOS_PER_USD),
		requests: projected(requests),
		tokens: projected(tokens),
		cache: recent(recentTokens > 0 ? sumRecent((day) => day.cachedTokens) / recentTokens : null),
		success_rate: recent(recentRequests > 0 ? sumRecent((day) => day.successfulRequests) / recentRequests : null),
		blended_price: recent(recentTokens > 0 ? (sumRecent((day) => day.costNanos) / NANOS_PER_USD / recentTokens) * 1_000_000 : null),
	};
}

/**
 * Every KPI card's footer: a forecast over the selected period where there is
 * one, otherwise each total's change from the previous period and each rate's
 * previous value. Null when the cards are built from a request sample, since a
 * sampled total says nothing about the change.
 *
 * `days` is null for filtered views, where the workspace-wide rollup doesn't
 * apply; `period` is null for ranges with nothing ahead to forecast.
 */
export function kpiFooters({
	days,
	observedAt,
	period,
	cards,
	currentComplete,
	previousComplete,
}: {
	days: ReadonlyArray<UsageDay> | null;
	observedAt: number;
	period: ForecastPeriod | null;
	cards: Record<KpiId, KpiCard>;
	currentComplete: boolean;
	previousComplete: boolean;
}): Record<KpiId, KpiFooter> | null {
	if (days && period && (currentComplete || !usesCardTotal(period))) {
		const forecasts = periodKpiForecasts({ days, observedAt, period, cards });
		if (forecasts) return forecasts;
	}
	if (!currentComplete || !previousComplete) return null;
	const change = (id: KpiId): KpiFooter => ({ kind: "change", value: cards[id].value - cards[id].previous });
	// A rate needs requests to come from.
	const previous = (id: KpiId): KpiFooter => ({ kind: "previous", value: cards.requests.previous > 0 ? cards[id].previous : null });
	return {
		spend: change("spend"),
		requests: change("requests"),
		tokens: change("tokens"),
		cache: previous("cache"),
		success_rate: previous("success_rate"),
		blended_price: previous("blended_price"),
	};
}
