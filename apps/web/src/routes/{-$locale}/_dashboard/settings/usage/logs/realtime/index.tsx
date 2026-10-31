import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import RealtimeLogsPage, { getRealtimeLogsMetadata } from "@/features/settings/usage/logs/realtime/RealtimeLogsPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getRealtimeLogsMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/usage/logs/realtime/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: RealtimeLogsPage,
});
