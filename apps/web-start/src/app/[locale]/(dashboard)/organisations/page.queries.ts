import { queryOptions } from "@tanstack/react-query";
import type { OrganisationCard } from "@/lib/fetchers/organisations/getAllOrganisations";
import { fetchFrontendOrganisations } from "@/lib/fetchers/frontend/fetchPublicCatalog";

export const organisationsQuery = () =>
	queryOptions({
		queryKey: ["public-catalog", "organisations"],
		queryFn: async () => (await fetchFrontendOrganisations()) as OrganisationCard[],
	});
