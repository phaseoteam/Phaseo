import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import AccountDangerPage, { getAccountDangerMetadata } from "@/features/settings/account/danger/AccountDangerPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getAccountDangerMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/account/danger/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: AccountDangerPage,
});
