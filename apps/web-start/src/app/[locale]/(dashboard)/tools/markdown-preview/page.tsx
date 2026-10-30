import { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import MarkdownPreviewer from "@/components/(tools)/MarkdownPreviewer";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Product.tools.markdown");
	return buildMetadata({
		title: t("title"),
		description: t("description"),
		path: "/tools/markdown-preview",
	});
}

export default async function MarkdownPreviewPage() {
	await getTranslations("Product.tools.markdown");
	return <MarkdownPreviewer />;
}
