import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { routeMetadataInput, toSerializableMetadata, type RouteMetadataInput } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import { HowPhaseoNormalisesBenchmarksPage, getHowPhaseoNormalisesBenchmarksMetadata } from "@/features/how-phaseo-normalises-ai-benchmarks/HowPhaseoNormalisesBenchmarksPage";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: RouteMetadataInput) => input)
	.handler(async ({ data }) => toSerializableMetadata(await getHowPhaseoNormalisesBenchmarksMetadata(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/how-phaseo-normalises-ai-benchmarks/")({
	loader: ({ params, location }) => metadataLoaderData(routeMetadata({ data: routeMetadataInput(params, location.search) })),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: HowPhaseoNormalisesBenchmarksPage,
});
