import { queryOptions } from "@tanstack/react-query";
import {
	fetchFrontendAppImageUrls,
	fetchFrontendPublicAppIds,
	fetchFrontendTopApps,
	fetchFrontendTrendingApps,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";

type TopAppsRange = Parameters<typeof fetchFrontendTopApps>[0];

export const publicAppIdsQuery = () =>
	queryOptions({
		queryKey: ["public-catalog", "public-app-ids"],
		queryFn: () => fetchFrontendPublicAppIds(),
	});

export const topAppsQuery = (range: TopAppsRange, limit: number) =>
	queryOptions({
		queryKey: ["public-catalog", "top-apps", range, limit],
		queryFn: () => fetchFrontendTopApps(range, limit),
	});

export const trendingAppsQuery = (limit: number) =>
	queryOptions({
		queryKey: ["public-catalog", "trending-apps", limit],
		queryFn: () => fetchFrontendTrendingApps(limit),
	});

export const appImageUrlsQuery = (appIds: string[]) =>
	queryOptions({
		queryKey: ["public-catalog", "app-image-urls", appIds],
		queryFn: () => fetchFrontendAppImageUrls(appIds),
	});
