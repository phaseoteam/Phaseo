import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import WebhookEndpointPage, { getWebhookEndpointMetadata } from "@/features/settings/webhooks/endpointId/WebhookEndpointPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getWebhookEndpointMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/webhooks/$endpointId/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: WebhookEndpointPage,
});
