import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import NewWebhookPage, { getNewWebhookMetadata } from "@/features/settings/webhooks/new/NewWebhookPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getNewWebhookMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/webhooks/new/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: NewWebhookPage,
});
