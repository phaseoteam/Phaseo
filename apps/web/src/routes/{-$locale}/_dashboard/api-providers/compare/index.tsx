import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import ApiProvidersComparePage, { getApiProvidersCompareMetadata } from "@/features/api-providers/compare/ApiProvidersComparePage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getApiProvidersCompareMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/api-providers/compare/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: ApiProvidersComparePage,
});
