// Server-only work for the models list: account identity (never sent to the
// browser beyond its query scope) and the account-scoped catalogue fetch.
import { createServerFn } from "@tanstack/react-start";
import type { AccountQueryScope } from "@/lib/query/queryKeys";

export type ModelsListContext = {
	catalogueVersion: "v1" | "v2";
	accountQueryScope: AccountQueryScope;
};

export const getModelsListContext = createServerFn({ method: "GET" }).handler(async (): Promise<ModelsListContext> => {
	const [{ resolveModelsCatalogueVersion }, { getServerAccountContext }, { toAccountQueryScope }, { withServerDeadline }] = await Promise.all([
		import("@/lib/models/catalogueVersion"),
		import("@/lib/fetchers/internal/serverAccountContext"),
		import("@/lib/query/queryKeys"),
		import("@/lib/query/serverDeadline"),
	]);
	// Resolve identity before sending account-scoped data; never fall back to
	// an anonymous scope on an authentication failure.
	const [catalogueVersion, accountContext] = await withServerDeadline((signal) => Promise.all([
		resolveModelsCatalogueVersion(),
		getServerAccountContext({ signal }),
	]));
	return { catalogueVersion, accountQueryScope: toAccountQueryScope(accountContext) };
});

export const fetchModelsListCatalogue = createServerFn({ method: "GET", strict: { output: false } })
	.validator((input: { catalogueVersion: "v1" | "v2" }) => input)
	.handler(async ({ data: { catalogueVersion } }) => {
		const [
			{ getServerAccountContext },
			{ toAccountQueryScope, publicQueryPaths },
			{ withServerDeadline },
			{ fetchServerProviderCatalogPreviews },
			{ fetchModelsPageData, fetchModelsPageDataV2 },
			{ compactModelsPageData },
		] = await Promise.all([
			import("@/lib/fetchers/internal/serverAccountContext"),
			import("@/lib/query/queryKeys"),
			import("@/lib/query/serverDeadline"),
			import("@/lib/fetchers/internal/fetchServerProviderCatalogPreviews"),
			import("@/lib/query/models"),
			import("@/lib/query/modelsPageCompaction"),
		]);
		return withServerDeadline(async (signal) => {
			const accountContext = await getServerAccountContext({ signal });
			const accountQueryScope = toAccountQueryScope(accountContext);
			const cataloguePath = `${catalogueVersion === "v2" ? publicQueryPaths.modelsV2 : publicQueryPaths.models}&include_metrics=false` as `/api/_web/${string}`;
			const initialProviderPreviews = await fetchServerProviderCatalogPreviews(undefined, {
				signal, accessToken: accountContext.accessToken,
			});
			const options = {
				signal,
				accountQueryScope,
				accessToken: accountContext.accessToken,
				fetchProviderPreviews: false,
			};
			return compactModelsPageData(await (catalogueVersion === "v2"
				? fetchModelsPageDataV2(cataloguePath, initialProviderPreviews, options)
				: fetchModelsPageData(cataloguePath, initialProviderPreviews, options)));
		});
	});
