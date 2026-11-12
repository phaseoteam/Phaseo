import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import ApiProvidersTablePage, { getApiProvidersTableMetadata } from "@/features/api-providers/table/ApiProvidersTablePage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getApiProvidersTableMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/api-providers/table/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: ApiProvidersTablePage,
});
