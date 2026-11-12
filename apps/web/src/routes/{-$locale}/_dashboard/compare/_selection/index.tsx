import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import ComparePage, { getCompareMetadata } from "@/features/compare/ComparePage";
import CompareLoading from "@/features/compare/CompareLoading";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getCompareMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/compare/_selection/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	pendingComponent: CompareLoading,
	component: ComparePage,
});
