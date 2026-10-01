"use client";

import { useQuery } from "@tanstack/react-query";
import type { AdminModelPreview } from "@/lib/models/adminModelPreview";
import { fetchInternalWebApi, WebApiError } from "@/lib/web-api/client";
import CatalogNotFoundState from "@/components/(data)/CatalogNotFoundState";
import { WEB_QUERY_POLICIES } from "@/lib/query/policies";
import {
	ANONYMOUS_ACCOUNT_QUERY_SCOPE,
	hasAuthenticatedAccountQueryScope,
	webQueryKeys,
	type AccountQueryScope,
} from "@/lib/query/queryKeys";


export default function AdminHiddenModelPreview({
	initial,
	accountQueryScope = ANONYMOUS_ACCOUNT_QUERY_SCOPE,
}: {
	initial: AdminModelPreview;
	accountQueryScope?: AccountQueryScope | null;
}) {
	const scope = accountQueryScope ?? ANONYMOUS_ACCOUNT_QUERY_SCOPE;
	const path = `/api/internal/model-preview/${encodeURIComponent(initial.modelId)}` as const;
	const { data } = useQuery<AdminModelPreview | null>({
		queryKey: webQueryKeys.account.adminModelPreview({
			scope,
			modelId: initial.modelId,
		}),
		queryFn: async ({ signal }) => {
			try {
				return await fetchInternalWebApi<AdminModelPreview>(path, null, { signal });
			} catch (error) {
				if (error instanceof WebApiError && [401, 403, 404].includes(error.status)) return null;
				throw error;
			}
		},
		...WEB_QUERY_POLICIES.private,
		enabled: hasAuthenticatedAccountQueryScope(scope),
		initialData: initial,
	});
	if (!hasAuthenticatedAccountQueryScope(scope) || !data) {
		return <CatalogNotFoundState resourceType="model" resourceId={initial.modelId} />;
	}
	const model = data;
	return (
		<div className="container mx-auto space-y-8 px-4 py-8">
			<div>
				<p className="text-sm text-muted-foreground">Admin preview · Hidden model</p>
				<h1 className="mt-2 text-3xl font-bold">{model.name}</h1>
				<p className="mt-2 font-mono text-sm text-muted-foreground">{model.modelId}</p>
				{model.status ? <p className="mt-2 text-sm">{model.status}</p> : null}
			</div>
			<section aria-labelledby="hidden-model-providers" className="space-y-3">
				<h2 id="hidden-model-providers" className="text-xl font-semibold">Providers ({model.providers.length})</h2>
				<div className="divide-y rounded-lg border">
					{model.providers.length ? model.providers.map((provider) => (
						<div key={provider.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
							<span>{provider.name}</span>
							<span className="font-mono text-muted-foreground">{provider.modelId} · {provider.status}</span>
						</div>
					)) : <p className="px-4 py-3 text-sm text-muted-foreground">No providers yet.</p>}
				</div>
			</section>
		</div>
	);
}
