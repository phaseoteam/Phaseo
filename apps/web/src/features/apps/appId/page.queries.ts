import { queryOptions } from "@tanstack/react-query";
import {
	fetchFrontendAppDetails,
	fetchFrontendAppProviderModelMappings,
	fetchFrontendAppUsage,
	fetchFrontendModelLeaderboardMetaByIds,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";

export const appDetailsQuery = (appId: string) =>
	queryOptions({
		queryKey: ["public-catalog", "app-details", appId],
		queryFn: async () => (await fetchFrontendAppDetails(appId)) ?? null,
	});

export const appUsageQuery = (appId: string, range: "4w") =>
	queryOptions({
		queryKey: ["public-catalog", "app-usage", appId, range],
		queryFn: () => fetchFrontendAppUsage(appId, range),
	});

/** Empty lookups resolve to null without a request. */
export const appProviderModelMappingsQuery = (appId: string, apiLookupIds: string[], providerIds: string[]) =>
	queryOptions({
		queryKey: ["public-catalog", "app-provider-model-mappings", appId, apiLookupIds, providerIds],
		queryFn: async () =>
			apiLookupIds.length > 0
				? ((await fetchFrontendAppProviderModelMappings(appId, apiLookupIds, providerIds)) ?? null)
				: null,
	});

export const modelLeaderboardMetaQuery = (modelIds: string[]) =>
	queryOptions({
		queryKey: ["public-catalog", "model-leaderboard-meta", modelIds],
		queryFn: () => fetchFrontendModelLeaderboardMetaByIds(modelIds),
	});
