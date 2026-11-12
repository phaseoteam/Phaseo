import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import { MarkdownPreviewPage, getMarkdownPreviewMetadata } from "@/features/tools/markdown-preview/MarkdownPreviewPage";

const routeMetadata = createServerFn({ method: "GET" })
	.handler(async () => toSerializableMetadata(await getMarkdownPreviewMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/tools/markdown-preview/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: MarkdownPreviewPage,
});
