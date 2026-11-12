import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import BatchLogsPage, { getBatchLogsMetadata } from "@/features/settings/usage/logs/batches/BatchLogsPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getBatchLogsMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/usage/logs/batches/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: BatchLogsPage,
});
