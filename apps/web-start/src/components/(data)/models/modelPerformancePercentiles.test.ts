import { buildSingleProviderPercentileSeries } from "@/components/(data)/models/modelPerformancePercentiles";
import { MODEL_PERCENTILES } from "@/components/(data)/models/ModelPercentileSelect";

describe("buildSingleProviderPercentileSeries", () => {
	it("turns one provider into percentile chart series", () => {
		const result = buildSingleProviderPercentileSeries(1, [
			{
				day: "2026-07-23",
				provider: "poolside",
				providerName: "Poolside",
				providerColor: null,
				percentile: 1,
				avgThroughput: 4.2,
				avgLatencyMs: 100,
				avgGenerationMs: 400,
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
			expect.objectContaining({
				provider: "percentile-1",
				providerName: "P01",
			}),
			expect.objectContaining({
				provider: "percentile-50",
				providerName: "P50",
			}),
			expect.objectContaining({
				provider: "percentile-95",
				providerName: "P95",
			}),
		]);
		expect(new Set(result?.map((point) => point.providerColor)).size).toBe(3);
	});

	it("does not replace provider comparison for multiple providers", () => {
		expect(buildSingleProviderPercentileSeries(2, [])).toBeNull();
	});

	it("keeps cache-only percentile observations", () => {
		const result = buildSingleProviderPercentileSeries(1, [
			{
				day: "2026-07-23",
				provider: "poolside",
				providerName: "Poolside",
				providerColor: null,
				percentile: 50,
				avgThroughput: null,
				avgLatencyMs: null,
				avgGenerationMs: null,
				cachedInputPct: 72.5,
				requests: 100,
			},
		]);

		expect(result).toEqual([
			expect.objectContaining({
				provider: "percentile-50",
				cachedInputPct: 72.5,
			}),
		]);
	});

	it("assigns a distinct colour to every supported percentile", () => {
		const result = buildSingleProviderPercentileSeries(
			1,
			MODEL_PERCENTILES.map((percentile) => ({
				day: "2026-07-23",
				provider: "poolside",
				providerName: "Poolside",
				providerColor: null,
				percentile,
				avgThroughput: 8.5,
				avgLatencyMs: 230,
				avgGenerationMs: 520,
				requests: 100,
			})),
		);

		expect(result).toHaveLength(MODEL_PERCENTILES.length);
		expect(new Set(result?.map((point) => point.providerColor)).size).toBe(
			MODEL_PERCENTILES.length,
		);
	});

	it("rejects empty or unsupported single-provider points", () => {
		expect(buildSingleProviderPercentileSeries(1, [])).toBeNull();
		expect(
			buildSingleProviderPercentileSeries(1, [
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
			]),
		).toBeNull();
	});
});
