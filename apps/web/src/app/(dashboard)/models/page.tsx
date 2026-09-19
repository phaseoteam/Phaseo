import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import ModelsPageClient from "@/components/(data)/models/Models/ModelsPageClient";
import { ModelsPageSkeleton } from "@/components/(data)/models/Models/ModelsPageSkeleton";
import { resolveModelsCatalogueVersion } from "@/lib/models/catalogueVersion";
import { buildMetadata } from "@/lib/seo";
import { fetchServerProviderCatalogPreviews } from "@/lib/fetchers/internal/fetchServerProviderCatalogPreviews";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { createWebQueryClient } from "@/lib/query/queryClient";
import {
	publicQueryPaths,
	toAccountQueryScope,
	webQueryKeys,
} from "@/lib/query/queryKeys";
import { fetchModelsPageData, fetchModelsPageDataV2 } from "@/lib/query/models";
import { createHash } from "node:crypto";

export const metadata: Metadata = buildMetadata({
	title: "Models",
	description:
		"Browse models with an active Phaseo Gateway route by default, then compare providers, modalities, benchmarks, and pricing.",
	path: "/models",
	keywords: [
		"AI models",
		"compare AI models",
		"AI model pricing",
		"AI benchmarks",
		"AI providers",
	],
});

async function ModelsPageContent() {
	await connection();
	const [catalogueVersion, initialProviderPreviews, accountContext] = await Promise.all([
		resolveModelsCatalogueVersion(),
		fetchServerProviderCatalogPreviews(),
		getServerAccountContext(),
	]);
	const accountQueryScope = toAccountQueryScope(accountContext);
	const previewCacheScope = initialProviderPreviews.length === 0
		? "public"
		: createHash("sha256").update(JSON.stringify(initialProviderPreviews.map((preview) => [preview.provider_slug, preview.model_id, preview.created_at]))).digest("hex").slice(0, 16);
	const queryClient = createWebQueryClient();
	const cataloguePath = catalogueVersion === "v2"
		? publicQueryPaths.modelsV2
		: publicQueryPaths.models;
	await queryClient.prefetchQuery({
		queryKey: webQueryKeys.account.catalogue({
			scope: accountQueryScope,
			catalogueVersion,
			previewCacheScope,
		}),
		queryFn: ({ signal }) =>
			catalogueVersion === "v2"
				? fetchModelsPageDataV2(cataloguePath, initialProviderPreviews, {
						signal,
						accountQueryScope,
						accessToken: accountContext.accessToken,
						fetchProviderPreviews: false,
					})
				: fetchModelsPageData(cataloguePath, initialProviderPreviews, {
						signal,
						accountQueryScope,
						accessToken: accountContext.accessToken,
						fetchProviderPreviews: false,
					}),
	}).catch(() => undefined);
	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<ModelsPageClient
				catalogueVersion={catalogueVersion}
				initialProviderPreviews={initialProviderPreviews}
				previewCacheScope={previewCacheScope}
				accountQueryScope={accountQueryScope}
			/>
		</HydrationBoundary>
	);
}

export default function ModelsPage() {
	return (
		<Suspense fallback={<ModelsPageSkeleton />}>
			<ModelsPageContent />
		</Suspense>
	);
}
