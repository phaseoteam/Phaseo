import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { routeMetadataInput, toSerializableMetadata, type RouteMetadataInput } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { notFound } from "@/lib/navigation";
import { getLearnPath } from "@/lib/content/learn";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import { LearnPathPage, getLearnPathMetadata } from "@/features/learn/LearnPathPage";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: RouteMetadataInput) => input)
	.handler(async ({ data }) => toSerializableMetadata(getLearnPathMetadata(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/learn/paths/$path/")({
	loader: ({ params, location }) => {
		if (!getLearnPath(params.path)) notFound();
		return metadataLoaderData(routeMetadata({ data: routeMetadataInput(params, location.search) }));
	},
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: LearnPathPage,
});
