import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import ChatLayout, { getChatLayoutMetadata } from "@/features/chat/ChatLayout";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getChatLayoutMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/chat")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => {
		const head = metadataToHead(loaderData?.metadata);
		// The on-screen keyboard resizes the page, so the composer stays above it.
		return { ...head, meta: [...head.meta, { name: "viewport", content: "width=device-width, initial-scale=1, interactive-widget=resizes-content" }] };
	},
	component: ChatLayout,
});
