import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import EnterpriseScimPage, { getEnterpriseScimMetadata } from "@/features/settings/workspaces/enterprise/scim/EnterpriseScimPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getEnterpriseScimMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/workspaces/enterprise/scim/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: EnterpriseScimPage,
});
