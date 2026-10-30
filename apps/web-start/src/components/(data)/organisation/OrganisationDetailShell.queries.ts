import { queryOptions } from "@tanstack/react-query";
import { fetchFrontendOrganisationHeader } from "@/lib/fetchers/frontend/fetchPublicCatalog";

/** `fetchFrontendOrganisationHeader(id)`; failures resolve to null (the shell then 404s). */
export const organisationHeaderQuery = (organisationId: string) =>
	queryOptions({
		queryKey: ["phaseo-web", "catalogue-organisation", "header", organisationId] as const,
		queryFn: () => fetchFrontendOrganisationHeader(organisationId).catch(() => null),
	});
