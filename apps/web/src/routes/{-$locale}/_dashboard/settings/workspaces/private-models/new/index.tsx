import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import NewPrivateModelPage, { getNewPrivateModelMetadata } from "@/features/settings/workspaces/private-models/new/NewPrivateModelPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getNewPrivateModelMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/workspaces/private-models/new/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: NewPrivateModelPage,
});
