// Next: src/app/[locale]/(dashboard)/api-providers/[apiProvider]/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { metadataInput, runGenerateMetadata, type MetadataInput } from "@/lib/start/nextPage";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { nextPageComponent } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/(dashboard)/api-providers/[apiProvider]/page";
import NotFound from "@/app/[locale]/(dashboard)/api-providers/[apiProvider]/not-found";
import { apiProviderModelsQuery, apiProviderPageDataQuery } from "@/app/[locale]/(dashboard)/api-providers/[apiProvider]/page.functions";
import { notFound } from "next/navigation";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: MetadataInput) => input)
	.handler(({ data }) => runGenerateMetadata((mod as { generateMetadata?: Parameters<typeof runGenerateMetadata>[0] }).generateMetadata, metadataInput(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/api-providers/$apiProvider/")({
	loader: async ({ params, location, context }) => {
		const metadataPromise = routeMetadata({ data: { params, search: location.search as Record<string, unknown> } });
		metadataPromise.catch(() => undefined);
		void context.queryClient.prefetchQuery(apiProviderModelsQuery(params.apiProvider));
		const pageData = await context.queryClient.ensureQueryData(apiProviderPageDataQuery(params.apiProvider));
		if (!pageData.publicHeader && !pageData.initialProviderPreviews[0]) notFound();
		return { metadata: await metadataPromise };
	},
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	notFoundComponent: NotFound,
	component: nextPageComponent(Page),
});
