// Next: src/app/[locale]/(dashboard)/models/(list)/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { metadataInput, runGenerateMetadata, type MetadataInput } from "@/lib/start/nextPage";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import { nextPageComponent, withLoading } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/(dashboard)/models/(list)/page";
import Loading from "@/app/[locale]/(dashboard)/models/(list)/loading";
import { modelsListCatalogueQuery, modelsListContextQuery } from "@/app/[locale]/(dashboard)/models/(list)/page.queries";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: MetadataInput) => input)
	.handler(({ data }) => runGenerateMetadata((mod as { generateMetadata?: Parameters<typeof runGenerateMetadata>[0] }).generateMetadata, metadataInput(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/models/_list/")({
	loader: async ({ context, params, location }) => {
		const metadataPromise = routeMetadata({ data: { params, search: location.search as Record<string, unknown> } });
		metadataPromise.catch(() => undefined);
		const listContext = await context.queryClient.ensureQueryData(modelsListContextQuery());
		// Stream the catalogue instead of holding navigation until it completes.
		void context.queryClient.prefetchQuery(modelsListCatalogueQuery(listContext.catalogueVersion, listContext.accountQueryScope));
		return metadataLoaderData(metadataPromise);
	},
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: withLoading(nextPageComponent(Page), Loading),
});
