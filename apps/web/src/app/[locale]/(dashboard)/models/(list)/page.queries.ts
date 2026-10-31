import { queryOptions } from "@tanstack/react-query";
import { webQueryKeys, type AccountQueryScope } from "@/lib/query/queryKeys";
import { fetchModelsListCatalogue, getModelsListContext } from "./page.functions";

export const modelsListContextQuery = () =>
	queryOptions({
		queryKey: ["models-list", "context"],
		queryFn: () => getModelsListContext(),
		retry: false,
	});

/** Same key ModelsPageClient reads, so the server-streamed result hydrates it. */
export const modelsListCatalogueQuery = (catalogueVersion: "v1" | "v2", scope: AccountQueryScope) =>
	queryOptions({
		queryKey: webQueryKeys.account.catalogue({ scope, catalogueVersion, previewCacheScope: "public" }),
		queryFn: () => fetchModelsListCatalogue({ data: { catalogueVersion } }),
		retry: false,
	});
