import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import ModelsPageClient from "@/components/(data)/models/Models/ModelsPageClient";
import { ModelsPageSkeleton } from "@/components/(data)/models/Models/ModelsPageSkeleton";
import { resolveModelsCatalogueVersion } from "@/lib/models/catalogueVersion";
import { getLocale, getTranslations } from "next-intl/server";
import { buildLocalizedPageMetadata } from "@/lib/auth/localized-metadata";
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
import { withServerDeadline } from "@/lib/query/serverDeadline";
import type { AuthenticatedProviderCatalogPreview } from "@/lib/query/providerCatalogPreviews";

export async function generateMetadata(): Promise<Metadata> {
	const locale = await getLocale();
	const t = await getTranslations("Catalogue.models");
	return buildLocalizedPageMetadata({
		locale: locale as never,
		pathname: "/models",
		title: t("title"),
		description: t("description"),
		keywords: ["AI models", "compare AI models", "AI model pricing", "AI benchmarks", "AI providers"],
	});
}

async function ModelsPageContent({ title }: { title: string }) {
	await connection();
	return loadModelsPageContent(title);
}

async function loadModelsPageContent(title: string) {
	const queryClient = createWebQueryClient();
	let accountContext: Awaited<ReturnType<typeof getServerAccountContext>> | undefined;
	let catalogueVersion: "v1" | "v2" = "v2";
	let initialProviderPreviews: AuthenticatedProviderCatalogPreview[] = [];
	let previewCacheScope = "public";
	try {
		await withServerDeadline(async (deadlineSignal) => {
			[catalogueVersion, accountContext] = await Promise.all([
				resolveModelsCatalogueVersion(),
				getServerAccountContext({ signal: deadlineSignal }),
			]);
			deadlineSignal.throwIfAborted();
			initialProviderPreviews = await fetchServerProviderCatalogPreviews(undefined, {
				signal: deadlineSignal,
				accessToken: accountContext.accessToken,
			});
			deadlineSignal.throwIfAborted();
			previewCacheScope = initialProviderPreviews.length === 0 ? "public"
				: createHash("sha256").update(JSON.stringify(initialProviderPreviews.map((preview) => [preview.provider_slug, preview.model_id, preview.created_at]))).digest("hex").slice(0, 16);
			const accountQueryScope = toAccountQueryScope(accountContext);
			const cataloguePath = catalogueVersion === "v2" ? publicQueryPaths.modelsV2 : publicQueryPaths.models;
			await queryClient.prefetchQuery({
				retry: false,
				queryKey: webQueryKeys.account.catalogue({ scope: accountQueryScope, catalogueVersion, previewCacheScope }),
				queryFn: ({ signal: querySignal }) => {
					const options = {
						signal: AbortSignal.any([querySignal, deadlineSignal]),
						accountQueryScope,
						accessToken: accountContext!.accessToken,
						fetchProviderPreviews: false,
					};
					return catalogueVersion === "v2"
						? fetchModelsPageDataV2(cataloguePath, initialProviderPreviews, options)
						: fetchModelsPageData(cataloguePath, initialProviderPreviews, options);
				},
			});
		});
	} catch (error) {
		// Never silently change an authenticated request to an anonymous scope.
		// Once its scope is known, the browser can recover an aborted prefetch.
		if (!accountContext || !(error instanceof DOMException && error.name === "TimeoutError")) throw error;
	}
	if (!accountContext) throw new Error("Account context was not loaded");
	const accountQueryScope = toAccountQueryScope(accountContext);
	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<ModelsPageClient
				title={title}
				catalogueVersion={catalogueVersion}
				initialProviderPreviews={initialProviderPreviews}
				previewCacheScope={previewCacheScope}
				accountQueryScope={accountQueryScope}
			/>
		</HydrationBoundary>
	);
}

export default async function ModelsPage() {
	const t = await getTranslations("Catalogue.models");
	return (
		<Suspense fallback={<ModelsPageSkeleton title={t("title")} />}>
			<ModelsPageContent title={t("title")} />
		</Suspense>
	);
}
