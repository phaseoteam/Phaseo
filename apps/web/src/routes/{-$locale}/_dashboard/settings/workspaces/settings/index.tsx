import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import WorkspaceSettingsPage, { getWorkspaceSettingsMetadata } from "@/features/settings/workspaces/settings/WorkspaceSettingsPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getWorkspaceSettingsMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/workspaces/settings/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: WorkspaceSettingsPage,
});
