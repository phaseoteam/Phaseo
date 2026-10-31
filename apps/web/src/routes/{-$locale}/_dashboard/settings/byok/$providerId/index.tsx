import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import ByokProviderPage, { getByokProviderMetadata } from "@/features/settings/byok/providerId/ByokProviderPage";
import ByokProviderLoading from "@/features/settings/byok/providerId/ByokProviderLoading";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getByokProviderMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/byok/$providerId/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: ByokProviderPage,
	pendingComponent: ByokProviderLoading,
});
