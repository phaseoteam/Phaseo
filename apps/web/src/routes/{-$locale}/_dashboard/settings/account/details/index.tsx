import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import AccountDetailsPage, { getAccountDetailsMetadata } from "@/features/settings/account/details/AccountDetailsPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getAccountDetailsMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/account/details/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: AccountDetailsPage,
});
