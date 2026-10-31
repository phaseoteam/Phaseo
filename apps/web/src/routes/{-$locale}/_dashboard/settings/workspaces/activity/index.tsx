import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import WorkspaceActivityPage, { getWorkspaceActivityMetadata } from "@/features/settings/workspaces/activity/WorkspaceActivityPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getWorkspaceActivityMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/workspaces/activity/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: WorkspaceActivityPage,
});
