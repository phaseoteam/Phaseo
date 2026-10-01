import { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import ToolsGrid from "@/components/(tools)/ToolsGrid";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Product.tools");
	return buildMetadata({
		title: t("title"),
		description: t("description"),
		path: "/tools",
	});
}

export default function ToolsPage() {
	const t = useTranslations("Product.tools");
	return (
		<main className="flex min-h-screen flex-col">
			<div className="container mx-auto px-4 py-8">
				<div className="mb-8">
					<h1 className="text-3xl font-bold mb-2">{t("title")}</h1>
					<p className="text-muted-foreground">
						{t("description")}
					</p>
				</div>
				<ToolsGrid />
			</div>
		</main>
	);
}
