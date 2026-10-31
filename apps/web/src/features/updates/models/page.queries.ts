import { queryOptions } from "@tanstack/react-query";
import { fetchFrontendModelUpdates } from "@/lib/fetchers/frontend/fetchPublicCatalog";

export const modelUpdatesQuery = (upcomingLimit: number) =>
	queryOptions({
		queryKey: ["public-catalog", "model-updates", "all-past", upcomingLimit],
		queryFn: () =>
			fetchFrontendModelUpdates({
				includeAllPast: true,
				upcomingLimit,
			}),
	});
