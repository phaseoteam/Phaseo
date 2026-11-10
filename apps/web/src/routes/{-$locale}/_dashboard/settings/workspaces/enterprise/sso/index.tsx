import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import EnterpriseSsoPage, { getEnterpriseSsoMetadata } from "@/features/settings/workspaces/enterprise/sso/EnterpriseSsoPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getEnterpriseSsoMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/workspaces/enterprise/sso/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: EnterpriseSsoPage,
});
