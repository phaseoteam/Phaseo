import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import ApiProvidersPage, { getApiProvidersMetadata } from "@/features/api-providers/ApiProvidersPage";
import ApiProvidersLoading from "@/features/api-providers/ApiProvidersLoading";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getApiProvidersMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/api-providers/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	pendingComponent: ApiProvidersLoading,
	component: ApiProvidersPage,
});
