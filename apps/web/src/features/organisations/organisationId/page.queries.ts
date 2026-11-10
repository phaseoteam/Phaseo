import { queryOptions } from "@tanstack/react-query";
import {
	fetchFrontendOrganisation,
	fetchFrontendOrganisationModels,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";

export const organisationQuery = (organisationId: string, limit: number) =>
	queryOptions({
		queryKey: ["public-catalog", "organisation", organisationId, limit],
		queryFn: () => fetchFrontendOrganisation(organisationId, limit).catch(() => null),
	});

export const organisationModelsQuery = (organisationId: string) =>
	queryOptions({
		queryKey: ["public-catalog", "organisation-models", organisationId],
		queryFn: () => fetchFrontendOrganisationModels(organisationId).catch(() => null),
	});
