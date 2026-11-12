import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import ManagementApiKeysPage, { getManagementApiKeysMetadata } from "@/features/settings/management-api-keys/ManagementApiKeysPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getManagementApiKeysMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/management-api-keys/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: ManagementApiKeysPage,
});
