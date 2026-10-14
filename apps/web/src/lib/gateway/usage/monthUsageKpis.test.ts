import { monthKpiFigures, type MonthUsageDay } from "./monthUsageKpis";

const day = (date: string, overrides: Partial<MonthUsageDay> = {}): MonthUsageDay => ({
	date,
	costNanos: 2_000_000_000,
	requests: 100,
	successfulRequests: 98,
	tokens: 50_000,
	cachedTokens: 10_000,
	...overrides,
});

describe("monthKpiFigures", () => {
	// Noon on Oct 12: 11.5 days of a 31-day month have passed.
	const observedAt = Date.parse("2026-10-12T12:00:00Z");
	const october = Array.from({ length: 12 }, (_, i) => day(`2026-10-${String(i + 1).padStart(2, "0")}`));

	test("projects totals and gives the month so far for rates", () => {
		const figures = monthKpiFigures({ days: [day("2026-09-30", { requests: 999, successfulRequests: 0 }), ...october], observedAt });
		expect(figures).not.toBeNull();
		const f = figures!;
		// 1,200 requests so far (today's rollup included); the recent pace is 100/day, the month pace 1200/11.5.
		const monthPace = 1200 + (1200 / 11.5) * 19.5;
		expect(f.requests).toEqual({ kind: "projected", low: 1200 + 100 * 19.5, mid: monthPace, high: monthPace });
		// Spend is $2 a day, reported in dollars.
		expect(f.spend.kind).toBe("projected");
		if (f.spend.kind === "projected") {
			expect(f.spend.low).toBeCloseTo(24 + 2 * 19.5);
			expect(f.spend.mid).toBeCloseTo(monthPace / 50);
		}
		expect(f.tokens.kind).toBe("projected");
		// Rates cover October only, not September's failures.
		expect(f.success_rate).toEqual({ kind: "to_date", value: 0.98 });
		expect(f.cache).toEqual({ kind: "to_date", value: 0.2 });
		expect(f.blended_price).toEqual({ kind: "to_date", value: 40 });
	});

	test("shows the month so far before there is enough of it to project", () => {
		const figures = monthKpiFigures({ days: [day("2026-10-01"), day("2026-10-02")], observedAt: Date.parse("2026-10-02T12:00:00Z") });
		expect(figures?.spend).toEqual({ kind: "to_date", value: 4 });
		expect(figures?.requests).toEqual({ kind: "to_date", value: 200 });
	});

	test("is null without usage this month", () => {
		expect(monthKpiFigures({ days: [day("2026-09-20")], observedAt })).toBeNull();
	});
});
