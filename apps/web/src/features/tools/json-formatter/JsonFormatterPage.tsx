import { useTranslations } from "@/i18n/react";
import { PageMetadata } from "@/lib/seo/metadataTypes";
import { buildMetadata } from "@/lib/seo";
import JsonFormatter from "@/components/(tools)/JsonFormatter";
import { getTranslations } from "@/i18n/server";

export async function getJsonFormatterMetadata(): Promise<PageMetadata> {
	const t = await getTranslations("Product.tools.json");
	return buildMetadata({
		title: t("title"),
		description: t("description"),
		path: "/tools/json-formatter",
	});
}

export function JsonFormatterPage() {
	useTranslations("Product.tools.json");
	return <JsonFormatter />;
}
