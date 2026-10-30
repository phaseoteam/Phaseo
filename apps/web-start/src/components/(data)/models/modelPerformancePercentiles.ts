import type {
	ModelProviderDailyPoint,
	ModelProviderPercentileDailyPoint,
} from "@/lib/fetchers/models/getModelPerformance";
import {
	MODEL_PERCENTILES,
	formatModelPercentile,
	type ModelPercentile,
} from "@/components/(data)/models/ModelPercentileSelect";

const PERCENTILE_COLORS: Record<ModelPercentile, string> = {
	1: "oklch(0.78 0.14 205)",
	5: "oklch(0.74 0.15 220)",
	10: "oklch(0.70 0.16 235)",
	25: "oklch(0.66 0.17 250)",
	50: "oklch(0.62 0.18 265)",
	75: "oklch(0.59 0.19 280)",
	90: "oklch(0.56 0.20 295)",
	95: "oklch(0.53 0.21 310)",
	99: "oklch(0.50 0.22 325)",
};

export function buildSingleProviderPercentileSeries(
	providerCount: number,
	points: ModelProviderPercentileDailyPoint[] | undefined,
): ModelProviderDailyPoint[] | null {
	if (providerCount !== 1 || !points?.length) return null;

	const supported = new Set<number>(MODEL_PERCENTILES);
	const series = points
		.filter(
			(point) =>
				supported.has(point.percentile) &&
				point.requests > 0 &&
				(point.avgThroughput != null ||
					point.avgOutputSpeed != null ||
					point.avgLatencyMs != null ||
					point.avgEndToEndMs != null ||
					point.avgGenerationMs != null ||
					point.avgPhaseoOverheadMs != null ||
					point.avgTpotMs != null ||
					point.avgItlMs != null ||
					point.cachedInputPct != null),
		)
		.map((point) => {
			const percentile = point.percentile as ModelPercentile;
			return {
				...point,
				provider: `percentile-${percentile}`,
				providerName: formatModelPercentile(percentile),
				providerColor: PERCENTILE_COLORS[percentile],
			};
		});

	return series.length > 0 ? series : null;
}
