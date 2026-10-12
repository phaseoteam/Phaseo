import { describe, expect, it } from "vitest";
import { dailySpendTotals, monthSpendStartDate } from "./monthSpend";

describe("monthSpendStartDate", () => {
	it("starts at the first of the previous UTC month", () => {
		expect(monthSpendStartDate(Date.parse("2026-10-12T23:30:00Z"))).toBe("2026-09-01");
		expect(monthSpendStartDate(Date.parse("2026-01-03T00:00:00Z"))).toBe("2025-12-01");
	});
});

describe("dailySpendTotals", () => {
	it("sums model and app rows into one total per day, oldest first", () => {
		const observedAt = Date.parse("2026-10-12T12:00:00Z");
		expect(dailySpendTotals([
			{ usage_date: "2026-10-12", cost_nanos: "1500000000" },
			{ usage_date: "2026-09-30", cost_nanos: 250 },
			{ usage_date: "2026-10-12", cost_nanos: 500_000_000 },
			{ usage_date: null, cost_nanos: 99 },
			{ usage_date: "2026-10-11", cost_nanos: "not-a-number" },
		], observedAt)).toEqual({
			observedAt,
			days: [
				{ date: "2026-09-30", costNanos: 250 },
				{ date: "2026-10-12", costNanos: 2_000_000_000 },
			],
		});
	});
});
