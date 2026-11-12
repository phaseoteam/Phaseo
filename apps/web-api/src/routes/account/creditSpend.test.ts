import { describe, expect, it } from "vitest";
import { creditSpendWindowStart, recentCreditSpend } from "./creditSpend";

const NOW = Date.parse("2026-10-13T12:00:00Z");

describe("creditSpendWindowStart", () => {
	it("starts seven days before the observation", () => {
		expect(creditSpendWindowStart(NOW)).toBe("2026-10-06T12:00:00.000Z");
	});
});

describe("recentCreditSpend", () => {
	it("averages the window's total per day", () => {
		expect(recentCreditSpend(70_000_000_000, NOW)).toEqual({ dailyNanos: 10_000_000_000, windowDays: 7, observedAt: NOW });
		expect(recentCreditSpend("7000000000", NOW).dailyNanos).toBe(1_000_000_000);
	});

	it("reports no spend for empty, negative or malformed totals", () => {
		for (const total of [0, null, undefined, -5, "not-a-number"]) {
			expect(recentCreditSpend(total, NOW)).toMatchObject({ dailyNanos: 0, windowDays: 7 });
		}
	});
});
