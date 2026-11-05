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
					reachability_pct: 70,
					capacity_pct: 80,
					call_error_pct: 90,
					uptime_pct: 40,
					buckets: [{ start: "2026-08-30T09:00:00.000Z", reachability_pct: 70, capacity_pct: 80, call_error_pct: 90, uptime_pct: 40 }],
					days: [
						{ start: "2026-08-29T00:00:00.000Z", end: "2026-08-30T00:00:00.000Z", uptime_pct: 50 },
						{ start: "2026-08-30T00:00:00.000Z", end: "2026-08-31T00:00:00.000Z", uptime_pct: 40 },
					],
				},
			],
		});
		const flaky = getProviderRuntimeStats(stats, "flaky");
		// Requests succeeded after failover; the provider's own attempts did not.
		expect(flaky).toMatchObject({ uptimePct3d: 40, requests3d: 4 });
		// Daily bars use web-api's per-day attempt rates; no attempt counts are published.
		// A day without attempts shows 100%, flagged so its bar can say there was no traffic.
		expect(flaky?.uptimeDaily3d[0]).toMatchObject({ dayOffset: 0, uptimePct: 40, noTraffic: false });
		expect(flaky?.uptimeDaily3d[1]).toMatchObject({ dayOffset: 1, uptimePct: 50, noTraffic: false });
		expect(flaky?.uptimeDaily3d[2]).toMatchObject({ dayOffset: 2, uptimePct: 100, noTraffic: true });
		// Hourly bars use the attempt rate of each hour, never the request-level one.
		expect(flaky?.performanceHourly3d).toHaveLength(72);
		expect(flaky?.performanceHourly3d.at(-2)).toMatchObject({ start: "2026-08-30T09:00:00.000Z", uptimePct: 40 });
		expect(flaky?.performanceHourly3d.at(-1)).toMatchObject({ start: "2026-08-30T10:00:00.000Z", uptimePct: 100 });
		expect(flaky?.attemptHealth3d).toEqual({
			reachabilityPct: 70,
			capacityPct: 80,
			callErrorPct: 90,
			uptimePct: 40,
		});
	});

	it("never falls back to request-level bars when a response has no attempt days or hours", () => {
		const stats = mapRpcRuntimeStatsRows({
			now,
			providerIds: ["flaky"],
			rows: [
				{ provider_id: "flaky", service_tier: "standard", requests: 4, health_requests: 4, health_success_requests: 3, uptime_pct: 75,
					buckets: [{ start: "2026-08-30T09:00:00.000Z", requests: 4, health_requests: 4, health_success_requests: 3 }] },
			] as Parameters<typeof mapRpcRuntimeStatsRows>[0]["rows"],
			attemptHealthRows: [{ provider_id: "flaky", service_tier: "standard", reachability_pct: 70, capacity_pct: 80, call_error_pct: 90, uptime_pct: 40, buckets: [] }],
		});
		const flaky = getProviderRuntimeStats(stats, "flaky");
		expect(flaky?.uptimePct3d).toBe(40);
		expect(flaky?.uptimeDaily3d.map((day) => day.uptimePct)).toEqual([100, 100, 100]);
		expect(flaky?.performanceHourly3d.every((point) => point.uptimePct === 100)).toBe(true);
	});

	it("adds providers that only failed over; traffic without attempt rates reads 100%, no traffic stays empty", () => {
		const stats = mapRpcRuntimeStatsRows({
			now,
			providerIds: ["served", "failover-only", "idle"],
			rows: [
				// Request-level uptime of 50% is never shown: without attempt rates the provider reads 100%.
				{ provider_id: "served", service_tier: "standard", requests: 2, health_requests: 2, health_success_requests: 1, uptime_pct: 50,
					buckets: [{ start: "2026-08-30T09:00:00.000Z", requests: 2, health_requests: 2, health_success_requests: 1 }] },
			] as Parameters<typeof mapRpcRuntimeStatsRows>[0]["rows"],
			attemptHealthRows: [
				{ provider_id: "failover-only", service_tier: "standard", reachability_pct: 0, capacity_pct: null, call_error_pct: null, uptime_pct: 0, buckets: [], days: [] },
			],
		});
		const served = getProviderRuntimeStats(stats, "served");
		expect(served).toMatchObject({ uptimePct3d: 100, healthRequests3d: 2, attemptHealth3d: null });
		expect(served?.uptimeDaily3d.map((day) => day.uptimePct)).toEqual([100, 100, 100]);
		expect(served?.performanceHourly3d.at(-2)).toMatchObject({ start: "2026-08-30T09:00:00.000Z", uptimePct: 100 });
		expect(getProviderRuntimeStats(stats, "failover-only")).toMatchObject({
			uptimePct3d: 0,
			attemptHealth3d: { reachabilityPct: 0, capacityPct: null, callErrorPct: null, uptimePct: 0 },
		});
		// A provider with no traffic in the window has no uptime to show ("--").
		const idle = getProviderRuntimeStats(stats, "idle");
		expect(idle).toMatchObject({ uptimePct3d: null, attemptHealth3d: null });
		expect(idle?.uptimeDaily3d.map((day) => day.uptimePct)).toEqual([null, null, null]);
		expect(idle?.uptimeDaily3d.every((day) => day.noTraffic)).toBe(true);
		expect(idle?.performanceHourly3d.every((point) => point.uptimePct === null)).toBe(true);
	});
});
