"use client";

import type { ModelPerformanceMetrics } from "@/lib/fetchers/models/getModelPerformance";
import ModelProviderHealthChart from "./ModelProviderHealthChart";
import { DEFAULT_MODEL_PERCENTILE } from "./ModelPercentileSelect";
import { useModelPerformanceMetrics } from "./useModelPerformanceMetrics";

/**
 * Model uptime: Reachable, Accepted and Completed per provider attempt over the
 * last 24 hours. Hours without data show as 100%, so a model with no recent
 * traffic (or a response without attempt rates) shows three flat 100% lines.
 */
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

	return (
		<ModelProviderHealthChart
			successSeries={metrics?.successSeries ?? []}
			totals={metrics?.attemptHealth24h ?? null}
			showTitle={false}
		/>
	);
}
