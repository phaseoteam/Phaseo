import type { Metadata } from "next";
import { Suspense } from "react";
import ProviderCompareDashboard from "@/components/(data)/api-providers/ProviderCompareDashboard";
import { fetchFrontendAPIProviders } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import type { APIProviderCard } from "@/lib/fetchers/api-providers/providerDataTypes";
import { getLocale, getTranslations } from "next-intl/server";
import { buildLocalizedPageMetadata } from "@/lib/auth/localized-metadata";

export async function generateMetadata(): Promise<Metadata> {
	const locale = await getLocale();
	const t = await getTranslations("Catalogue.providers");
	return buildLocalizedPageMetadata({
		locale: locale as never,
		pathname: "/api-providers/compare",
		title: t("compare"),
		description: t("compareProvidersDescription"),
		keywords: ["AI API providers", "gateway coverage", "provider comparison", "Phaseo"],
	});
}

async function ProviderCompareContent() {
	const providers = await fetchFrontendAPIProviders() as APIProviderCard[];
	return <ProviderCompareDashboard providers={providers} />;
}

export default function ProviderComparePage() {
	return <Suspense fallback={<div className="mx-auto w-full max-w-7xl px-4 py-10"><div className="h-9 w-64 animate-pulse rounded-md bg-muted/50" /><div className="mt-6 h-40 animate-pulse rounded-xl bg-muted/30" /></div>}><ProviderCompareContent /></Suspense>;
}
