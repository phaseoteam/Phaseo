import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { routeMetadataInput, toSerializableMetadata, type RouteMetadataInput } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import OrganisationModelsPage, { getOrganisationModelsMetadata } from "@/features/organisations/organisationId/models/OrganisationModelsPage";
import { organisationModelsQuery } from "@/features/organisations/organisationId/page.queries";
import { notFound } from "@/lib/navigation";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: RouteMetadataInput) => input)
	.handler(async ({ data }) => toSerializableMetadata(await getOrganisationModelsMetadata(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/organisations/$organisationId/models/")({
	loader: async ({ params, location, context }) => {
		const metadataPromise = routeMetadata({ data: routeMetadataInput(params, location.search) });
		metadataPromise.catch(() => undefined);
		if (!(await context.queryClient.ensureQueryData(organisationModelsQuery(params.organisationId)))) notFound();
		return metadataLoaderData(metadataPromise);
	},
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: OrganisationModelsPage,
});
