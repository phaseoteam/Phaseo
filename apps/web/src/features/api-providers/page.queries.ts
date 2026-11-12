import { queryOptions } from "@tanstack/react-query";
import type { APIProviderCard } from "@/lib/fetchers/api-providers/providerDataTypes";
import { fetchFrontendAPIProviders } from "@/lib/fetchers/frontend/fetchPublicCatalog";

export const apiProvidersQuery = () =>
	queryOptions({
		queryKey: ["public-catalog", "api-providers"],
		queryFn: async () => (await fetchFrontendAPIProviders()) as APIProviderCard[],
	});
