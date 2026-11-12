import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import KeysPage, { getKeysMetadata } from "@/features/settings/keys/KeysPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getKeysMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/keys/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: KeysPage,
});
