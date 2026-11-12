import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { routeMetadataInput, toSerializableMetadata, type RouteMetadataInput } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import ApiProviderPage, { getApiProviderMetadata } from "@/features/api-providers/apiProvider/ApiProviderPage";
import ApiProviderNotFound from "@/features/api-providers/apiProvider/ApiProviderNotFound";
import { apiProviderModelsQuery, apiProviderPageDataQuery } from "@/features/api-providers/apiProvider/page.functions";
import { notFound } from "@/lib/navigation";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: RouteMetadataInput) => input)
	.handler(async ({ data }) => toSerializableMetadata(await getApiProviderMetadata(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/api-providers/$apiProvider/")({
	loader: async ({ params, location, context }) => {
		const metadataPromise = routeMetadata({ data: routeMetadataInput(params, location.search) });
		metadataPromise.catch(() => undefined);
		void context.queryClient.prefetchQuery(apiProviderModelsQuery(params.apiProvider));
		const pageData = await context.queryClient.ensureQueryData(apiProviderPageDataQuery(params.apiProvider));
		if (!pageData.publicHeader && !pageData.initialProviderPreviews[0]) notFound();
		return metadataLoaderData(metadataPromise);
	},
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	notFoundComponent: ApiProviderNotFound,
	component: ApiProviderPage,
});
