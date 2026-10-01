import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import ModelsTablePageClient from "@/components/(data)/models/Models/ModelsTablePageClient";
import { resolveModelsCatalogueVersion } from "@/lib/models/catalogueVersion";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Catalogue.models");
	return {
		title: t("tableTitle"),
		description: t("description"),
		robots: { index: false, follow: true },
	};
}

export default async function ModelsTablePage() {
	return (
		<ModelsTablePageClient
			catalogueVersion={await resolveModelsCatalogueVersion()}
		/>
	);
}
