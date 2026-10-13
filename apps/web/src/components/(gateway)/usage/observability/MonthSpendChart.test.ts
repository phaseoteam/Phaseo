import { buildMonthSpendPoints, formatSpendRange, niceSpendTicks } from "./MonthSpendChart";
import type { MonthSpendForecast } from "@/lib/gateway/usage/monthSpendForecast";

const usd = (value: number) => value * 1_000_000_000;

const forecast: MonthSpendForecast = {
	monthStart: Date.parse("2026-10-01T00:00:00Z"),
	daysInMonth: 31,
	elapsedDays: 2.5,
	spentNanos: usd(30),
	cumulative: [{ x: 0, nanos: 0 }, { x: 1, nanos: usd(10) }, { x: 2, nanos: usd(25) }, { x: 2.5, nanos: usd(30) }],
	lowNanos: usd(300),
	midNanos: usd(342),
	highNanos: usd(400),
	previousMonthNanos: usd(280),
};

describe("buildMonthSpendPoints", () => {
	test("draws spend so far, then a projection from now to the month end", () => {
		expect(buildMonthSpendPoints(forecast)).toEqual([
			{ x: 0, spent: 0 },
			{ x: 1, spent: 10 },
			{ x: 2, spent: 25 },
			{ x: 2.5, spent: 30, projected: 30, band: [30, 30] },
			{ x: 31, projected: 342, band: [300, 400] },
		]);
	});
});

describe("formatSpendRange", () => {
	const format = (value: number) => `$${value.toFixed(0)}`;
	test("shows a range, or one value when both ends round the same", () => {
		expect(formatSpendRange(usd(300), usd(400), format)).toBe("$300–$400");
		expect(formatSpendRange(usd(300.2), usd(300.4), format)).toBe("$300");
	});

	test("rounds the axis up to even steps", () => {
		expect(niceSpendTicks(3592)).toEqual([0, 1000, 2000, 3000, 4000]);
		expect(niceSpendTicks(870)).toEqual([0, 250, 500, 750, 1000]);
		expect(niceSpendTicks(0)).toEqual([0, 1]);
	});
});
