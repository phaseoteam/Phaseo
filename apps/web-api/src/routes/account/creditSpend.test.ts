import { describe, expect, it } from "vitest";
import { summariseRecentCreditSpend } from "./creditSpend";

const NOW = Date.parse("2026-10-13T12:00:00Z");

describe("summariseRecentCreditSpend", () => {
	it("averages the last seven days of applied charges", () => {
		const rows = [
			{ cost_nanos: 40_000_000_000, created_at: "2026-10-13T10:00:00Z" },
			{ cost_nanos: "30000000000", created_at: "2026-10-10T10:00:00Z" },
		];
		expect(summariseRecentCreditSpend(rows, NOW)).toEqual({ dailyNanos: 10_000_000_000, windowDays: 7, observedAt: NOW });
	});

	it("reports no spend when nothing was charged", () => {
		expect(summariseRecentCreditSpend([], NOW)).toMatchObject({ dailyNanos: 0, windowDays: 7 });
	});

	it("measures busy workspaces over the span the capped rows cover", () => {
		const rows = [
			{ cost_nanos: 1_000_000_000, created_at: "2026-10-13T11:00:00Z" },
			{ cost_nanos: 1_000_000_000, created_at: "2026-10-12T12:00:00Z" },
		];
		// Two rows hit the limit of two, so the pace is $2 over the one day they cover.
		expect(summariseRecentCreditSpend(rows, NOW, 2)).toMatchObject({ dailyNanos: 2_000_000_000, windowDays: 1 });
	});

	it("ignores refunds, zero and malformed amounts", () => {
		const rows = [
			{ cost_nanos: -5_000_000_000, created_at: "2026-10-13T10:00:00Z" },
			{ cost_nanos: null, created_at: "2026-10-13T09:00:00Z" },
			{ cost_nanos: "not-a-number", created_at: "2026-10-13T08:00:00Z" },
			{ cost_nanos: 7_000_000_000, created_at: "2026-10-12T08:00:00Z" },
		];
		expect(summariseRecentCreditSpend(rows, NOW).dailyNanos).toBe(1_000_000_000);
	});
});
