"use client";

import type { ModelPerformanceMetrics } from "@/lib/fetchers/models/getModelPerformance";
import ModelSuccessChart from "./ModelSuccessChart";
import { DEFAULT_MODEL_PERCENTILE } from "./ModelPercentileSelect";
import { useModelPerformanceMetrics } from "./useModelPerformanceMetrics";

export default function ModelUptimeDashboard({
	modelId,
	initialMetrics,
}: {
	modelId: string;
	initialMetrics: ModelPerformanceMetrics | null;
}) {
	const { data } = useModelPerformanceMetrics({
		modelId,
		cloudflareColo: null,
		percentile: DEFAULT_MODEL_PERCENTILE,
		rangeDays: 3,
		fallbackData: initialMetrics ?? undefined,
	});
	const metrics = data ?? initialMetrics;
	const showLeastStableProvider =
		metrics?.successSeries.some(
			(point) =>
				(point.providerCount ?? 0) > 1 &&
				point.worstProviderSuccessPct != null,
		) ?? false;

	return (
		<ModelSuccessChart
			successSeries={metrics?.successSeries ?? []}
			showLeastStableProvider={showLeastStableProvider}
			showTitle={false}
		/>
	);
}
