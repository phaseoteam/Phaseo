/** Rows are per workspace, day, model, app and colo; this bounds a two-month read generously. */
export const MONTH_USAGE_ROW_LIMIT = 20_000;

/** Token meters a rollup may carry; requests report a total, an input/output split, or both. */
export const MONTH_USAGE_TOKEN_METERS = ["total_tokens", "input_tokens", "output_tokens"] as const;

export const MONTH_USAGE_SELECT =
	"usage_date,cost_nanos,requests,successful_requests,cached_input_tokens,v2_private_usage_daily_meters(meter_key,quantity)";

type Quantity = number | string | null | undefined;

export type MonthUsageRow = {
	usage_date: string | null;
	cost_nanos: Quantity;
	requests?: Quantity;
	successful_requests?: Quantity;
	cached_input_tokens?: Quantity;
	v2_private_usage_daily_meters?: Array<{ meter_key: string | null; quantity: Quantity }> | null;
};

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

const quantity = (value: Quantity) => {
	const number = Number(value ?? 0);
	return Number.isFinite(number) && number > 0 ? number : 0;
};

/**
 * A rollup's tokens, counted like the overview counts a request: the reported total,
 * or input plus output. Rollups mix both kinds of request, so take the larger sum.
 */
function rollupTokens(meters: MonthUsageRow["v2_private_usage_daily_meters"]): number {
	const sums = new Map<string, number>();
	for (const meter of meters ?? []) {
		if (meter.meter_key) sums.set(meter.meter_key, (sums.get(meter.meter_key) ?? 0) + quantity(meter.quantity));
	}
	return Math.max(sums.get("total_tokens") ?? 0, (sums.get("input_tokens") ?? 0) + (sums.get("output_tokens") ?? 0));
}

/** Sums rollup rows into one total per UTC day. */
export function dailyUsageTotals(rows: ReadonlyArray<MonthUsageRow>, observedAt: number): MonthUsageDays {
	const totals = new Map<string, MonthUsageDay>();
	for (const row of rows) {
		const date = typeof row.usage_date === "string" ? row.usage_date.slice(0, 10) : "";
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
		const day = totals.get(date) ?? { date, costNanos: 0, requests: 0, successfulRequests: 0, tokens: 0, cachedTokens: 0 };
		day.costNanos += quantity(row.cost_nanos);
		day.requests += quantity(row.requests);
		day.successfulRequests += quantity(row.successful_requests);
		day.tokens += rollupTokens(row.v2_private_usage_daily_meters);
		day.cachedTokens += quantity(row.cached_input_tokens);
		totals.set(date, day);
	}
	return {
		observedAt,
		days: [...totals.values()]
			.sort((left, right) => left.date.localeCompare(right.date))
			.map((day) => ({ ...day, costNanos: Math.round(day.costNanos) })),
	};
}
