// `/compare/<gateway>` is a gateway comparison; `/compare/<a>-vs-<b>` is a model pair.
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { routeMetadataInput, toSerializableMetadata, type RouteMetadataInput } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import CompareGatewayPage, { getCompareGatewayMetadata } from "@/features/compare/gateway/CompareGatewayPage";
import { parsePairSlug } from "@/components/(data)/compare/comparePairs";
import { comparePairDataQuery, comparePairExists } from "@/features/compare/gateway/pairPage.queries";
import { notFound } from "@/lib/navigation";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: RouteMetadataInput) => input)
	.handler(async ({ data }) => toSerializableMetadata(await getCompareGatewayMetadata(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/compare/$gateway/")({
	loader: async ({ params, location, context }) => {
		const metadataPromise = routeMetadata({ data: routeMetadataInput(params, location.search) });
		metadataPromise.catch(() => undefined);
		const pair = parsePairSlug(params.gateway);
		if (pair && !comparePairExists(pair, await context.queryClient.ensureQueryData(comparePairDataQuery(pair)))) notFound();
		return metadataLoaderData(metadataPromise);
	},
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: CompareGatewayPage,
});
