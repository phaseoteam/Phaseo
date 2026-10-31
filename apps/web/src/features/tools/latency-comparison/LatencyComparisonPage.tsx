import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { getTranslations } from "@/i18n/server";
import LatencyComparisonClient from "./LatencyComparisonClient";

export async function getLatencyComparisonMetadata(): Promise<PageMetadata> {
	const t = await getTranslations("Product.latency");
	return { title: t("title"), description: t("description"), robots: { index: false, follow: false } };
}

// Signed-out → /sign-in and non-admin → / redirects run in the route's
// beforeLoad (page.functions.ts getLatencyComparisonAccess).
export function LatencyComparisonPage() {
	return <LatencyComparisonClient />;
}
