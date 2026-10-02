import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
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
