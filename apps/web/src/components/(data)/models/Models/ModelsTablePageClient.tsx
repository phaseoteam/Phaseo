"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import {
	fetchModelsTableData,
	fetchModelsTableDataV2,
} from "@/lib/query/modelsTable";
import { useRefetchOnResume } from "@/lib/query/refetchOnResume";
import { ModelsTablePageSkeleton } from "@/components/(data)/models/Models/ModelsTablePageSkeleton";
import { WEB_QUERY_POLICIES } from "@/lib/query/policies";
import {
	ANONYMOUS_ACCOUNT_QUERY_SCOPE,
	hasAuthenticatedAccountQueryScope,
	webQueryKeys,
	type AccountQueryScope,
} from "@/lib/query/queryKeys";

const ModelsTableDisplay = dynamic(() => import("./ModelsTableDisplay"), {
	loading: () => <ModelsTablePageSkeleton />,
});

type ModelsTablePageClientProps = {
	catalogueVersion?: "v1" | "v2";
	accountQueryScope?: AccountQueryScope | null;
};

export default function ModelsTablePageClient({
	catalogueVersion = "v1",
	accountQueryScope = ANONYMOUS_ACCOUNT_QUERY_SCOPE,
}: ModelsTablePageClientProps) {
	const scope = accountQueryScope ?? ANONYMOUS_ACCOUNT_QUERY_SCOPE;
	const path =
		catalogueVersion === "v2"
			? "/api/_web/models?limit=10000&offset=0&shape=table&projection=2&catalogue_version=v2"
			: "/api/_web/models?limit=10000&offset=0&shape=table&projection=2";
	const query = useQuery({
		queryKey: webQueryKeys.account.catalogue({
			scope,
			catalogueVersion,
			previewCacheScope: "table",
		}),
		queryFn: ({ signal }) =>
			catalogueVersion === "v2"
				? fetchModelsTableDataV2(path, {
						signal,
						accountQueryScope: scope,
					})
				: fetchModelsTableData(path, {
						signal,
						accountQueryScope: scope,
					}),
		...(hasAuthenticatedAccountQueryScope(scope) ? WEB_QUERY_POLICIES.private : WEB_QUERY_POLICIES.public),
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
	});
	useRefetchOnResume(query.refetch, query.isStale, query.error);
	useEffect(() => {
		void import("./ModelsTableDisplay");
	}, []);

	if (query.error && !query.data) throw query.error;
	if (!query.data) return <ModelsTablePageSkeleton />;

	return (
		<ModelsTableDisplay
			initialModelData={query.data.models}
			allEndpoints={query.data.allEndpoints}
			allModalities={query.data.allModalities}
			allFeatures={query.data.allFeatures}
			allStatuses={query.data.allStatuses}
		/>
	);
}
