import type { ModelPerformanceMetrics } from "@/lib/fetchers/models/getModelPerformance";
import {
	getLatestPerformanceSampleAt,
	hasPerformanceHistory,
	isPerformanceDataStale,
} from "./modelPerformanceFreshness";

function metrics(
	overrides: Partial<ModelPerformanceMetrics> = {},
): ModelPerformanceMetrics {
	return {
		summary: {
			avgThroughput: null,
			avgLatencyMs: null,
			avgGenerationMs: null,
			uptimePct: null,
			totalRequests: 0,
			successfulRequests: 0,
		},
		hourly: [],
		successSeries: [],
		timeOfDay: [],
		providerPerformance: [],
		providerDaily7d: [],
		dataRange: {
			start: "2026-08-29T12:00:00.000Z",
			end: "2026-08-30T12:00:00.000Z",
		},
		...overrides,
	};
}

describe("model performance freshness", () => {
	test("keeps seven-day performance history visible without current requests", () => {
		const staleBucket = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
		const value = metrics({
			providerHourly7d: [
				{
					bucket: staleBucket,
					provider: "openai",
					providerName: "OpenAI",
					providerColor: null,
					avgThroughput: 42,
					avgLatencyMs: 900,
					avgGenerationMs: 1200,
					requests: 30,
				},
			],
		});

		expect(hasPerformanceHistory(value)).toBe(true);
		expect(isPerformanceDataStale(value)).toBe(true);
		expect(getLatestPerformanceSampleAt(value)).toBe(staleBucket);
	});

	test("does not mark observations from the last 24 hours as stale", () => {
		const recentBucket = new Date(Date.now() - 60 * 60 * 1000).toISOString();
		const value = metrics({
			hourly: [
				{
					bucket: recentBucket,
					avgThroughput: 42,
					avgLatencyMs: 900,
					avgGenerationMs: 1200,
					requests: 30,
					successPct: 100,
				},
			],
		});

		expect(isPerformanceDataStale(value)).toBe(false);
	});

	test("does not call a completely empty dataset stale", () => {
		const value = metrics();

		expect(hasPerformanceHistory(value)).toBe(false);
		expect(isPerformanceDataStale(value)).toBe(false);
	});
});
