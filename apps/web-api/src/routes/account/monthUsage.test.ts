import { describe, expect, it } from "vitest";
import { dailyUsageTotals, monthUsageStartDate } from "./monthUsage";

describe("monthUsageStartDate", () => {
	it("starts at the first of the previous UTC month", () => {
		expect(monthUsageStartDate(Date.parse("2026-10-12T23:30:00Z"))).toBe("2026-09-01");
		expect(monthUsageStartDate(Date.parse("2026-01-03T00:00:00Z"))).toBe("2025-12-01");
	});
});

describe("dailyUsageTotals", () => {
	const observedAt = Date.parse("2026-10-12T12:00:00Z");

	it("sums model and app rows into one total per day, oldest first", () => {
		expect(dailyUsageTotals([
			{ usage_date: "2026-10-12", cost_nanos: "1500000000", requests: "3", successful_requests: 2, cached_input_tokens: "100" },
			{ usage_date: "2026-09-30", cost_nanos: 250, requests: 1, successful_requests: 1 },
			{ usage_date: "2026-10-12", cost_nanos: 500_000_000, requests: 1, successful_requests: 1, cached_input_tokens: 20 },
			{ usage_date: null, cost_nanos: 99, requests: 5 },
			{ usage_date: "2026-10-11", cost_nanos: "not-a-number", requests: 2, successful_requests: 0 },
		], observedAt)).toEqual({
			observedAt,
			days: [
				{ date: "2026-09-30", costNanos: 250, requests: 1, successfulRequests: 1, tokens: 0, cachedTokens: 0 },
				{ date: "2026-10-11", costNanos: 0, requests: 2, successfulRequests: 0, tokens: 0, cachedTokens: 0 },
				{ date: "2026-10-12", costNanos: 2_000_000_000, requests: 4, successfulRequests: 3, tokens: 0, cachedTokens: 120 },
			],
		});
	});

	it("counts the larger of the reported total and input plus output per rollup", () => {
		const meters = (entries: Array<[string, number | string]>) => entries.map(([meter_key, quantity]) => ({ meter_key, quantity }));
		const { days } = dailyUsageTotals([
			{ usage_date: "2026-10-12", cost_nanos: 0, v2_private_usage_daily_meters: meters([["total_tokens", 900], ["input_tokens", 600], ["output_tokens", "200"]]) },
			{ usage_date: "2026-10-12", cost_nanos: 0, v2_private_usage_daily_meters: meters([["total_tokens", 50], ["input_tokens", 70], ["output_tokens", 30]]) },
			{ usage_date: "2026-10-12", cost_nanos: 0, v2_private_usage_daily_meters: null },
		], observedAt);
		expect(days[0].tokens).toBe(900 + 100);
	});
});
