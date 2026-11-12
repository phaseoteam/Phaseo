import { describe, expect, it } from "vitest";
import { parseUsageLabelFacets, parseUsageOverviewCells, usageOverviewBucket, usageOverviewTimeZone } from "./usageOverview";

describe("usageOverviewBucket", () => {
	it("keeps a valid requested bucket", () => {
		expect(usageOverviewBucket("2026-10-01T00:00:00Z", "2026-10-15T00:00:00Z", "hour")).toBe("hour");
	});

	it("picks the overview's bucket for the window's length otherwise", () => {
		expect(usageOverviewBucket("2026-10-15T10:00:00Z", "2026-10-15T11:00:00Z", null)).toBe("5 minutes");
		expect(usageOverviewBucket("2026-10-14T10:00:00Z", "2026-10-15T10:00:00Z", "minute")).toBe("hour");
		expect(usageOverviewBucket("2026-09-15T00:00:00Z", "2026-10-15T00:00:00Z", null)).toBe("day");
		expect(usageOverviewBucket("2024-10-15T00:00:00Z", "2026-10-15T00:00:00Z", null)).toBe("month");
	});

	it("ignores buckets too fine for the window, which would read every request", () => {
		expect(usageOverviewBucket("2026-10-15T06:00:00Z", "2026-10-15T12:00:00Z", "5 minutes")).toBe("5 minutes");
		expect(usageOverviewBucket("2026-07-15T00:00:00Z", "2026-10-15T00:00:00Z", "5 minutes")).toBe("day");
		expect(usageOverviewBucket("2025-10-15T00:00:00Z", "2026-10-15T00:00:00Z", "hour")).toBe("day");
		expect(usageOverviewBucket("2024-10-15T00:00:00Z", "2026-10-15T00:00:00Z", "day")).toBe("day");
	});
});

describe("usageOverviewTimeZone", () => {
	it("accepts IANA zones and falls back to UTC", () => {
		expect(usageOverviewTimeZone("Asia/Kolkata")).toBe("Asia/Kolkata");
		expect(usageOverviewTimeZone("Not/AZone")).toBe("UTC");
		expect(usageOverviewTimeZone("UTC'; drop table x")).toBe("UTC");
		expect(usageOverviewTimeZone(null)).toBe("UTC");
	});
});

describe("parseUsageOverviewCells", () => {
	it("normalises cells and drops malformed ones", () => {
		expect(parseUsageOverviewCells([
			{ bucket: "2026-10-15T09:00:00+00:00", modelId: "model-a", provider: "provider-a", keyId: null, appId: "app", byok: true, requests: 3, successfulRequests: 2, guardrailBlocked: 1, costNanos: 1500, tokens: 300, inputTokens: 200, outputTokens: 100, reasoningTokens: 10, cachedTokens: "40" },
			{ bucket: null, requests: -1 },
			{ bucket: "not a date", requests: 1 },
			"nonsense",
		])).toEqual([
			{ bucket: "2026-10-15T09:00:00.000Z", modelId: "model-a", provider: "provider-a", keyId: null, appId: "app", byok: true, requests: 3, successfulRequests: 2, guardrailBlocked: 1, costNanos: 1500, tokens: 300, inputTokens: 200, outputTokens: 100, reasoningTokens: 10, cachedTokens: 40 },
			{ bucket: null, modelId: null, provider: null, keyId: null, appId: null, byok: false, requests: 0, successfulRequests: 0, guardrailBlocked: 0, costNanos: 0, tokens: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cachedTokens: 0 },
		]);
		expect(parseUsageOverviewCells(null)).toEqual([]);
	});
});

describe("parseUsageLabelFacets", () => {
	it("keeps well-formed labels in key then value order", () => {
		expect(parseUsageLabelFacets([
			{ key: "team", value: "search", requests: 9 },
			{ key: "env", value: "prod", requests: 4 },
			{ key: "team", value: "billing", requests: 2 },
			{ key: 1, value: "bad" },
			null,
		])).toEqual([
			{ key: "env", value: "prod" },
			{ key: "team", value: "billing" },
			{ key: "team", value: "search" },
		]);
		expect(parseUsageLabelFacets("nope")).toEqual([]);
	});
});
