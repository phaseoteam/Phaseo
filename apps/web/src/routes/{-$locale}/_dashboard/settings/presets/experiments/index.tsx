import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import PresetExperimentsPage, { getPresetExperimentsMetadata } from "@/features/settings/presets/experiments/PresetExperimentsPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getPresetExperimentsMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/presets/experiments/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: PresetExperimentsPage,
});
