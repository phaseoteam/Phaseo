import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import ProviderSectionPage, { getProviderSectionMetadata } from "@/features/settings/provider/section/ProviderSectionPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getProviderSectionMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/provider/$section/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: ProviderSectionPage,
});
