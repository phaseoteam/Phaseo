import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { fetchFrontendAPIProviderModels } from "@/lib/fetchers/frontend/fetchPublicCatalog";

/** Public header plus the signed-in account's private catalogue previews (cookies). */
export const getApiProviderPageData = createServerFn({ method: "GET" })
	.validator((apiProvider: string) => apiProvider)
	.handler(async ({ data: apiProvider }) => {
		const [{ fetchFrontendAPIProviderHeader }, { fetchServerProviderCatalogPreviews }, { getServerAccountContext }, { toAccountQueryScope }] = await Promise.all([
			import("@/lib/fetchers/frontend/fetchPublicCatalog"),
			import("@/lib/fetchers/internal/fetchServerProviderCatalogPreviews"),
			import("@/lib/fetchers/internal/serverAccountContext"),
			import("@/lib/query/queryKeys"),
		]);
		const fetchProviderMeta = async (apiProviderId: string) => {
			try {
				return await fetchFrontendAPIProviderHeader(apiProviderId);
			} catch (error) {
				// eslint-disable-next-line no-console
				console.warn("[seo] failed to load api provider metadata", {
					apiProviderId,
					error,
				});
				return null;
			}
		};
		const [publicHeader, initialProviderPreviews, accountContext] = await Promise.all([
			fetchProviderMeta(apiProvider),
			fetchServerProviderCatalogPreviews(apiProvider),
			getServerAccountContext(),
		]);
		return { publicHeader, initialProviderPreviews, accountQueryScope: toAccountQueryScope(accountContext) };
	});

export const apiProviderPageDataQuery = (apiProvider: string) =>
	queryOptions({
		queryKey: ["api-provider-page", apiProvider],
		queryFn: () => getApiProviderPageData({ data: apiProvider }),
	});

export const apiProviderModelsQuery = (apiProvider: string) =>
	queryOptions({
		queryKey: ["public-catalog", "api-provider-models", apiProvider],
		queryFn: () => fetchFrontendAPIProviderModels(apiProvider).catch(() => []),
	});
