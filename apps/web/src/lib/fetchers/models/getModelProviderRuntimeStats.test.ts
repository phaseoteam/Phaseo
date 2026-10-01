import {
	getProviderRuntimeStats,
	fillHourlyPerformanceBuckets,
	fillHourlyUptimeBuckets,
	mapRpcRuntimeStatsRows,
	providerRuntimeStatsKey,
} from "./getModelProviderRuntimeStats";

describe("provider runtime stats by service tier", () => {
	it("keeps provider tiers in separate runtime buckets", () => {
		const stats = mapRpcRuntimeStatsRows({
			providerIds: ["openai"],
			rows: [
				{
					provider_id: "openai",
					provider_name: "OpenAI",
					service_tier: "standard",
					requests: 20,
					requests_30m: 4,
					percentile_latency_ms_30m: 800,
					percentile_throughput_30m: 50,
					buckets: [],
				},
				{
					provider_id: "openai",
					provider_name: "OpenAI",
					service_tier: "priority",
					requests: 10,
					requests_30m: 3,
					percentile_latency_ms_30m: 250,
					percentile_throughput_30m: 120,
					buckets: [],
				},
			] as Parameters<typeof mapRpcRuntimeStatsRows>[0]["rows"],
		});

		expect(Object.keys(stats)).toEqual([
			providerRuntimeStatsKey("openai", "standard"),
			providerRuntimeStatsKey("openai", "priority"),
		]);
		expect(getProviderRuntimeStats(stats, "openai", "standard")).toMatchObject({
			serviceTier: "standard",
			latencyMs30m: 800,
			throughput30m: 50,
		});
		expect(getProviderRuntimeStats(stats, "openai", "fast")).toMatchObject({
			serviceTier: "priority",
			latencyMs30m: 250,
			throughput30m: 120,
		});
	});

	it("normalizes service-tier aliases before indexing runtime stats", () => {
		const stats = mapRpcRuntimeStatsRows({
			providerIds: ["openai"],
			rows: [
				{
					provider_id: "openai",
					service_tier: "default",
					requests: 20,
					requests_30m: 4,
					percentile_latency_ms_30m: 800,
					percentile_throughput_30m: 50,
					buckets: [],
				},
				{
					provider_id: "openai",
					service_tier: "fast",
					requests: 10,
					requests_30m: 3,
					percentile_latency_ms_30m: 250,
					percentile_throughput_30m: 120,
					buckets: [],
				},
			] as Parameters<typeof mapRpcRuntimeStatsRows>[0]["rows"],
		});

		expect(getProviderRuntimeStats(stats, "openai", "standard")).toMatchObject({
			serviceTier: "standard",
			latencyMs30m: 800,
		});
		expect(getProviderRuntimeStats(stats, "openai", "priority")).toMatchObject({
			serviceTier: "priority",
			latencyMs30m: 250,
		});
	});
});

describe("fillHourlyUptimeBuckets", () => {
	it("keeps a fixed 72-hour timeline and fills missing hours", () => {
		const points = fillHourlyUptimeBuckets(
			[
				{
					start: "2026-08-30T09:27:00.000Z",
					uptimePct: 98.5,
					errorPct: 1.5,
					requests: 12,
					failed: 1,
					rateLimited: 0,
				},
			],
			new Date("2026-08-30T10:42:00.000Z"),
		);

		expect(points).toHaveLength(72);
		expect(points.at(-2)).toMatchObject({
			start: "2026-08-30T09:00:00.000Z",
			uptimePct: 98.5,
			requests: 12,
		});
		expect(points.at(-1)).toMatchObject({
			start: "2026-08-30T10:00:00.000Z",
			uptimePct: null,
			requests: 0,
		});
		expect(points[0]).toMatchObject({
			start: "2026-08-27T11:00:00.000Z",
			uptimePct: null,
			requests: 0,
		});
	});
});

describe("fillHourlyPerformanceBuckets", () => {
	it("keeps latency and throughput aligned to the fixed hourly timeline", () => {
		const points = fillHourlyPerformanceBuckets(
			[
				{
					start: "2026-08-30T09:27:00.000Z",
					uptimePct: 98.5,
					latencyMs: 820,
					throughput: 74.2,
					requests: 12,
				},
			],
			new Date("2026-08-30T10:42:00.000Z"),
		);

		expect(points).toHaveLength(72);
		expect(points.at(-2)).toMatchObject({
			start: "2026-08-30T09:00:00.000Z",
			latencyMs: 820,
			throughput: 74.2,
		});
		expect(points.at(-1)).toMatchObject({
			start: "2026-08-30T10:00:00.000Z",
			latencyMs: null,
			throughput: null,
		});
	});
});
