import { forecastPeriod, periodKpiForecasts, type ForecastPeriod, type UsageDay } from "./periodUsageKpis";

const DAY_MS = 86_400_000;

const day = (date: string, overrides: Partial<UsageDay> = {}): UsageDay => ({
	date,
	costNanos: 2_000_000_000,
	requests: 100,
	successfulRequests: 98,
	tokens: 50_000,
	cachedTokens: 10_000,
	...overrides,
});

/** Consecutive days ending on (and including) `last`. */
const daysEnding = (last: string, count: number, overrides: Partial<UsageDay> = {}) =>
	Array.from({ length: count }, (_, i) => day(new Date(Date.parse(last) - (count - 1 - i) * DAY_MS).toISOString().slice(0, 10), overrides));

// Noon on Thursday Oct 15.
const observedAt = Date.parse("2026-10-15T12:00:00Z");

describe("forecastPeriod", () => {
	const range = (fromDaysAgo: number) => ({ from: new Date(observedAt - fromDaysAgo * DAY_MS).toISOString(), to: new Date(observedAt).toISOString(), observedAt });

	test("runs this week, month, quarter and year to their UTC ends", () => {
		expect(forecastPeriod({ preset: "this_week", ...range(3) })).toEqual({ kind: "running", unit: "week", start: Date.parse("2026-10-12"), end: Date.parse("2026-10-19") });
		expect(forecastPeriod({ preset: "this_month", ...range(14) })).toEqual({ kind: "running", unit: "month", start: Date.parse("2026-10-01"), end: Date.parse("2026-11-01") });
		expect(forecastPeriod({ preset: "this_quarter", ...range(14) })).toEqual({ kind: "running", unit: "quarter", start: Date.parse("2026-10-01"), end: Date.parse("2027-01-01") });
		expect(forecastPeriod({ preset: "this_year", ...range(288) })).toEqual({ kind: "running", unit: "year", start: Date.parse("2026-01-01"), end: Date.parse("2027-01-01") });
	});

	test("projects a rolling window ending now over the same length ahead", () => {
		expect(forecastPeriod({ preset: "last_30d", ...range(30) })).toEqual({ kind: "rolling", days: 30 });
		expect(forecastPeriod({ preset: "last_7d", ...range(7) })).toEqual({ kind: "rolling", days: 7 });
		expect(forecastPeriod({ preset: "rel:2w", ...range(14) })).toEqual({ kind: "rolling", days: 14 });
	});

	test("has nothing to forecast for finished, custom or sub-week ranges", () => {
		for (const preset of ["last_month", "yesterday", "last_week", "custom", "today", "past_24h", "past_2d", "live"] as const) {
			expect(forecastPeriod({ preset, ...range(2) })).toBeNull();
		}
		expect(forecastPeriod({ preset: "rel:3d", ...range(3) })).toBeNull();
		expect(forecastPeriod({ preset: "rel:2y", ...range(730) })).toBeNull();
	});
});

describe("periodKpiForecasts", () => {
	test("projects totals to the end of a running month and gives rates for the last 7 days", () => {
		const period: ForecastPeriod = { kind: "running", unit: "month", start: Date.parse("2026-10-01"), end: Date.parse("2026-11-01") };
		// September's failures sit outside the last 7 days.
		const days = [day("2026-09-30", { requests: 999, successfulRequests: 0 }), ...daysEnding("2026-10-15", 15)];
		const forecasts = periodKpiForecasts({ days, observedAt, period });
		expect(forecasts).not.toBeNull();
		const f = forecasts!;
		// 1,500 requests so far over 14.5 days (today's rollup included); the last week ran at 100/day.
		const remaining = 16.5;
		const periodPace = 1500 + (1500 / 14.5) * remaining;
		expect(f.requests).toEqual({ kind: "projected", period, low: 1500 + 100 * remaining, mid: periodPace, high: periodPace });
		expect(f.spend.kind === "projected" && f.spend.low).toBeCloseTo(30 + 2 * remaining);
		expect(f.success_rate).toEqual({ kind: "recent", days: 7, value: 0.98 });
		expect(f.cache).toEqual({ kind: "recent", days: 7, value: 0.2 });
		expect(f.blended_price).toEqual({ kind: "recent", days: 7, value: 40 });
	});

	test("projects the next 30 days from the last 30 and the last week", () => {
		const period: ForecastPeriod = { kind: "rolling", days: 30 };
		// A busy September (500/day) that slowed to 100/day for the last week, plus a partial today that is ignored.
		const days = [...daysEnding("2026-10-07", 23, { requests: 500 }), ...daysEnding("2026-10-14", 7), day("2026-10-15", { requests: 1 })];
		const f = periodKpiForecasts({ days, observedAt, period })!;
		expect(f.requests).toMatchObject({ kind: "projected", period, low: 3000 });
		expect(f.requests.kind === "projected" && f.requests.high).toBeCloseTo(23 * 500 + 7 * 100);
		expect(f.spend).toMatchObject({ low: 60, high: 60 });
	});

	test("gives rates for today when the window is the last 7 days", () => {
		const f = periodKpiForecasts({ days: daysEnding("2026-10-15", 8), observedAt, period: { kind: "rolling", days: 7 } })!;
		expect(f.requests).toMatchObject({ low: 700, mid: 700, high: 700 });
		expect(f.success_rate).toEqual({ kind: "recent", days: 1, value: 0.98 });
	});

	test("leaves a rate empty when there were no requests to take it from", () => {
		const f = periodKpiForecasts({ days: daysEnding("2026-10-14", 7), observedAt, period: { kind: "rolling", days: 7 } })!;
		expect(f.success_rate).toEqual({ kind: "recent", days: 1, value: null });
	});

	test("projects free usage as no spend", () => {
		const f = periodKpiForecasts({ days: daysEnding("2026-10-14", 7, { costNanos: 0 }), observedAt, period: { kind: "rolling", days: 7 } })!;
		expect(f.spend).toMatchObject({ low: 0, mid: 0, high: 0 });
	});

	test("waits for enough of a running period, and needs usage to project", () => {
		const week: ForecastPeriod = { kind: "running", unit: "week", start: Date.parse("2026-10-12"), end: Date.parse("2026-10-19") };
		// 1.5 days into the week is under a quarter of it.
		expect(periodKpiForecasts({ days: daysEnding("2026-10-13", 9), observedAt: Date.parse("2026-10-13T12:00:00Z"), period: week })).toBeNull();
		expect(periodKpiForecasts({ days: daysEnding("2026-10-14", 9), observedAt: Date.parse("2026-10-14T12:00:00Z"), period: week })).not.toBeNull();
		expect(periodKpiForecasts({ days: [day("2026-08-20")], observedAt, period: { kind: "rolling", days: 30 } })).toBeNull();
	});
});
