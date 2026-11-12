import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { getTranslations } from "@/i18n/server";
import { buildMetadata } from "@/lib/seo";
import { ContactPage } from "@/features/contact/ContactPage";

export async function getSupportMetadata(): Promise<PageMetadata> {
	const t = await getTranslations("Site.contact");
	const support = await getTranslations("Site.supportPage");
	return buildMetadata({
	title: t("support"),
	description: support("description"),
	path: "/support",
	keywords: [
		"Phaseo support",
		"contact Phaseo",
		"AI gateway support",
		"AI model database help",
	],
});
}

/** The support page is the contact page under its own URL and metadata. */
export const SupportPage = ContactPage;
