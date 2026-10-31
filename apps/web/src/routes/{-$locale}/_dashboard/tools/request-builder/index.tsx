import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import { RequestBuilderPage, getRequestBuilderMetadata } from "@/features/tools/request-builder/RequestBuilderPage";

const routeMetadata = createServerFn({ method: "GET" })
	.handler(async () => toSerializableMetadata(await getRequestBuilderMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/tools/request-builder/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: RequestBuilderPage,
});
