import { describe, expect, it } from "vitest";
import { keyUsageSeries } from "./keyUsageSeries";

describe("daily key chart data", () => {
	it("combines providers and models, fills missing UTC days, and preserves refunds", () => {
		const result = keyUsageSeries([
			{ bucket: "2026-09-30T00:00:00Z", requests: "2", cost: "0.005" },
			{ bucket: "2026-09-30T00:00:00Z", requests: 3, cost: 0.01 },
			{ bucket: "2026-10-02T00:00:00Z", requests: 1, cost: -0.002 },
		], "2026-09-30T00:00:00Z", "2026-10-02T12:00:00Z");
		expect(result).toEqual([{ date: "2026-09-30", requests: 5, spendUsd: 0.015 }, { date: "2026-10-01", requests: 0, spendUsd: 0 }, { date: "2026-10-02", requests: 1, spendUsd: -0.002 }]);
	});
	it("returns zero observations only after a successful empty query", () => {
		expect(keyUsageSeries([], "2026-10-01T00:00:00Z", "2026-10-01T12:00:00Z")).toEqual([{ date: "2026-10-01", requests: 0, spendUsd: 0 }]);
	});
	it("rejects malformed totals instead of displaying false zeros", () => {
		expect(() => keyUsageSeries([{ bucket: "2026-10-01T00:00:00Z", requests: "invalid" }], "2026-10-01", "2026-10-01")).toThrow("invalid_usage_rollup");
	});
});
