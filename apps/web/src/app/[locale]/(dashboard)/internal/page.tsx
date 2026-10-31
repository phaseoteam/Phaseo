import type { Metadata } from "@/lib/seo/metadataTypes";
import { useTranslations } from "@/i18n/react";
import { getTranslations } from "@/i18n/server";
import InternalToolsGrid from "@/components/internal/InternalToolsGrid";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Product.internalTools");
	return {
		title: t("homeTitle"),
		description: t("homeDescription"),
		robots: { index: false, follow: false },
	};
}

// The admin gate (requireInternalAdmin) runs in the route's beforeLoad.
export default function InternalPage() {
	const t = useTranslations("Product.internalTools");

	return (
		<main className="flex min-h-screen flex-col">
			<div className="container mx-auto px-4 py-8">
				<div className="mb-8">
					<h1 className="text-3xl font-bold mb-2">{t("homeTitle")}</h1>
					<p className="text-muted-foreground">
						{t("homeDescription")}
					</p>
				</div>
				<InternalToolsGrid />
			</div>
		</main>
	);
}
