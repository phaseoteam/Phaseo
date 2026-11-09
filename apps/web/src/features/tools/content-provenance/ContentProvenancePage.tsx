import { useTranslations } from "@/i18n/react";
import type { PageMetadata } from "@/lib/seo/metadataTypes";
import ContentProvenanceTool from "@/components/(tools)/ContentProvenanceTool";
import { ToolPageHeader } from "@/components/(tools)/ToolPageHeader";
import { buildMetadata } from "@/lib/seo";
import { getTranslations } from "@/i18n/server";

export async function getContentProvenanceMetadata(): Promise<PageMetadata> {
	const t = await getTranslations("Product.tools.provenance");
	return buildMetadata({
		title: t("checkFile"),
		description: t("description"),
		path: "/tools/content-provenance",
	});
}

export function ContentProvenancePage() {
	const t = useTranslations("Product.tools.provenance");
	return (
		<main className="min-h-screen">
			<div className="container mx-auto px-4 py-8 sm:py-12">
				<div className="mx-auto max-w-5xl">
					<ToolPageHeader title={t("checkFile")} description={t("description")} />
				</div>
				<ContentProvenanceTool />
			</div>
		</main>
	);
}
