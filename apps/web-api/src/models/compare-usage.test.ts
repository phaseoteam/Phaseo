import { describe, expect, it } from "vitest";
import { composeCompareUsage } from "@/models/compare-usage";

describe("composeCompareUsage", () => {
	it("returns the final chart summary and uses realtime medians first", () => {
		const usage = composeCompareUsage([{
			model_id: "openai/gpt-test",
			performance: {
				last_24h: { total_requests: 42, avg_latency_ms: 120, avg_throughput: 80 },
				hourly_24h: [{ bucket: "2026-07-17T12:00:00Z", requests: 5 }],
				cumulative_tokens: { total_tokens: 1_000_000 },
			},
			trajectory: { points: [{ date: "2026-07-16", tokens: 100 }, { date: "2026-07-17", tokens: 250 }] },
			realtime_requests: 7,
			realtime_latency_p50: 95,
			realtime_throughput_p50: 90,
		}]);

		expect(usage).toEqual({
			"openai/gpt-test": {
				periodDays: 30,
				tokens30d: 350,
				latestDate: "2026-07-17",
				points30d: [{ date: "2026-07-16", value: 100 }, { date: "2026-07-17", value: 250 }],
				totalRequests: 42,
				requests30m: 7,
				latencyP50Ms30m: 95,
				throughputP50TokPerSec30m: 90,
				latencyWindow: "30m",
				throughputWindow: "30m",
				cumulativeTokens: 1_000_000,
				requestPoints24h: [{ date: "2026-07-17T12:00:00Z", value: 5 }],
			},
		});
	});

	it("names the window each fallback value comes from", () => {
		const usage = composeCompareUsage([
			{
				model_id: "a/day",
				performance: { last_24h: { avg_latency_ms: 120 }, hourly_24h: [{ avg_throughput: 60 }] },
			},
			{
				model_id: "b/five-days",
				performance: { time_of_day_5d: [{ avg_latency_ms: 3_000, avg_throughput: 70 }, { avg_latency_ms: 3_200, avg_throughput: 76 }] },
			},
			{ model_id: "c/none", performance: {} },
		]);

		expect(usage["a/day"]).toMatchObject({ latencyP50Ms30m: 120, latencyWindow: "24h", throughputP50TokPerSec30m: 60, throughputWindow: "24h" });
		expect(usage["b/five-days"]).toMatchObject({ latencyP50Ms30m: 3_100, latencyWindow: "5d", throughputP50TokPerSec30m: 73, throughputWindow: "5d" });
		expect(usage["c/none"]).toMatchObject({ latencyP50Ms30m: null, latencyWindow: null, throughputWindow: null });
	});
});
