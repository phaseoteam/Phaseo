import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { routeMetadataInput, toSerializableMetadata, type RouteMetadataInput } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import OrganisationCalendarPage, { getOrganisationCalendarMetadata } from "@/features/updates/calendar/organisations/organisationId/OrganisationCalendarPage";
import UpdatesLoading from "@/features/updates/UpdatesLoading";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: RouteMetadataInput) => input)
	.handler(async ({ data }) => toSerializableMetadata(await getOrganisationCalendarMetadata(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/updates/calendar/organisations/$organisationId/")({
	loader: ({ params, location }) => metadataLoaderData(routeMetadata({ data: routeMetadataInput(params, location.search) })),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	pendingComponent: UpdatesLoading,
	component: OrganisationCalendarPage,
});
