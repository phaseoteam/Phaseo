import { describe, expect, it } from "vitest";
import { parseMonthUsageDays, usageDaysStartDate } from "./monthUsage";

describe("usageDaysStartDate", () => {
	it("starts at the first of the previous UTC month for recent periods", () => {
		expect(usageDaysStartDate(Date.parse("2026-10-12T23:30:00Z"), Date.parse("2026-10-05T23:30:00Z"))).toBe("2026-09-01");
		expect(usageDaysStartDate(Date.parse("2026-01-03T00:00:00Z"), Date.parse("2026-01-01T00:00:00Z"))).toBe("2025-12-01");
	});

	it("reaches a week before a longer period starts", () => {
		expect(usageDaysStartDate(Date.parse("2026-10-12T12:00:00Z"), Date.parse("2026-07-14T12:00:00Z"))).toBe("2026-07-06");
		// A local "this year" can start the evening before in UTC.
		expect(usageDaysStartDate(Date.parse("2026-10-12T12:00:00Z"), Date.parse("2025-12-31T14:00:00Z"))).toBe("2025-12-23");
	});

	it("never reads more than 400 days back", () => {
		expect(usageDaysStartDate(Date.parse("2026-10-12T12:00:00Z"), Date.parse("2020-01-01T00:00:00Z"))).toBe("2025-09-07");
	});

	it("ignores an unreadable period start", () => {
		expect(usageDaysStartDate(Date.parse("2026-10-12T12:00:00Z"), Number.NaN)).toBe("2026-09-01");
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
