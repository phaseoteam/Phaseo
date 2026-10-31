import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { getTranslations } from "@/i18n/server";

// The public app leaderboard and usage pages are not search landing pages.
// Curated integration discovery is handled by /works-with instead.
export async function getAppsLayoutMetadata(): Promise<PageMetadata> {
	const t = await getTranslations("Product.apps");
	return { title: t("title"), description: t("description"), robots: { index: false, follow: true } };
}
