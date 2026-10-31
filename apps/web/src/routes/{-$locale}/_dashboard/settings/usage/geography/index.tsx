import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import UsageGeographyPage, { getUsageGeographyMetadata } from "@/features/settings/usage/geography/UsageGeographyPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getUsageGeographyMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/usage/geography/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: UsageGeographyPage,
});
