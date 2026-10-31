import { useTranslations, useLocale } from "@/i18n/react";
import type { Metadata } from "@/lib/seo/metadataTypes";
import { Suspense } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ScopedMessages } from "@/components/i18n/ScopedMessages";
import ModelsPageClient from "@/components/(data)/models/Models/ModelsPageClient";
import { ModelsPageSkeleton } from "@/components/(data)/models/Models/ModelsPageSkeleton";
import { getLocale, getTranslations } from "@/i18n/server";
import { buildLocalizedPageMetadata } from "@/lib/auth/localized-metadata";
import { modelsListContextQuery } from "./page.queries";

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
	const locale = useLocale();
	const t = useTranslations("Catalogue.models");
	// The list has its own message boundary. Model detail and table routes keep
	// the broader catalogue scope, which this page would otherwise inherit. The
	// action dock loads its provider catalogue messages separately.
	return (
		<ScopedMessages params={Promise.resolve({ locale })} namespaces={["Catalogue.common", "Catalogue.modelDetail.availabilityLabels", "Catalogue.modelDetail.metadata", "Catalogue.modelDetail.pricing.perMillionTokens", "Catalogue.modelDetail.providerTable", "Catalogue.models", "Common.ui.actions", "Common.ui.auditCopy"]}>
			<Suspense fallback={<ModelsPageSkeleton title={t("title")} />}>
				<ModelsPageContent title={t("title")} />
			</Suspense>
		</ScopedMessages>
	);
}
