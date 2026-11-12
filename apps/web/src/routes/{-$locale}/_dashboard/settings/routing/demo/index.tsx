import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import RoutingDemoPage, { getRoutingDemoMetadata } from "@/features/settings/routing/demo/RoutingDemoPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getRoutingDemoMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/routing/demo/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: RoutingDemoPage,
});
