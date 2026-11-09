import { describe, test, expect } from "vitest";
import { forecastPeriod, kpiFooters, periodKpiForecasts, type ForecastPeriod, type KpiCard, type KpiId } from "./periodUsageKpis";

const DAY_MS = 86_400_000;
const local = (...parts: [number, number, number, number?]) => new Date(...parts).getTime();

function cards(overrides: Partial<Record<KpiId, KpiCard>> = {}): Record<KpiId, KpiCard> {
	return {
		spend: { value: 30, previous: 28 },
		requests: { value: 1500, previous: 1400 },
		tokens: { value: 750_000, previous: 700_000 },
		cache: { value: 0.2, previous: 0.18 },
		success_rate: { value: 0.98, previous: 0.97 },
		blended_price: { value: 40, previous: 40 },
		...overrides,
	};
}

describe("forecastPeriod", () => {
	const range = (from: number, to: number) => ({ from: new Date(from).toISOString(), to: new Date(to).toISOString() });

	test("projects a period so far to its local end", () => {
		const now = local(2026, 9, 15, 9);
		expect(forecastPeriod({ preset: "today", ...range(local(2026, 9, 15), now) })).toEqual({ kind: "running", unit: "day", start: local(2026, 9, 15), end: local(2026, 9, 16) });
		expect(forecastPeriod({ preset: "this_week", ...range(local(2026, 9, 12), now) })).toEqual({ kind: "running", unit: "week", start: local(2026, 9, 12), end: local(2026, 9, 19) });
		expect(forecastPeriod({ preset: "this_month", ...range(local(2026, 9, 1), now) })).toEqual({ kind: "running", unit: "month", start: local(2026, 9, 1), end: local(2026, 10, 1) });
		expect(forecastPeriod({ preset: "this_quarter", ...range(local(2026, 9, 1), now) })).toEqual({ kind: "running", unit: "quarter", start: local(2026, 9, 1), end: local(2027, 0, 1) });
		expect(forecastPeriod({ preset: "this_year", ...range(local(2026, 0, 1), now) })).toEqual({ kind: "running", unit: "year", start: local(2026, 0, 1), end: local(2027, 0, 1) });
	});

	test("projects a rolling window ending now over the same length ahead", () => {
		const now = Date.parse("2026-10-15T12:00:00Z");
		const days = (count: number) => range(now - count * DAY_MS, now);
		expect(forecastPeriod({ preset: "past_24h", ...days(1) })).toEqual({ kind: "rolling", days: 1 });
		expect(forecastPeriod({ preset: "rel:3d", ...days(3) })).toEqual({ kind: "rolling", days: 3 });
		expect(forecastPeriod({ preset: "last_30d", ...days(30) })).toEqual({ kind: "rolling", days: 30 });
		expect(forecastPeriod({ preset: "rel:2w", ...days(14) })).toEqual({ kind: "rolling", days: 14 });
	});

	test("has nothing to forecast for finished, custom and sub-day ranges", () => {
		const now = Date.parse("2026-10-15T12:00:00Z");
		for (const preset of ["last_month", "yesterday", "last_week", "custom", "past_3h", "live", "rel:36h"] as const) {
			expect(forecastPeriod({ preset, ...range(now - 2 * DAY_MS, now) })).toBeNull();
		}
		expect(forecastPeriod({ preset: "rel:2y", ...range(now - 730 * DAY_MS, now) })).toBeNull();
	});
});

