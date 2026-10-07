"use client";

import { useTranslations } from "next-intl";
import { Suspense, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import {
	fetchModelsPageData,
	fetchModelsPageDataV2,
} from "@/lib/query/models";
import { useRefetchOnResume } from "@/lib/query/refetchOnResume";
import { ModelsPageSkeleton } from "./ModelsPageSkeleton";
import type { AuthenticatedProviderCatalogPreview } from "@/lib/query/providerCatalogPreviews";
import { WEB_QUERY_POLICIES } from "@/lib/query/policies";
import { fetchModelWeeklyMetrics, fetchFreeRouterUsage, withModelsUsage } from "@/lib/query/modelsUsage";
import {
	ANONYMOUS_ACCOUNT_QUERY_SCOPE,
	hasAuthenticatedAccountQueryScope,
	webQueryKeys,
	type AccountQueryScope,
} from "@/lib/query/queryKeys";

const ModelsDisplay = dynamic(() => import("./ModelsDisplay"), {
	loading: function Loading() { const t = useTranslations("Catalogue.models"); return <ModelsPageSkeleton title={t("title")} />; },
});

type ModelsPageClientProps = {
	catalogueVersion?: "v1" | "v2";
	title: string;
	initialProviderPreviews?: AuthenticatedProviderCatalogPreview[];
	previewCacheScope?: string;
	accountQueryScope?: AccountQueryScope | null;
};

export default function ModelsPageClient(props: ModelsPageClientProps) {
	useEffect(() => { void import("./ModelsDisplay"); }, []);
	return <Suspense fallback={<ModelsPageSkeleton title={props.title} />}>
		<ModelsPageDataClient {...props} />
	</Suspense>;
}

function ModelsPageDataClient({
	catalogueVersion = "v1",
	title,
	initialProviderPreviews,
	previewCacheScope = "public",
	accountQueryScope = ANONYMOUS_ACCOUNT_QUERY_SCOPE,
}: ModelsPageClientProps) {
	const scope = accountQueryScope ?? ANONYMOUS_ACCOUNT_QUERY_SCOPE;
	const path =
		catalogueVersion === "v2"
			? "/api/_web/models?limit=2000&offset=0&shape=page&projection=6&catalogue_version=v2&include_metrics=false"
			: "/api/_web/models?limit=2000&offset=0&shape=page&projection=5&include_metrics=false";
	const query = useSuspenseQuery({
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
	const metrics = useQuery({
		queryKey: webQueryKeys.public.modelsWeeklyMetrics(),
		queryFn: ({ signal }) => fetchModelWeeklyMetrics(signal),
		enabled: Boolean(query.data),
		...WEB_QUERY_POLICIES.publicNoPolling,
	});
	const freeRouter = useQuery({
		queryKey: webQueryKeys.public.freeRouterUsage(),
		queryFn: ({ signal }) => fetchFreeRouterUsage(signal),
		enabled: Boolean(query.data?.models.some((model) => model.model_id === "phaseo/free")),
		...WEB_QUERY_POLICIES.publicNoPolling,
	});
	const displayData = useMemo(() => query.data
		? withModelsUsage(query.data, metrics.data, freeRouter.data)
		: undefined, [query.data, metrics.data, freeRouter.data]);
	useRefetchOnResume(query.refetch, query.isStale, query.error);

	if (query.error && !query.data) throw query.error;
	if (!displayData) return <ModelsPageSkeleton title={title} />;

	return <ModelsDisplay modelsPageData={displayData} />;
}
