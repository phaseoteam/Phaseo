import type { QueryClient } from "@tanstack/react-query";
import type { AccountQueryScope } from "@/lib/query/queryKeys";
import { webQueryKeys } from "@/lib/query/queryKeys";

/** Successful private writes bypass freshness; inactive views refetch on return. */
export function invalidateAccountQueries(queryClient: QueryClient) {
	return queryClient.invalidateQueries({ queryKey: webQueryKeys.account.all() });
}

export function invalidatePublicSearch(queryClient: QueryClient) {
	return queryClient.invalidateQueries({
		queryKey: webQueryKeys.public.search(),
	});
}

export function invalidateModelCatalogue(
	queryClient: QueryClient,
	scope: AccountQueryScope,
) {
	return queryClient.invalidateQueries({
		queryKey: webQueryKeys.account.scope(scope),
	});
}

export function invalidateProviderCatalogPreviews(
	queryClient: QueryClient,
	scope: AccountQueryScope,
	providerSlug?: string,
) {
	return queryClient.invalidateQueries({
		queryKey: webQueryKeys.account.providerPreviews({ scope, providerSlug }),
	});
}

export function clearAccountQueryCache(queryClient: QueryClient) {
	return queryClient.removeQueries({
		queryKey: webQueryKeys.account.all(),
	});
}

export function clearAccountQueryScope(
	queryClient: QueryClient,
	scope: AccountQueryScope,
) {
	return queryClient.removeQueries({
		queryKey: webQueryKeys.account.scope(scope),
	});
}
