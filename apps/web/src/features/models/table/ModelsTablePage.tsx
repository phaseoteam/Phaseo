import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { getTranslations } from "@/i18n/server";
import { useSuspenseQuery } from "@tanstack/react-query";
import ModelsTablePageClient from "@/components/(data)/models/Models/ModelsTablePageClient";
import { modelsTablePageDataQuery } from "./page.functions";

export async function getModelsTableMetadata(): Promise<PageMetadata> {
	const t = await getTranslations("Catalogue.models");
	return {
		title: t("tableTitle"),
		description: t("description"),
		robots: { index: false, follow: true },
	};
}

export default function ModelsTablePage() {
	const { data } = useSuspenseQuery(modelsTablePageDataQuery());
	return (
		<ModelsTablePageClient
			catalogueVersion={data.catalogueVersion}
			accountQueryScope={data.accountQueryScope}
		/>
	);
}
