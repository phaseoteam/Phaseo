// The models list lives under a pathless `_list` group so model pages don't
// inherit its loading skeleton.
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import ModelsPage, { getModelsMetadata } from "@/features/models/ModelsPage";
import ModelsLoading from "@/features/models/ModelsLoading";
import { modelsListCatalogueQuery, modelsListContextQuery } from "@/features/models/page.queries";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getModelsMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/models/_list/")({
	loader: async ({ context }) => {
		const metadataPromise = routeMetadata();
		metadataPromise.catch(() => undefined);
		const listContext = await context.queryClient.ensureQueryData(modelsListContextQuery());
		// Stream the catalogue instead of holding navigation until it completes.
		void context.queryClient.prefetchQuery(modelsListCatalogueQuery(listContext.catalogueVersion, listContext.accountQueryScope));
		return metadataLoaderData(metadataPromise);
	},
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	pendingComponent: ModelsLoading,
	component: ModelsPage,
});
