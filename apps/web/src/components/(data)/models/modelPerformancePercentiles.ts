import type {
	ModelProviderDailyPoint,
	ModelProviderPercentileDailyPoint,
} from "@/lib/fetchers/models/getModelPerformance";
import {
	MODEL_PERCENTILES,
	type ModelPercentile,
} from "./ModelPercentileSelect";

const PERCENTILE_COLORS: Record<ModelPercentile, string> = {
	50: "var(--chart-1)",
	75: "var(--chart-2)",
	90: "var(--chart-3)",
	95: "var(--chart-4)",
	99: "var(--chart-5)",
};

export function buildSingleProviderPercentileSeries(
	providerCount: number,
	points: ModelProviderPercentileDailyPoint[] | undefined,
): ModelProviderDailyPoint[] | null {
	if (providerCount !== 1 || !points?.length) return null;

	const supported = new Set<number>(MODEL_PERCENTILES);
	return points
		.filter(
			(point) =>
				supported.has(point.percentile) &&
				point.requests > 0 &&
				(point.avgThroughput != null ||
					point.avgLatencyMs != null ||
					point.avgGenerationMs != null),
		)
		.map((point) => {
			const percentile = point.percentile as ModelPercentile;
			return {
				...point,
				provider: `percentile-${percentile}`,
				providerName: `P${percentile}`,
				providerColor: PERCENTILE_COLORS[percentile],
			};
		});
}
