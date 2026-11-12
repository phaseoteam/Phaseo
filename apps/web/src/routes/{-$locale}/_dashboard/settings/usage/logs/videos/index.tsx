import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import VideoLogsPage, { getVideoLogsMetadata } from "@/features/settings/usage/logs/videos/VideoLogsPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getVideoLogsMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/usage/logs/videos/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: VideoLogsPage,
});
