import { useTranslations } from "@/i18n/react";
import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { Suspense } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import ModelsPageClient from "@/components/(data)/models/Models/ModelsPageClient";
import { ModelsPageSkeleton } from "@/components/(data)/models/Models/ModelsPageSkeleton";
import { getLocale, getTranslations } from "@/i18n/server";
import { buildLocalizedPageMetadata } from "@/lib/auth/localized-metadata";
import { modelsListContextQuery } from "./page.queries";

export async function getModelsMetadata(): Promise<PageMetadata> {
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

function ModelsPageContent({ title }: { title: string }) {
	const { data: { catalogueVersion, accountQueryScope } } = useSuspenseQuery(modelsListContextQuery());
	return (
		<ModelsPageClient
			title={title}
			catalogueVersion={catalogueVersion}
			accountQueryScope={accountQueryScope}
		/>
	);
}

export default function ModelsPage() {
	const t = useTranslations("Catalogue.models");
	return (
		<Suspense fallback={<ModelsPageSkeleton title={t("title")} />}>
			<ModelsPageContent title={t("title")} />
		</Suspense>
	);
}
