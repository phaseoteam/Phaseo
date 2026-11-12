import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { routeMetadataInput, type RouteMetadataInput, toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import NewDestinationPage, { getNewDestinationMetadata } from "@/features/settings/observability/destinations/new/provider/NewDestinationPage";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: RouteMetadataInput) => input)
	.handler(async ({ data }) => toSerializableMetadata(await getNewDestinationMetadata(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/observability/destinations/new/$provider/")({
	loader: ({ params, location }) => metadataLoaderData(routeMetadata({ data: routeMetadataInput(params, location.search) })),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: NewDestinationPage,
});
