import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import UsageOverviewPage, { getUsageOverviewMetadata } from "@/features/settings/usage/overview/UsageOverviewPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getUsageOverviewMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/usage/overview/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: UsageOverviewPage,
});
