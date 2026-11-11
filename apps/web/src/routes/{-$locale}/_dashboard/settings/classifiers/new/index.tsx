import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import NewClassifierPage, { getNewClassifierMetadata } from "@/features/settings/classifiers/new/NewClassifierPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getNewClassifierMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/classifiers/new/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: NewClassifierPage,
});
