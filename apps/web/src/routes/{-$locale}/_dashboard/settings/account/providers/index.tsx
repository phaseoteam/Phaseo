import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import AccountProvidersPage, { getAccountProvidersMetadata } from "@/features/settings/account/providers/AccountProvidersPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getAccountProvidersMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/account/providers/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: AccountProvidersPage,
});
