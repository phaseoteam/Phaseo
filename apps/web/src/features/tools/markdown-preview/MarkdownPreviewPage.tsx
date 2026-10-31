import { useTranslations } from "@/i18n/react";
import { PageMetadata } from "@/lib/seo/metadataTypes";
import { buildMetadata } from "@/lib/seo";
import MarkdownPreviewer from "@/components/(tools)/MarkdownPreviewer";
import { getTranslations } from "@/i18n/server";

export async function getMarkdownPreviewMetadata(): Promise<PageMetadata> {
	const t = await getTranslations("Product.tools.markdown");
	return buildMetadata({
		title: t("title"),
		description: t("description"),
		path: "/tools/markdown-preview",
	});
}

export function MarkdownPreviewPage() {
	useTranslations("Product.tools.markdown");
	return <MarkdownPreviewer />;
}
