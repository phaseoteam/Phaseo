import {
	calculateCacheHitRatePct,
	calculateObservedEffectivePriceSummary,
	calculateTokenSharePct,
	hasObservedTokenUsage,
} from "./effectivePricing";

describe("calculateObservedEffectivePriceSummary", () => {
	it("uses charged amounts and token quantities inside the requested window", () => {
		const summary = calculateObservedEffectivePriceSummary(new Map([
			["2026-07-01", { dayBucket: "2026-07-01", inputTokens: 1_000_000, outputTokens: 1_000_000, inputCostNanos: 5_000_000_000, outputCostNanos: 30_000_000_000 }],
			["2026-08-01", { dayBucket: "2026-08-01", inputTokens: 2_000_000, outputTokens: 2_000_000, inputCostNanos: 4_000_000_000, outputCostNanos: 40_000_000_000 }],
		]), Date.parse("2026-07-15T00:00:00.000Z"));

		expect(summary.weightedInputPricePer1M).toBe(2);
		expect(summary.weightedOutputPricePer1M).toBe(20);
		expect(summary.pricedInputTokens).toBe(2_000_000);
		expect(summary.pricedOutputTokens).toBe(2_000_000);
	});
});

describe("pricing table usage metrics", () => {
	it("calculates cache hit rate from cached reads over all billed input tokens", () => {
		expect(calculateCacheHitRatePct(250, 1_000)).toBe(25);
		expect(calculateCacheHitRatePct(0, 1_000)).toBe(0);
		expect(calculateCacheHitRatePct(10, 0)).toBeNull();
		expect(calculateCacheHitRatePct(1_100, 1_000)).toBe(100);
	});

	it("does not treat empty pricing buckets as observed usage", () => {
		expect(hasObservedTokenUsage(0, 0)).toBe(false);
		expect(hasObservedTokenUsage(1, 0)).toBe(true);
		expect(hasObservedTokenUsage(0, 1)).toBe(true);
	});

	it("calculates token share against the same model-wide provider-tier population", () => {
		expect(calculateTokenSharePct(2_500, 10_000)).toBe(25);
		expect(calculateTokenSharePct(0, 10_000)).toBe(0);
		expect(calculateTokenSharePct(10, 0)).toBeNull();
	});
});
