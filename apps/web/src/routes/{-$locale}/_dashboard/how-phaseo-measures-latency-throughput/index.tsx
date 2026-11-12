import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { routeMetadataInput, toSerializableMetadata, type RouteMetadataInput } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import { HowPhaseoMeasuresLatencyPage, getHowPhaseoMeasuresLatencyMetadata } from "@/features/how-phaseo-measures-latency-throughput/HowPhaseoMeasuresLatencyPage";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: RouteMetadataInput) => input)
	.handler(async ({ data }) => toSerializableMetadata(await getHowPhaseoMeasuresLatencyMetadata(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/how-phaseo-measures-latency-throughput/")({
	loader: ({ params, location }) => metadataLoaderData(routeMetadata({ data: routeMetadataInput(params, location.search) })),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: HowPhaseoMeasuresLatencyPage,
});
