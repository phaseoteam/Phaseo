import { describe, expect, it } from "vitest";
import { monthUsageStartDate, parseMonthUsageDays } from "./monthUsage";

describe("monthUsageStartDate", () => {
	it("starts at the first of the previous UTC month", () => {
		expect(monthUsageStartDate(Date.parse("2026-10-12T23:30:00Z"))).toBe("2026-09-01");
		expect(monthUsageStartDate(Date.parse("2026-01-03T00:00:00Z"))).toBe("2025-12-01");
	});
});

describe("parseMonthUsageDays", () => {
	const observedAt = Date.parse("2026-10-12T12:00:00Z");

	it("keeps well-formed days, oldest first, and zeroes missing or invalid counts", () => {
		expect(parseMonthUsageDays([
			{ date: "2026-10-12", costNanos: 2_000_000_000, requests: 4, successfulRequests: 3, tokens: 1000, cachedTokens: 15 },
			{ date: "2026-09-30", costNanos: "250", requests: 1, successfulRequests: 1, tokens: 40 },
			{ date: null, costNanos: 99, requests: 5 },
			{ date: "2026-10-11", costNanos: "not-a-number", requests: -2 },
			"junk",
		], observedAt)).toEqual({
			observedAt,
			days: [
				{ date: "2026-09-30", costNanos: 250, requests: 1, successfulRequests: 1, tokens: 40, cachedTokens: 0 },
				{ date: "2026-10-11", costNanos: 0, requests: 0, successfulRequests: 0, tokens: 0, cachedTokens: 0 },
				{ date: "2026-10-12", costNanos: 2_000_000_000, requests: 4, successfulRequests: 3, tokens: 1000, cachedTokens: 15 },
			],
		});
	});

	it("treats a non-array result as no days", () => {
		expect(parseMonthUsageDays(null, observedAt)).toEqual({ observedAt, days: [] });
	});
});
