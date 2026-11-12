import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import { JsonFormatterPage, getJsonFormatterMetadata } from "@/features/tools/json-formatter/JsonFormatterPage";

const routeMetadata = createServerFn({ method: "GET" })
	.handler(async () => toSerializableMetadata(await getJsonFormatterMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/tools/json-formatter/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: JsonFormatterPage,
});
