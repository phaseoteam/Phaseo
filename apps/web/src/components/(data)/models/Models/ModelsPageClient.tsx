"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import {
	fetchModelsPageData,
	fetchModelsPageDataV2,
} from "@/lib/query/models";
import { useRefetchOnResume } from "@/lib/query/refetchOnResume";
import { ModelsPageSkeleton } from "./ModelsPageSkeleton";
import type { AuthenticatedProviderCatalogPreview } from "@/lib/query/providerCatalogPreviews";
import { WEB_QUERY_POLICIES } from "@/lib/query/policies";
import {
	ANONYMOUS_ACCOUNT_QUERY_SCOPE,
	hasAuthenticatedAccountQueryScope,
	webQueryKeys,
	type AccountQueryScope,
} from "@/lib/query/queryKeys";

const ModelsDisplay = dynamic(() => import("./ModelsDisplay"), {
	loading: () => <ModelsPageSkeleton />,
});

type ModelsPageClientProps = {
	catalogueVersion?: "v1" | "v2";
	initialProviderPreviews?: AuthenticatedProviderCatalogPreview[];
	previewCacheScope?: string;
	accountQueryScope?: AccountQueryScope | null;
};

export default function ModelsPageClient({
	catalogueVersion = "v1",
	initialProviderPreviews,
	previewCacheScope = "public",
	accountQueryScope = ANONYMOUS_ACCOUNT_QUERY_SCOPE,
}: ModelsPageClientProps) {
	const scope = accountQueryScope ?? ANONYMOUS_ACCOUNT_QUERY_SCOPE;
	const path =
		catalogueVersion === "v2"
			? "/api/_web/models?limit=2000&offset=0&shape=page&projection=6&catalogue_version=v2"
			: "/api/_web/models?limit=2000&offset=0&shape=page&projection=5";
	const query = useQuery({
		queryKey: webQueryKeys.account.catalogue({
			scope,
			catalogueVersion,
			previewCacheScope,
		}),
		queryFn: ({ signal }) =>
			catalogueVersion === "v2"
				? fetchModelsPageDataV2(path, initialProviderPreviews, {
						signal,
						accountQueryScope: scope,
					})
				: fetchModelsPageData(path, initialProviderPreviews, {
						signal,
						accountQueryScope: scope,
					}),
		...(hasAuthenticatedAccountQueryScope(scope) ? WEB_QUERY_POLICIES.private : WEB_QUERY_POLICIES.public),
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
	});
	useRefetchOnResume(query.refetch, query.isStale, query.error);
	useEffect(() => {
		// Load the display code alongside the catalogue request, not after it.
		void import("./ModelsDisplay");
	}, []);

	if (query.error && !query.data) throw query.error;
	if (!query.data) return <ModelsPageSkeleton />;

	return <ModelsDisplay modelsPageData={query.data} />;
}
