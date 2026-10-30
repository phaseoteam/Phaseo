import type { ModelsPageData, ModelsPageModel } from "@/components/(data)/models/Models/modelsDisplay.types";
import { publicFetcher } from "@/lib/query/publicFetcher";

export type ModelWeeklyMetrics = Pick<ModelsPageModel,
	"popularity_tokens_week" | "weekly_usage_metric" | "weekly_usage_quantity" |
	"weekly_usage_unit" | "throughput_week" | "latency_week"
> & { model_slug: string };

export type FreeRouterUsage = {
	summary: { routedRequests30d: number; totalCostNanos30d: number };
};

export async function fetchModelWeeklyMetrics(signal?: AbortSignal) {
	const response = await publicFetcher<{ metrics: ModelWeeklyMetrics[] }>(
		"/api/_web/models/weekly-metrics", { signal },
	);
	return response.metrics;
}

export function fetchFreeRouterUsage(signal?: AbortSignal) {
	return publicFetcher<FreeRouterUsage>("/api/_web/models/free-router-overview", { signal });
}

/** Optional usage updates must never replace the catalogue or its filters. */
export function withModelsUsage(
	data: ModelsPageData,
	metrics: ModelWeeklyMetrics[] | undefined,
	freeRouter: FreeRouterUsage | undefined,
): ModelsPageData {
	if (!metrics && !freeRouter) return data;
	const byId = new Map(metrics?.map((row) => [row.model_slug, row]));
	return {
		...data,
		models: data.models.map((model) => {
			if (model.gateway_tiers?.includes("private")) return model;
			if (model.model_id === "phaseo/free" && freeRouter) return {
				...model,
				router_requests_30d: freeRouter.summary.routedRequests30d,
				router_spend_nanos_30d: freeRouter.summary.totalCostNanos30d,
			};
			const metric = byId.get(model.model_id);
			if (!metric) return model;
			return {
				...model,
				popularity_tokens_week: metric.popularity_tokens_week,
				weekly_usage_metric: metric.weekly_usage_metric,
				weekly_usage_quantity: metric.weekly_usage_quantity,
				weekly_usage_unit: metric.weekly_usage_unit,
				throughput_week: metric.throughput_week,
				latency_week: metric.latency_week,
			};
		}),
	};
}
