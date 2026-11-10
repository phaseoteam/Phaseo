import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import OrganisationsPage, { getOrganisationsMetadata } from "@/features/organisations/OrganisationsPage";
import OrganisationsLoading from "@/features/organisations/OrganisationsLoading";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getOrganisationsMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/organisations/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	pendingComponent: OrganisationsLoading,
	component: OrganisationsPage,
});
