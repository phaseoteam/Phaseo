import type { Metadata } from "@/lib/seo/metadataTypes";
import { Suspense } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useTranslations } from "@/i18n/react";
import { apiProvidersQuery } from "./page.queries";
import APIProvidersDisplay from "@/components/(data)/api-providers/APIProvidersDisplay";
import { APIProvidersPageSkeleton } from "@/components/(data)/api-providers/APIProvidersPageSkeleton";
import { getLocale, getTranslations } from "@/i18n/server";
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

function APIProvidersSection() {
	const { data: apiProviders } = useSuspenseQuery(apiProvidersQuery());

	return <APIProvidersDisplay providers={apiProviders} />;
}

export default function Page() {
	const t = useTranslations("Catalogue.providers");

	return (
		<main className="flex min-h-0 flex-1 flex-col">
			<Suspense fallback={<APIProvidersPageSkeleton title={t("title")} />}>
				<APIProvidersSection />
			</Suspense>
		</main>
	);
}
