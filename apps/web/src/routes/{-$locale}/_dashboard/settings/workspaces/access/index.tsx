import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import WorkspaceAccessPage, { getWorkspaceAccessMetadata } from "@/features/settings/workspaces/access/WorkspaceAccessPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getWorkspaceAccessMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/workspaces/access/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: WorkspaceAccessPage,
});
