import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import InternalCachePage, { getInternalCacheMetadata } from "@/features/internal/cache/InternalCachePage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getInternalCacheMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/internal/cache/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: InternalCachePage,
});
