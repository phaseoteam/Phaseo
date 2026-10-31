import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import WorkspaceMembersPage, { getWorkspaceMembersMetadata } from "@/features/settings/workspaces/members/WorkspaceMembersPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getWorkspaceMembersMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/workspaces/members/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: WorkspaceMembersPage,
});
