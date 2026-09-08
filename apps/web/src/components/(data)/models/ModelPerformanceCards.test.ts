import type { ModelProviderDailyPoint } from "@/lib/fetchers/models/getModelPerformance";
import type { ModelPerformanceQualityPoint } from "@/lib/fetchers/models/getModelPerformance";
import { hasQualityMetricData, selectMetricData } from "./ModelPerformanceCards";

function point(
	provider: string,
	avgEndToEndMs: number | null,
): ModelProviderDailyPoint {
	return {
		provider,
		providerName: provider,
		providerColor: null,
		day: "2026-08-08",
		avgThroughput: null,
		avgOutputSpeed: null,
		avgLatencyMs: null,
		avgEndToEndMs,
		avgGenerationMs: null,
		avgPhaseoOverheadMs: null,
		avgTpotMs: null,
		avgItlMs: null,
		cachedInputPct: null,
		cachedInputTokens: null,
		effectiveInputTokens: null,
		cacheTelemetryRequests: 0,
		requests: 1,
	};
}

describe("selectMetricData", () => {
	it("falls back to detailed percentile data when the compact bands are empty", () => {
		const detailData = [point("percentile-95", 42)];
		const cardData = [point("percentile-50", null)];

		expect(
			selectMetricData(
				"endToEnd",
				false,
				detailData,
				cardData,
				true,
			),
		).toBe(detailData);
	});

	it("keeps the compact percentile bands when they contain the metric", () => {
		const detailData = [point("percentile-95", 42)];
		const cardData = [point("percentile-50", 30)];

		expect(
			selectMetricData(
				"endToEnd",
				false,
				detailData,
				cardData,
				true,
			),
		).toBe(cardData);
	});
});

describe("hasQualityMetricData", () => {
	const qualityPoint: ModelPerformanceQualityPoint = {
		bucket: "2026-08-08T00:00:00.000Z",
		toolCallSuccessPct: null,
		toolCallErrorPct: null,
		structuredOutputSuccessPct: null,
		structuredOutputErrorPct: null,
		cacheHitRatePct: null,
		requests: 1,
	};

	it("hides metrics without telemetry", () => {
		expect(hasQualityMetricData("toolCallErrorPct", [qualityPoint])).toBe(false);
		expect(hasQualityMetricData("structuredOutputErrorPct", [qualityPoint])).toBe(false);
		expect(hasQualityMetricData("cacheHitRatePct", [qualityPoint])).toBe(false);
	});

	it("does not treat historical zero defaults as validated error data", () => {
		expect(
			hasQualityMetricData("toolCallErrorPct", [
				{ ...qualityPoint, toolCallErrorPct: 0, toolCallHistoricalDefault: true },
			]),
		).toBe(false);
		expect(
			hasQualityMetricData("structuredOutputErrorPct", [
				{
					...qualityPoint,
					structuredOutputErrorPct: 0,
					structuredOutputHistoricalDefault: true,
				},
			]),
		).toBe(false);
	});

	it("shows metrics with real telemetry, including a measured zero", () => {
		expect(
			hasQualityMetricData("toolCallErrorPct", [
				{ ...qualityPoint, toolCallErrorPct: 0 },
			]),
		).toBe(true);
		expect(
			hasQualityMetricData("cacheHitRatePct", [
				{ ...qualityPoint, cacheHitRatePct: 0 },
			]),
		).toBe(true);
	});
});
