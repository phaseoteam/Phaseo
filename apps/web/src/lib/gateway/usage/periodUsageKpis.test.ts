import { forecastPeriod, kpiFooters, periodKpiForecasts, type ForecastPeriod, type KpiCard, type KpiId, type UsageDay } from "./periodUsageKpis";

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


/** Card figures; rates default to a healthy previous period. */
const cards = (overrides: Partial<Record<KpiId, KpiCard>> = {}): Record<KpiId, KpiCard> => ({
	spend: { value: 10, previous: 8 },
	requests: { value: 500, previous: 400 },
	tokens: { value: 250_000, previous: 200_000 },
	cache: { value: 0.2, previous: 0.18 },
	success_rate: { value: 0.98, previous: 0.97 },
	blended_price: { value: 40, previous: 40 },
	...overrides,
});

describe("forecastPeriod", () => {
	const range = (fromDaysAgo: number) => ({ from: new Date(observedAt - fromDaysAgo * DAY_MS).toISOString(), to: new Date(observedAt).toISOString(), observedAt });

	test("runs today to the end of the local day, and this week, month, quarter and year to their UTC ends", () => {
		// Local midnight for a browser at UTC+2.
		expect(forecastPeriod({ preset: "today", from: "2026-10-14T22:00:00.000Z", to: new Date(observedAt).toISOString(), observedAt })).toEqual({ kind: "running", unit: "day", start: Date.parse("2026-10-14T22:00:00Z"), end: Date.parse("2026-10-15T22:00:00Z") });
		expect(forecastPeriod({ preset: "this_week", ...range(3) })).toEqual({ kind: "running", unit: "week", start: Date.parse("2026-10-12"), end: Date.parse("2026-10-19") });
		expect(forecastPeriod({ preset: "this_month", ...range(14) })).toEqual({ kind: "running", unit: "month", start: Date.parse("2026-10-01"), end: Date.parse("2026-11-01") });
		expect(forecastPeriod({ preset: "this_quarter", ...range(14) })).toEqual({ kind: "running", unit: "quarter", start: Date.parse("2026-10-01"), end: Date.parse("2027-01-01") });
		expect(forecastPeriod({ preset: "this_year", ...range(288) })).toEqual({ kind: "running", unit: "year", start: Date.parse("2026-01-01"), end: Date.parse("2027-01-01") });
	});

	test("projects a rolling window ending now over the same length ahead", () => {
		expect(forecastPeriod({ preset: "past_24h", ...range(1) })).toEqual({ kind: "rolling", days: 1 });
		expect(forecastPeriod({ preset: "rel:3d", ...range(3) })).toEqual({ kind: "rolling", days: 3 });
		expect(forecastPeriod({ preset: "last_30d", ...range(30) })).toEqual({ kind: "rolling", days: 30 });
		expect(forecastPeriod({ preset: "rel:2w", ...range(14) })).toEqual({ kind: "rolling", days: 14 });
	});

	test("has nothing to forecast for finished, custom or sub-day ranges", () => {
		for (const preset of ["last_month", "yesterday", "last_week", "custom", "past_3h", "live"] as const) {
			expect(forecastPeriod({ preset, ...range(2) })).toBeNull();
		}
		expect(forecastPeriod({ preset: "rel:36h", ...range(1.5) })).toBeNull();
		expect(forecastPeriod({ preset: "rel:2y", ...range(730) })).toBeNull();
	});
});

