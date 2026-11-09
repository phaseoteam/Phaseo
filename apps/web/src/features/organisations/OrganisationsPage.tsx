import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { Suspense } from "react";
import OrganisationsDisplay from "@/components/(data)/organisations/OrganisationDisplay";
import { useSuspenseQuery } from "@tanstack/react-query";
import { organisationsQuery } from "./page.queries";
import { Skeleton } from "@/components/ui/skeleton";
import { getLocale, getTranslations } from "@/i18n/server";
import { buildLocalizedPageMetadata } from "@/lib/auth/localized-metadata";

export async function getOrganisationsMetadata(): Promise<PageMetadata> {
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

function OrganisationsSection() {
	const { data: organisations } = useSuspenseQuery(organisationsQuery());
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

export default function OrganisationsPage() {
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
