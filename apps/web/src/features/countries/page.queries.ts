import { queryOptions } from "@tanstack/react-query";
import { fetchFrontendCountrySummaries } from "@/lib/fetchers/frontend/fetchPublicCatalog";

export const countrySummariesQuery = () =>
	queryOptions({
		queryKey: ["public-catalog", "country-summaries"],
		queryFn: () => fetchFrontendCountrySummaries(),
	});
