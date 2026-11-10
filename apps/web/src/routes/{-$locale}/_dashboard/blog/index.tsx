import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import { BlogPage, getBlogMetadata } from "@/features/blog/BlogPage";

const routeMetadata = createServerFn({ method: "GET" })
	.handler(async () => toSerializableMetadata(await getBlogMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/blog/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: BlogPage,
});
