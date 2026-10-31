import { createFileRoute, notFound as routeNotFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type { FetchQueryOptions, QueryClient } from "@tanstack/react-query";
import { routeMetadataInput, toSerializableMetadata, type RouteMetadataInput } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import ModelPage, { getModelMetadata } from "@/features/models/organisationId/modelId/ModelPage";
import ModelLoading from "@/features/models/organisationId/modelId/ModelLoading";
import { modelPageBodyQueries, modelPageQuery } from "@/features/models/organisationId/modelId/page.queries";
import { permanentRedirect } from "@/lib/navigation";
import { getModelIdFromParams } from "@/components/(data)/model/model-route-helpers";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: RouteMetadataInput) => input)
	.handler(async ({ data }) => toSerializableMetadata(await getModelMetadata(data)));

// The body queries have different data types; prefetch each without unifying them.
function prefetchAll(queryClient: QueryClient, queries: readonly FetchQueryOptions<any, any, any, any>[]) {
	for (const query of queries) void queryClient.prefetchQuery(query);
}

export const Route = createFileRoute("/{-$locale}/_dashboard/models/$organisationId/$modelId/")({
	loader: async ({ params, location, context }) => {
		const metadataPromise = routeMetadata({ data: routeMetadataInput(params, location.search) });
		// Start the section requests alongside route resolution; the body reads
		// them with useSuspenseQueries and they stream when ready.
		const requestedModelId = getModelIdFromParams(params);
		prefetchAll(context.queryClient, modelPageBodyQueries(requestedModelId, false));
		const resolution = await context.queryClient.ensureQueryData(modelPageQuery({ organisationId: params.organisationId, modelId: params.modelId }));
		// Canonical-id redirects and unknown models are decided before rendering.
		if (resolution.kind === "redirect") permanentRedirect(resolution.to);
		// Keep the page's "model unavailable" metadata on the 404 response.
		if (resolution.kind === "not-found") throw routeNotFound({ data: { metadata: await metadataPromise } });
		if (resolution.kind === "model" && (resolution.includeHidden || resolution.modelId !== requestedModelId)) {
			prefetchAll(context.queryClient, modelPageBodyQueries(resolution.modelId, resolution.includeHidden));
		}
		return metadataLoaderData(metadataPromise);
	},
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	pendingComponent: ModelLoading,
	component: ModelPage,
});
