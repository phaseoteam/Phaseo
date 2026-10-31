import type { Metadata } from "@/lib/seo/metadataTypes";
import { getTranslations } from "@/i18n/server";
import { buildMetadata } from "@/lib/seo";
import ContactPage from "@/app/(dashboard)/contact/page";

export async function generateMetadata(): Promise<Metadata> {
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

export default ContactPage;
