// Next: src/app/[locale]/(dashboard)/models/[organisationId]/[modelId]/page.tsx
import { createFileRoute, notFound as routeNotFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type { FetchQueryOptions, QueryClient } from "@tanstack/react-query";
import { metadataInput, runGenerateMetadata, type MetadataInput } from "@/lib/start/nextPage";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import { nextPageComponent, withLoading } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/(dashboard)/models/[organisationId]/[modelId]/page";
import Loading from "@/app/[locale]/(dashboard)/models/[organisationId]/[modelId]/loading";
import { modelPageBodyQueries, modelPageQuery } from "@/app/[locale]/(dashboard)/models/[organisationId]/[modelId]/page.queries";
import { permanentRedirect } from "next/navigation";
import { getModelIdFromParams } from "@/components/(data)/model/model-route-helpers";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: MetadataInput) => input)
	.handler(({ data }) => runGenerateMetadata((mod as { generateMetadata?: Parameters<typeof runGenerateMetadata>[0] }).generateMetadata, metadataInput(data)));

// The body queries have different data types; prefetch each without unifying them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function prefetchAll(queryClient: QueryClient, queries: readonly FetchQueryOptions<any, any, any, any>[]) {
	for (const query of queries) void queryClient.prefetchQuery(query);
}

export const Route = createFileRoute("/{-$locale}/_dashboard/models/$organisationId/$modelId/")({
	loader: async ({ params, location, context }) => {
		const metadataPromise = routeMetadata({ data: { params, search: location.search as Record<string, unknown> } });
		// Start the section requests alongside route resolution (as the Next page did);
		// the body reads them with useSuspenseQueries and they stream when ready.
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
	component: withLoading(nextPageComponent(Page), Loading),
});
