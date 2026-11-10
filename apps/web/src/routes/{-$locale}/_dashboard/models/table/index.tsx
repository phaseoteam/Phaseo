import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import ModelsTablePage, { getModelsTableMetadata } from "@/features/models/table/ModelsTablePage";
import ModelsTableLoading from "@/features/models/table/ModelsTableLoading";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getModelsTableMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/models/table/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	pendingComponent: ModelsTableLoading,
	component: ModelsTablePage,
});
