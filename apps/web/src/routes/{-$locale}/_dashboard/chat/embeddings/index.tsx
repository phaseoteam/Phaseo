import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import EmbeddingsChatPage, { getEmbeddingsChatMetadata } from "@/features/chat/embeddings/EmbeddingsChatPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getEmbeddingsChatMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/chat/embeddings/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: EmbeddingsChatPage,
});