describe("periodKpiForecasts", () => {
	test("projects a month so far between its own pace and the last week's", () => {
		const period: ForecastPeriod = { kind: "running", unit: "month", start: local(2026, 9, 1), end: local(2026, 10, 1) };
		const observedAt = period.start + 14.5 * DAY_MS;
		const remaining = (period.end - observedAt) / DAY_MS;
		// 100 requests a day so far; 200 a day over the last week.
		const f = periodKpiForecasts({ observedAt, period, cards: cards({ requests: { value: 1450, previous: 0 } }), recent: { spend: 28, requests: 1400, tokens: 700_000 } })!;
		expect(f.requests).toEqual({ kind: "projected", period, low: 1450 + 100 * remaining, mid: 1450 + 100 * remaining, high: 1450 + 200 * remaining });
		expect(f.spend.kind === "projected" && f.spend.high).toBeCloseTo(30 + 4 * remaining);
	});

	test("projects from the last week alone early in a period", () => {
		const period: ForecastPeriod = { kind: "running", unit: "week", start: local(2026, 9, 12), end: local(2026, 9, 19) };
		// 1.5 days into the week is under a quarter of it: 150 so far, plus 100 a day for the 5.5 days left.
		const f = periodKpiForecasts({ observedAt: period.start + 1.5 * DAY_MS, period, cards: cards({ requests: { value: 150, previous: 0 } }), recent: { spend: 0, requests: 700, tokens: 0 } })!;
		expect(f.requests).toMatchObject({ low: 700, mid: 700, high: 700 });
	});

	test("projects the next days from the window and the last week", () => {
		const recent = { spend: 14, requests: 1400, tokens: 70_000 };
		const month = periodKpiForecasts({ observedAt: 0, period: { kind: "rolling", days: 30 }, cards: cards({ requests: { value: 3000, previous: 0 } }), recent })!;
		expect(month.requests).toMatchObject({ low: 3000, mid: 3000, high: 6000 });
		const day = periodKpiForecasts({ observedAt: 0, period: { kind: "rolling", days: 1 }, cards: cards({ requests: { value: 40, previous: 0 } }), recent })!;
		expect(day.requests).toMatchObject({ low: 40, mid: 40, high: 200 });
	});

	test("projects free usage as no spend, and needs usage to project", () => {
		const period: ForecastPeriod = { kind: "rolling", days: 7 };
		const free = periodKpiForecasts({ observedAt: 0, period, cards: cards({ spend: { value: 0, previous: 0 } }), recent: { spend: 0, requests: 700, tokens: 0 } })!;
		expect(free.spend).toMatchObject({ low: 0, mid: 0, high: 0 });
		const idle = { spend: { value: 0, previous: 0 }, requests: { value: 0, previous: 0 }, tokens: { value: 0, previous: 0 } };
		expect(periodKpiForecasts({ observedAt: 0, period, cards: cards(idle), recent: { spend: 0, requests: 0, tokens: 0 } })).toBeNull();
	});
});

describe("kpiFooters", () => {
	test("shows each total's change and each rate's previous value when there is nothing to forecast", () => {
		expect(kpiFooters({ observedAt: 0, period: null, cards: cards(), recent: { spend: 1, requests: 1, tokens: 1 } })).toEqual({
			spend: { kind: "change", value: 2 },
			requests: { kind: "change", value: 100 },
			tokens: { kind: "change", value: 50_000 },
			cache: { kind: "previous", value: 0.18 },
			success_rate: { kind: "previous", value: 0.97 },
			blended_price: { kind: "previous", value: 40 },
		});
	});

	test("forecasts totals and shows previous rates over a period still running", () => {
		const footers = kpiFooters({ observedAt: 0, period: { kind: "rolling", days: 30 }, cards: cards(), recent: { spend: 7, requests: 700, tokens: 7000 } });
		expect(footers.requests.kind).toBe("projected");
		expect(footers.success_rate).toEqual({ kind: "previous", value: 0.97 });
	});

	test("has no previous rates without previous requests", () => {
		expect(kpiFooters({ observedAt: 0, period: null, cards: cards({ requests: { value: 500, previous: 0 } }), recent: null }).success_rate).toEqual({ kind: "previous", value: null });
	});

	test("shows changes when there is no usage to forecast from", () => {
		const idle = { spend: { value: 0, previous: 2 }, requests: { value: 0, previous: 3 }, tokens: { value: 0, previous: 4 } };
		expect(kpiFooters({ observedAt: 0, period: { kind: "rolling", days: 1 }, cards: cards(idle), recent: { spend: 0, requests: 0, tokens: 0 } }).requests).toEqual({ kind: "change", value: -3 });
	});
});
