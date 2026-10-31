import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import UsageTrendsPage, { getUsageTrendsMetadata } from "@/features/settings/usage/trends/UsageTrendsPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getUsageTrendsMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/usage/trends/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: UsageTrendsPage,
});
