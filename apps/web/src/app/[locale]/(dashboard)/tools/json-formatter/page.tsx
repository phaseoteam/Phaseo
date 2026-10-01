import { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import JsonFormatter from "@/components/(tools)/JsonFormatter";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Product.tools.json");
	return buildMetadata({
		title: t("title"),
		description: t("description"),
		path: "/tools/json-formatter",
	});
}

export default async function JsonFormatterPage() {
	await getTranslations("Product.tools.json");
	return <JsonFormatter />;
}
