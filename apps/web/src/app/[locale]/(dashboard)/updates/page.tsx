import type { Metadata } from "@/lib/seo/metadataTypes";
import { redirect } from "@/lib/navigation";
import { getTranslations } from "@/i18n/server";
import type { RuntimeLocale } from "@/i18n/locales";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata(props: {
	params: Promise<{ locale: RuntimeLocale }>;
}): Promise<Metadata> {
	const { locale } = await props.params;
	const t = await getTranslations({ locale, namespace: "Catalogue.updatesMetadata" });
	return buildMetadata({
		title: t("modelTitle"),
		description: t("modelDescription"),
		path: "/updates",
		keywords: ["AI updates", "AI news", "model releases", "AI research", "Phaseo"],
	});
}

export default function Page() {
	redirect("/updates/models");
}
