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

describe("per-attempt provider health", () => {
	const now = new Date("2026-08-30T10:42:00.000Z");

	it("bases uptime on eligible attempts and keeps the three rates", () => {
		const stats = mapRpcRuntimeStatsRows({
			now,
			providerIds: ["flaky"],
			rows: [
				{
					provider_id: "flaky",
					service_tier: "standard",
					requests: 4,
					health_requests: 4,
					health_success_requests: 4,
					uptime_pct: 100,
					buckets: [{ start: "2026-08-30T09:00:00.000Z", requests: 4, health_requests: 4, health_success_requests: 4 }],
				},
			] as Parameters<typeof mapRpcRuntimeStatsRows>[0]["rows"],
			attemptHealthRows: [
				{
					provider_id: "flaky",
					service_tier: "standard",
					attempts: 11,
					eligible_attempts: 10,
					success_attempts: 4,
					reachability_failures: 3,
					capacity_failures: 2,
					call_error_failures: 1,
					reachability_pct: 70,
					capacity_pct: 80,
					call_error_pct: 90,
					uptime_pct: 40,
					buckets: [{ start: "2026-08-30T09:00:00.000Z", eligible_attempts: 10, success_attempts: 4 }],
				},
			],
		});
		const flaky = getProviderRuntimeStats(stats, "flaky");
		// Requests succeeded after failover; the provider's own attempts did not.
		expect(flaky).toMatchObject({ uptimePct3d: 40, healthRequests3d: 10, healthSuccessful3d: 4, requests3d: 4 });
		expect(flaky?.uptimeDaily3d[0]).toEqual({ dayOffset: 0, uptimePct: 40, requests: 10, successful: 4 });
		expect(flaky?.attemptHealth3d).toEqual({
			attempts: 11,
			eligibleAttempts: 10,
			successAttempts: 4,
			reachabilityFailures: 3,
			capacityFailures: 2,
			callErrorFailures: 1,
			reachabilityPct: 70,
			capacityPct: 80,
			callErrorPct: 90,
			uptimePct: 40,
		});
	});

	it("adds providers that only failed over and keeps request uptime without attempt data", () => {
		const stats = mapRpcRuntimeStatsRows({
			now,
			providerIds: ["served", "failover-only"],
			rows: [
				{ provider_id: "served", service_tier: "standard", requests: 2, health_requests: 2, health_success_requests: 2, uptime_pct: 100, buckets: [] },
			] as Parameters<typeof mapRpcRuntimeStatsRows>[0]["rows"],
			attemptHealthRows: [
				{ provider_id: "failover-only", service_tier: "standard", attempts: 2, eligible_attempts: 2, success_attempts: 0, reachability_failures: 2, reachability_pct: 0, capacity_pct: 100, call_error_pct: 100, uptime_pct: 0, buckets: [] },
			],
		});
		expect(getProviderRuntimeStats(stats, "served")).toMatchObject({ uptimePct3d: 100, healthRequests3d: 2, attemptHealth3d: null });
		expect(getProviderRuntimeStats(stats, "failover-only")).toMatchObject({
			uptimePct3d: 0,
			healthRequests3d: 2,
			attemptHealth3d: expect.objectContaining({ reachabilityFailures: 2, reachabilityPct: 0 }),
		});
	});
});
