import { queryOptions } from "@tanstack/react-query";
import { fetchFrontendFreeRouterOverview } from "@/lib/fetchers/frontend/fetchPublicCatalog";

/** Raw `fetchFrontendFreeRouterOverview()` (errors propagate). */
export const freeRouterOverviewQuery = () =>
	queryOptions({
		queryKey: ["phaseo-web", "catalogue-model", "free-router-overview"] as const,
		queryFn: () => fetchFrontendFreeRouterOverview(),
	});
