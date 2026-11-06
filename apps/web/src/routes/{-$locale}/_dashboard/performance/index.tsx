import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import { PerformancePage, getPerformanceMetadata } from "@/features/performance/PerformancePage";

const routeMetadata = createServerFn({ method: "GET" })
	.handler(async () => toSerializableMetadata(await getPerformanceMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/performance/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: PerformancePage,
});
