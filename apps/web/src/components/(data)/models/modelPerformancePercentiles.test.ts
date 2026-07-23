import { buildSingleProviderPercentileSeries } from "@/components/(data)/models/modelPerformancePercentiles";

describe("buildSingleProviderPercentileSeries", () => {
	it("turns one provider into percentile chart series", () => {
		const result = buildSingleProviderPercentileSeries(1, [
			{
				day: "2026-07-23",
				provider: "poolside",
				providerName: "Poolside",
				providerColor: null,
				percentile: 50,
				avgThroughput: 8.5,
				avgLatencyMs: 230,
				avgGenerationMs: 520,
				requests: 100,
			},
			{
				day: "2026-07-23",
				provider: "poolside",
				providerName: "Poolside",
				providerColor: null,
				percentile: 95,
				avgThroughput: 13.4,
				avgLatencyMs: 1393,
				avgGenerationMs: 1700,
				requests: 100,
			},
		]);

		expect(result).toEqual([
			expect.objectContaining({ provider: "percentile-50", providerName: "P50" }),
			expect.objectContaining({ provider: "percentile-95", providerName: "P95" }),
		]);
	});

	it("does not replace provider comparison for multiple providers", () => {
		expect(buildSingleProviderPercentileSeries(2, [])).toBeNull();
	});

	it("rejects empty or unsupported single-provider points", () => {
		expect(buildSingleProviderPercentileSeries(1, [])).toBeNull();
		expect(buildSingleProviderPercentileSeries(1, [
			{
				day: "2026-07-23",
				provider: "poolside",
				providerName: "Poolside",
				providerColor: null,
				percentile: 42,
				avgThroughput: 8.5,
				avgLatencyMs: 230,
				avgGenerationMs: 520,
				requests: 100,
			},
			{
				day: "2026-07-23",
				provider: "poolside",
				providerName: "Poolside",
				providerColor: null,
				percentile: 50,
				avgThroughput: 8.5,
				avgLatencyMs: 230,
				avgGenerationMs: 520,
				requests: 0,
			},
			{
				day: "2026-07-23",
				provider: "poolside",
				providerName: "Poolside",
				providerColor: null,
				percentile: 95,
				avgThroughput: null,
				avgLatencyMs: null,
				avgGenerationMs: null,
				requests: 100,
			},
		])).toBeNull();
	});
});
