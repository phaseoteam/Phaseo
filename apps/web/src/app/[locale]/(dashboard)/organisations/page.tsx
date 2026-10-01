import type { Metadata } from "next";
import { Suspense } from "react";
import OrganisationsDisplay from "@/components/(data)/organisations/OrganisationDisplay";
import type { OrganisationCard } from "@/lib/fetchers/organisations/getAllOrganisations";
import { fetchFrontendOrganisations } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { Skeleton } from "@/components/ui/skeleton";
import { getLocale, getTranslations } from "next-intl/server";
import { buildLocalizedPageMetadata } from "@/lib/auth/localized-metadata";

export async function generateMetadata(): Promise<Metadata> {
	const locale = await getLocale();
	const t = await getTranslations("Catalogue.organisations");
	return buildLocalizedPageMetadata({
		locale: locale as never,
		pathname: "/organisations",
		title: t("title"),
		description: t("description"),
		keywords: [t("title"), t("keywordAiModels"), t("keywordAiGateway"), "Phaseo"],
	});
}

async function OrganisationsSection() {
	const organisations =
		(await fetchFrontendOrganisations()) as OrganisationCard[];
	return <OrganisationsDisplay organisations={organisations} />;
}

function OrganisationsFallback() {
	return (
		<div className="space-y-4">
			<Skeleton className="h-9 w-56" />
			<Skeleton className="h-11 w-full" />
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
				{Array.from({ length: 6 }).map((_, index) => (
					<Skeleton key={index} className="h-40 w-full rounded-xl" />
				))}
			</div>
		</div>
	);
}

export default function Page() {
	return (
		<main className="flex flex-col">
			<div className="container mx-auto px-4 py-8">
				<Suspense fallback={<OrganisationsFallback />}>
					<OrganisationsSection />
				</Suspense>
			</div>
		</main>
	);
}
