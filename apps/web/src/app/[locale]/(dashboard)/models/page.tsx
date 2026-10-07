import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { defaultShouldDehydrateQuery, dehydrate, HydrationBoundary } from "@tanstack/react-query";
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
import { withServerDeadline } from "@/lib/query/serverDeadline";

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
	// Resolve identity before sending account-scoped data; never fall back to
	// an anonymous scope on an authentication failure.
	const [catalogueVersion, accountContext] = await withServerDeadline((signal) => Promise.all([
		resolveModelsCatalogueVersion(),
		getServerAccountContext({ signal }),
	]));
	const accountQueryScope = toAccountQueryScope(accountContext);
	const cataloguePath = `${catalogueVersion === "v2" ? publicQueryPaths.modelsV2 : publicQueryPaths.models}&include_metrics=false` as `/api/_web/${string}`;
	// Stream the pending query instead of holding route navigation until it
	// completes. An existing browser query remains usable during that request.
	void queryClient.prefetchQuery({
		retry: false,
		queryKey: webQueryKeys.account.catalogue({ scope: accountQueryScope, catalogueVersion, previewCacheScope: "public" }),
		queryFn: ({ signal: querySignal }) => withServerDeadline(async (deadlineSignal) => {
			const signal = AbortSignal.any([querySignal, deadlineSignal]);
			const initialProviderPreviews = await fetchServerProviderCatalogPreviews(undefined, {
				signal, accessToken: accountContext.accessToken,
			});
			const options = {
				signal,
				accountQueryScope,
				accessToken: accountContext.accessToken,
				fetchProviderPreviews: false,
			};
			return catalogueVersion === "v2"
				? fetchModelsPageDataV2(cataloguePath, initialProviderPreviews, options)
				: fetchModelsPageData(cataloguePath, initialProviderPreviews, options);
		}),
	});
	return (
		<HydrationBoundary state={dehydrate(queryClient, {
			shouldDehydrateQuery: (query) => defaultShouldDehydrateQuery(query) || query.state.status === "pending",
			shouldRedactErrors: () => false,
		})}>
			<ModelsPageClient
				title={title}
				catalogueVersion={catalogueVersion}
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
