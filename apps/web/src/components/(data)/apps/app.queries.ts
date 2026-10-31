// Public app catalogue reads for the app page building blocks.
import { queryOptions } from "@tanstack/react-query";
import {
	fetchFrontendAppDetails,
	fetchFrontendAppUsage,
	fetchFrontendRecentAppRequests,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";
import type { RangeKey } from "@/lib/fetchers/apps/types";

const appRoot = ["phaseo-web", "catalogue-app"] as const;

/** `fetchFrontendAppDetails(appId)`; failures resolve to null (rendered as "not found"). */
export const appDetailsQuery = (appId: string) =>
	queryOptions({
		queryKey: [...appRoot, "details", appId] as const,
		queryFn: () => fetchFrontendAppDetails(appId).catch(() => null),
	});

export const appUsageQuery = (appId: string, range: RangeKey) =>
	queryOptions({
		queryKey: [...appRoot, "usage", appId, range] as const,
		queryFn: () => fetchFrontendAppUsage(appId, range),
	});

export const appRecentRequestsQuery = (appId: string, limit: number) =>
	queryOptions({
		queryKey: [...appRoot, "recent-requests", appId, limit] as const,
		queryFn: () => fetchFrontendRecentAppRequests(appId, limit),
	});
