import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import BenchmarksPage, { getBenchmarksMetadata } from "@/features/benchmarks/BenchmarksPage";
import BenchmarksLoading from "@/features/benchmarks/BenchmarksLoading";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getBenchmarksMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/benchmarks/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	pendingComponent: BenchmarksLoading,
	component: BenchmarksPage,
});