describe("periodKpiForecasts", () => {
	test("projects totals to the end of a running month", () => {
		const period: ForecastPeriod = { kind: "running", unit: "month", start: Date.parse("2026-10-01"), end: Date.parse("2026-11-01") };
		// September sits outside both the month and the last 7 days.
		const days = [day("2026-09-30", { requests: 999 }), ...daysEnding("2026-10-15", 15)];
		const forecasts = periodKpiForecasts({ days, observedAt, period });
		expect(forecasts).not.toBeNull();
		const f = forecasts!;
		// 1,500 requests so far over 14.5 days (today's rollup included); the last week ran at 100/day.
		const remaining = 16.5;
		const periodPace = 1500 + (1500 / 14.5) * remaining;
		expect(f.requests).toEqual({ kind: "projected", period, low: 1500 + 100 * remaining, mid: periodPace, high: periodPace });
		expect(f.spend.kind === "projected" && f.spend.low).toBeCloseTo(30 + 2 * remaining);
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

	test("projects today from the card's figure so far and the last week's pace", () => {
		// Local midnight was 12 hours ago; the card shows 80 requests and $1.50 since then.
		const period: ForecastPeriod = { kind: "running", unit: "day", start: observedAt - DAY_MS / 2, end: observedAt + DAY_MS / 2 };
		const f = periodKpiForecasts({ days: daysEnding("2026-10-14", 7), observedAt, period, cards: cards({ requests: { value: 80, previous: 0 }, spend: { value: 1.5, previous: 0 } }) })!;
		// Today's pace is 160/day and the last week's 100/day, over the half day left.
		expect(f.requests).toEqual({ kind: "projected", period, low: 130, mid: 160, high: 160 });
		expect(f.spend).toMatchObject({ low: 2.5, mid: 3, high: 3 });
	});

	test("projects the next 24 hours from the card's last 24 and the last week", () => {
		const period: ForecastPeriod = { kind: "rolling", days: 1 };
		const f = periodKpiForecasts({ days: daysEnding("2026-10-15", 8), observedAt, period, cards: cards({ requests: { value: 40, previous: 0 } }) })!;
		expect(f.requests).toEqual({ kind: "projected", period, low: 40, mid: 40, high: 100 });
	});

	test("needs the card's figures for today and windows under a week", () => {
		expect(periodKpiForecasts({ days: daysEnding("2026-10-14", 7), observedAt, period: { kind: "rolling", days: 1 } })).toBeNull();
	});

	test("projects the next 7 days from the complete days before today", () => {
		const f = periodKpiForecasts({ days: daysEnding("2026-10-15", 8), observedAt, period: { kind: "rolling", days: 7 } })!;
		expect(f.requests).toMatchObject({ low: 700, mid: 700, high: 700 });
	});

	test("projects free usage as no spend", () => {
		const f = periodKpiForecasts({ days: daysEnding("2026-10-14", 7, { costNanos: 0 }), observedAt, period: { kind: "rolling", days: 7 } })!;
		expect(f.spend).toMatchObject({ low: 0, mid: 0, high: 0 });
	});

	test("projects from the last week alone early in a period, and needs usage to project", () => {
		const week: ForecastPeriod = { kind: "running", unit: "week", start: Date.parse("2026-10-12"), end: Date.parse("2026-10-19") };
		// 1.5 days into the week is under a quarter of it: 150 so far, plus 100/day for the 5.5 days left.
		const early = periodKpiForecasts({ days: daysEnding("2026-10-13", 9), observedAt: Date.parse("2026-10-13T12:00:00Z"), period: week });
		expect(early?.requests).toMatchObject({ low: 200 + 550, mid: 200 + 550, high: 200 + 550 });
		expect(periodKpiForecasts({ days: [day("2026-08-20")], observedAt, period: { kind: "rolling", days: 30 } })).toBeNull();
	});
});

describe("kpiFooters", () => {
	const lastMonth = { days: daysEnding("2026-10-15", 30), observedAt, period: null };

	test("shows each total's change and each rate's previous value when there is nothing to forecast", () => {
		const footers = kpiFooters({ ...lastMonth, cards: cards(), currentComplete: true, previousComplete: true });
		expect(footers).toEqual({
			spend: { kind: "change", value: 2 },
			requests: { kind: "change", value: 100 },
			tokens: { kind: "change", value: 50_000 },
			cache: { kind: "previous", value: 0.18 },
			success_rate: { kind: "previous", value: 0.97 },
			blended_price: { kind: "previous", value: 40 },
		});
	});

	test("has no previous rates without previous requests", () => {
		const footers = kpiFooters({ ...lastMonth, cards: cards({ requests: { value: 500, previous: 0 } }), currentComplete: true, previousComplete: true });
		expect(footers?.success_rate).toEqual({ kind: "previous", value: null });
	});

	test("shows changes in filtered views, where the workspace rollup doesn't apply", () => {
		const footers = kpiFooters({ days: null, observedAt, period: { kind: "rolling", days: 30 }, cards: cards(), currentComplete: true, previousComplete: true });
		expect(footers?.requests).toEqual({ kind: "change", value: 100 });
	});

	test("forecasts totals and shows previous rates over a period still running", () => {
		const footers = kpiFooters({ days: daysEnding("2026-10-15", 31), observedAt, period: { kind: "rolling", days: 30 }, cards: cards(), currentComplete: true, previousComplete: true });
		expect(footers?.requests.kind).toBe("projected");
		expect(footers?.success_rate).toEqual({ kind: "previous", value: 0.97 });
	});

	test("forecasts from the rollup even when the cards are sampled, without sampled rates", () => {
		const footers = kpiFooters({ days: daysEnding("2026-10-15", 31), observedAt, period: { kind: "rolling", days: 30 }, cards: cards(), currentComplete: false, previousComplete: false });
		expect(footers?.requests.kind).toBe("projected");
		expect(footers?.cache).toEqual({ kind: "previous", value: null });
	});

	test("shows nothing when the figures it needs come from a sample", () => {
		expect(kpiFooters({ ...lastMonth, cards: cards(), currentComplete: true, previousComplete: false })).toBeNull();
		expect(kpiFooters({ days: daysEnding("2026-10-15", 8), observedAt, period: { kind: "rolling", days: 1 }, cards: cards(), currentComplete: false, previousComplete: true })).toBeNull();
	});
});
