import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import OauthAppPage, { getOauthAppMetadata } from "@/features/settings/oauth-apps/clientId/OauthAppPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getOauthAppMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/oauth-apps/$clientId/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: OauthAppPage,
});
