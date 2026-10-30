// Next: src/app/[locale]/(dashboard)/models/[organisationId]/[modelId]/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { metadataInput, runGenerateMetadata, type MetadataInput } from "@/lib/start/nextPage";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { nextPageComponent, withLoading } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/(dashboard)/models/[organisationId]/[modelId]/page";
import Loading from "@/app/[locale]/(dashboard)/models/[organisationId]/[modelId]/loading";
import { modelPageBodyQueries, modelPageQuery } from "@/app/[locale]/(dashboard)/models/[organisationId]/[modelId]/page.queries";
import { notFound, permanentRedirect } from "next/navigation";
import { getModelIdFromParams } from "@/components/(data)/model/model-route-helpers";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: MetadataInput) => input)
	.handler(({ data }) => runGenerateMetadata((mod as { generateMetadata?: Parameters<typeof runGenerateMetadata>[0] }).generateMetadata, metadataInput(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/models/$organisationId/$modelId/")({
	loader: async ({ params, location, context }) => {
		const metadataPromise = routeMetadata({ data: { params, search: location.search as Record<string, unknown> } });
		// Start the section requests alongside route resolution (as the Next page did);
		// the body reads them with useSuspenseQueries and they stream when ready.
		const requestedModelId = getModelIdFromParams(params);
		for (const query of modelPageBodyQueries(requestedModelId, false)) void context.queryClient.prefetchQuery(query);
		const resolution = await context.queryClient.ensureQueryData(modelPageQuery({ organisationId: params.organisationId, modelId: params.modelId }));
		// Canonical-id redirects and unknown models are decided before rendering.
		if (resolution.kind === "redirect") permanentRedirect(resolution.to);
		if (resolution.kind === "not-found") notFound();
		if (resolution.kind === "model" && (resolution.includeHidden || resolution.modelId !== requestedModelId)) {
			for (const query of modelPageBodyQueries(resolution.modelId, resolution.includeHidden)) void context.queryClient.prefetchQuery(query);
		}
		return { metadata: await metadataPromise };
	},
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: withLoading(nextPageComponent(Page), Loading),
});
