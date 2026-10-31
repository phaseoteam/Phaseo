import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import { ToolsPage, getToolsMetadata } from "@/features/tools/ToolsPage";
import { ToolsLoading } from "@/features/tools/ToolsLoading";

const routeMetadata = createServerFn({ method: "GET" })
	.handler(async () => toSerializableMetadata(await getToolsMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/tools/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: ToolsPage,
	pendingComponent: ToolsLoading,
});
