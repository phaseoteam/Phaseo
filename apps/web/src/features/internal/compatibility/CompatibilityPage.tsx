import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { getTranslations } from "@/i18n/server";
import CompatibilityClient from "./CompatibilityClient";

export async function getCompatibilityMetadata(): Promise<PageMetadata> {
	const t = await getTranslations("Product.internalTools");
	return {
		title: t("gatewayCompatibilityTitle"),
		description: t("gatewayCompatibilityDescription"),
		robots: { index: false, follow: false },
	};
}

// The admin gate (requireInternalAdmin) runs in the route's beforeLoad.
export default function CompatibilityPage() {
	return <CompatibilityClient />;
}
