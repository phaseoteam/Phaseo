import type { Metadata } from "next";
import { Suspense } from "react";
import type { APIProviderCard } from "@/lib/fetchers/api-providers/providerDataTypes";
import { fetchFrontendAPIProviders } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import APIProvidersDisplay from "@/components/(data)/api-providers/APIProvidersDisplay";
import { APIProvidersPageSkeleton } from "@/components/(data)/api-providers/APIProvidersPageSkeleton";
import { getLocale, getTranslations } from "next-intl/server";
import { buildLocalizedPageMetadata } from "@/lib/auth/localized-metadata";

export async function generateMetadata(): Promise<Metadata> {
	const locale = await getLocale();
	const t = await getTranslations("Catalogue.providers");
	return buildLocalizedPageMetadata({
		locale: locale as never,
		pathname: "/api-providers",
		title: t("title"),
		description: t("description"),
		keywords: ["AI API providers", "AI provider pricing", "LLM API providers", "BYOK AI providers"],
	});
}

async function APIProvidersSection() {
	const apiProviders =
		(await fetchFrontendAPIProviders()) as APIProviderCard[];

	return <APIProvidersDisplay providers={apiProviders} />;
}

export default async function Page() {
	const t = await getTranslations("Catalogue.providers");

	return (
		<main className="flex min-h-0 flex-1 flex-col">
			<Suspense fallback={<APIProvidersPageSkeleton title={t("title")} />}>
				<APIProvidersSection />
			</Suspense>
		</main>
	);
}
