import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import RequestLogPage, { getRequestLogMetadata } from "@/features/settings/usage/logs/requests/requestId/RequestLogPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getRequestLogMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/usage/logs/requests/$requestId/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: RequestLogPage,
});
