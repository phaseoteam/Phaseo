import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import PrivateModelsPage, { getPrivateModelsMetadata } from "@/features/settings/workspaces/private-models/PrivateModelsPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getPrivateModelsMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/workspaces/private-models/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: PrivateModelsPage,
});
