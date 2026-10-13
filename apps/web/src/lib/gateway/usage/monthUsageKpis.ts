import { forecastMonthSeries } from "./monthSpendForecast";

const NANOS_PER_USD = 1_000_000_000;

/** One UTC day of exact workspace usage from the daily rollup. */
export type MonthUsageDay = {
	date: string;
	costNanos: number;
	requests: number;
	successfulRequests: number;
	tokens: number;
	cachedTokens: number;
};

export type MonthKpiId = "spend" | "requests" | "tokens" | "cache" | "success_rate" | "blended_price";

/**
 * A KPI's figure for this UTC month, in the KPI's own units: a projected
 * month-end total for counts, or the month so far for rates.
 */
export type MonthKpiFigure =
	| { kind: "projected"; low: number; mid: number; high: number }
	| { kind: "to_date"; value: number };

/**
 * This month's figure for every overview KPI, or null when the workspace has
 * no usage this month. Totals fall back to the month so far until there is
 * enough of the month to project from.
 */
export function monthKpiFigures({
	days,
	observedAt,
}: {
	days: ReadonlyArray<MonthUsageDay>;
	observedAt: number;
}): Record<MonthKpiId, MonthKpiFigure> | null {
	const now = new Date(observedAt);
	const monthStartDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
	const thisMonth = days.filter((day) => day.date >= monthStartDate);
	const sum = (pick: (day: MonthUsageDay) => number) => thisMonth.reduce((total, day) => total + (Number.isFinite(pick(day)) ? pick(day) : 0), 0);
	const requests = sum((day) => day.requests);
	if (!(requests > 0)) return null;
	const spendUsd = sum((day) => day.costNanos) / NANOS_PER_USD;
	const tokens = sum((day) => day.tokens);

	const total = (pick: (day: MonthUsageDay) => number, scale = 1): MonthKpiFigure => {
		const forecast = forecastMonthSeries({ days: days.map((day) => ({ date: day.date, value: pick(day) })), observedAt });
		return forecast
			? { kind: "projected", low: forecast.low / scale, mid: forecast.mid / scale, high: forecast.high / scale }
			: { kind: "to_date", value: sum(pick) / scale };
	};

	return {
		spend: total((day) => day.costNanos, NANOS_PER_USD),
		requests: total((day) => day.requests),
		tokens: total((day) => day.tokens),
		cache: { kind: "to_date", value: tokens > 0 ? sum((day) => day.cachedTokens) / tokens : 0 },
		success_rate: { kind: "to_date", value: sum((day) => day.successfulRequests) / requests },
		blended_price: { kind: "to_date", value: tokens > 0 ? (spendUsd / tokens) * 1_000_000 : 0 },
	};
}
