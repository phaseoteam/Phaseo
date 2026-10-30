import type { Metadata } from "next";
import { Suspense } from "react";
import type { APIProviderCard } from "@/lib/fetchers/api-providers/providerDataTypes";
import { fetchFrontendAPIProviders } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import APIProvidersDisplay from "@/components/(data)/api-providers/APIProvidersDisplay";
import { Skeleton } from "@/components/ui/skeleton";
import { buildMetadata } from "@/lib/seo";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Catalogue.providers");
	return buildMetadata({
		title: t("browseProviders"),
		description: t("compareProvidersDescription"),
		path: "/api-providers/table",
	});
}

async function ProviderTable() {
	const providers = await fetchFrontendAPIProviders() as APIProviderCard[];
	return <APIProvidersDisplay providers={providers} />;
}

export default function Page() {
	return <main className="flex min-h-0 flex-1 flex-col"><Suspense fallback={<Skeleton className="m-6 h-[32rem] rounded-md" />}><ProviderTable /></Suspense></main>;
}
