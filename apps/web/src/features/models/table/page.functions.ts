import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

/** Catalogue version and the signed-in account scope (cookies) for the models table. */
export const getModelsTablePageData = createServerFn({ method: "GET" }).handler(async () => {
	const [{ resolveModelsCatalogueVersion }, { getServerAccountContext }, { toAccountQueryScope }] = await Promise.all([
		import("@/lib/models/catalogueVersion"),
		import("@/lib/fetchers/internal/serverAccountContext"),
		import("@/lib/query/queryKeys"),
	]);
	const [catalogueVersion, accountContext] = await Promise.all([
		resolveModelsCatalogueVersion(),
		getServerAccountContext(),
	]);
	return { catalogueVersion, accountQueryScope: toAccountQueryScope(accountContext) };
});

export const modelsTablePageDataQuery = () =>
	queryOptions({
		queryKey: ["models-table-page"],
		queryFn: () => getModelsTablePageData(),
	});
