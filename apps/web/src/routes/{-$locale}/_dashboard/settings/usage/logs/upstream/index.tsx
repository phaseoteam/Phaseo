import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import UpstreamLogsPage, { getUpstreamLogsMetadata } from "@/features/settings/usage/logs/upstream/UpstreamLogsPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getUpstreamLogsMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/usage/logs/upstream/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: UpstreamLogsPage,
});
