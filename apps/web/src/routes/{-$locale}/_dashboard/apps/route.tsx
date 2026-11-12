// Section-wide metadata (noindex); the app pages below refine the title.
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import { getAppsLayoutMetadata } from "@/features/apps/appsLayoutMetadata";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getAppsLayoutMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/apps")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
});
