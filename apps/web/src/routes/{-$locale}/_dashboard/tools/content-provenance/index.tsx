import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import { ContentProvenancePage, getContentProvenanceMetadata } from "@/features/tools/content-provenance/ContentProvenancePage";

const routeMetadata = createServerFn({ method: "GET" })
	.handler(async () => toSerializableMetadata(await getContentProvenanceMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/tools/content-provenance/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: ContentProvenancePage,
});
