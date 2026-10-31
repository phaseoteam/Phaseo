import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import UsageExplorePage, { getUsageExploreMetadata } from "@/features/settings/usage/explore/UsageExplorePage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getUsageExploreMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/usage/explore/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: UsageExplorePage,
});
