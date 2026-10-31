import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import PrivateModelPage, { getPrivateModelMetadata } from "@/features/settings/workspaces/private-models/privateModelId/PrivateModelPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getPrivateModelMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/workspaces/private-models/$privateModelId/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: PrivateModelPage,
});
