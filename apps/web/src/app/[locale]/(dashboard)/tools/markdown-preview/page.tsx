import { useTranslations } from "@/i18n/react";
import { Metadata } from "@/lib/seo/metadataTypes";
import { buildMetadata } from "@/lib/seo";
import MarkdownPreviewer from "@/components/(tools)/MarkdownPreviewer";
import { getTranslations } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Product.tools.markdown");
	return buildMetadata({
		title: t("title"),
		description: t("description"),
		path: "/tools/markdown-preview",
	});
}

export default function MarkdownPreviewPage() {
	useTranslations("Product.tools.markdown");
	return <MarkdownPreviewer />;
}
