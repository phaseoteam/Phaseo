import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import EnterpriseDirectoryPage, { getEnterpriseDirectoryMetadata } from "@/features/settings/workspaces/enterprise/directory/EnterpriseDirectoryPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getEnterpriseDirectoryMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/workspaces/enterprise/directory/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: EnterpriseDirectoryPage,
});
