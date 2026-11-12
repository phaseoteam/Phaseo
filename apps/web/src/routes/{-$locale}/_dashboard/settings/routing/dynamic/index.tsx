import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import DynamicRoutingPage, { getDynamicRoutingMetadata } from "@/features/settings/routing/dynamic/DynamicRoutingPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getDynamicRoutingMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/routing/dynamic/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: DynamicRoutingPage,
});
