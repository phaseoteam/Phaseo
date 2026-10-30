import type { Metadata } from "next";
import ContentProvenanceTool from "@/components/(tools)/ContentProvenanceTool";
import { ToolPageHeader } from "@/components/(tools)/ToolPageHeader";
import { buildMetadata } from "@/lib/seo";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Product.tools.provenance");
	return buildMetadata({
		title: t("checkFile"),
		description: t("description"),
		path: "/tools/content-provenance",
	});
}

export default async function ContentProvenancePage() {
	const t = await getTranslations("Product.tools.provenance");
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
