import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import EnterprisePage, { getEnterpriseMetadata } from "@/features/settings/workspaces/enterprise/EnterprisePage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getEnterpriseMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/workspaces/enterprise/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: EnterprisePage,
});
