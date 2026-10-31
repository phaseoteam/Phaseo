import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import ClassifierPage, { getClassifierMetadata } from "@/features/settings/classifiers/classifierId/ClassifierPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getClassifierMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/classifiers/$classifierId/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: ClassifierPage,
});
