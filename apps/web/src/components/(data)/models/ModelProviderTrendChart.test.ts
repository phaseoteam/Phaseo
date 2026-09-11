import {
	calculateCachedInputAverage,
	formatPerformanceTimeHeading,
	formatPerformanceTimeTick,
	getPerformanceAxisTickIndexes,
	getPerformanceXAxisDomain,
	getHoverDateTextAnchor,
	getSeriesEmphasis,
	isUsableMetricValue,
} from "./ModelProviderTrendChart";

describe("getPerformanceXAxisDomain", () => {
	it("adds half a bucket of padding around sparse and populated charts", () => {
		expect(getPerformanceXAxisDomain(1)).toEqual([-0.5, 0.5]);
		expect(getPerformanceXAxisDomain(2)).toEqual([-0.5, 1.5]);
		expect(getPerformanceXAxisDomain(7)).toEqual([-0.5, 6.5]);
	});
});

describe("hourly performance labels", () => {
	it("formats seven-day buckets with an explicit UTC hour", () => {
		expect(
			formatPerformanceTimeHeading("2026-08-30T14:00:00Z", "hour"),
		).toContain("14:00");
		expect(
			formatPerformanceTimeTick("2026-08-30T14:00:00Z", "hour"),
		).toBe("30 Aug · 14:00");
	});

	it("limits a full seven-day hourly series to readable axis ticks", () => {
		expect(getPerformanceAxisTickIndexes(168, "hour")).toEqual([
			0,
			24,
			48,
			72,
			96,
			120,
			144,
			167,
		]);
	});
});

describe("calculateCachedInputAverage", () => {
	it("weights provider days by effective input token volume", () => {
		const points = [
			{ cachedInputTokens: 10, effectiveInputTokens: 100, cachedInputPct: 10 },
			{ cachedInputTokens: 9_000, effectiveInputTokens: 10_000, cachedInputPct: 90 },
		] as Parameters<typeof calculateCachedInputAverage>[0];

		expect(calculateCachedInputAverage(points)).toBeCloseTo(89.2079, 4);
	});

	it("averages percentile percentages when raw token totals are unavailable", () => {
		const points = [
			{ cachedInputPct: 41.7 },
			{ cachedInputPct: 42.1 },
		] as Parameters<typeof calculateCachedInputAverage>[0];

		expect(calculateCachedInputAverage(points)).toBeCloseTo(41.9, 4);
	});
});

describe("getSeriesEmphasis", () => {
	it("emphasizes the hovered series and dims every other series", () => {
		expect(getSeriesEmphasis("p90", "p90")).toEqual({
			isActive: true,
			isDimmed: false,
		});
		expect(getSeriesEmphasis("p90", "p50")).toEqual({
			isActive: false,
			isDimmed: true,
		});
	});

	it("keeps all series at their normal emphasis without a hover target", () => {
		expect(getSeriesEmphasis(null, "provider-openai")).toEqual({
			isActive: false,
			isDimmed: false,
		});
	});
});

describe("getHoverDateTextAnchor", () => {
	it("centres a lone point and interior dates", () => {
		expect(getHoverDateTextAnchor(0, 1)).toBe("middle");
		expect(getHoverDateTextAnchor(1, 3)).toBe("middle");
	});

	it("keeps edge dates inside a multi-point chart", () => {
		expect(getHoverDateTextAnchor(0, 3)).toBe("start");
		expect(getHoverDateTextAnchor(2, 3)).toBe("end");
	});
});

describe("isUsableMetricValue", () => {
	it("hides impossible zero-valued timing and speed samples", () => {
		expect(isUsableMetricValue("outputSpeed", 0)).toBe(false);
		expect(isUsableMetricValue("latency", 0)).toBe(false);
		expect(isUsableMetricValue("endToEnd", 0)).toBe(false);
		expect(isUsableMetricValue("tpot", 0)).toBe(false);
		expect(isUsableMetricValue("throughput", 46.2)).toBe(true);
	});

	it("allows zero gateway overhead because it is a valid measurement", () => {
		expect(isUsableMetricValue("overhead", 0)).toBe(true);
	});

	it("allows zero cached input because no cache use is meaningful", () => {
		expect(isUsableMetricValue("cachedInput", 0)).toBe(true);
	});
});
