import { useTranslations } from "@/i18n/react";
import { Metadata } from "@/lib/seo/metadataTypes";
import { buildMetadata } from "@/lib/seo";
import JsonFormatter from "@/components/(tools)/JsonFormatter";
import { getTranslations } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Product.tools.json");
	return buildMetadata({
		title: t("title"),
		description: t("description"),
		path: "/tools/json-formatter",
	});
}

export default function JsonFormatterPage() {
	useTranslations("Product.tools.json");
	return <JsonFormatter />;
}
