import {
	getProviderRuntimeStats,
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
});
