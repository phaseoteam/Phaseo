import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import ByokPage, { getByokMetadata } from "@/features/settings/byok/ByokPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getByokMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/byok/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: ByokPage,
});
