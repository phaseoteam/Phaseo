import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { getTranslations } from "@/i18n/server";
import CacheOpsClient from "./CacheOpsClient";

export async function getInternalCacheMetadata(): Promise<PageMetadata> {
	const t = await getTranslations("Product.internalTools");
	return {
		title: t("cacheControlCentreTitle"),
		description: t("cacheControlCentreDescription"),
		robots: {
			index: false,
			follow: false,
		},
	};
}

export default function InternalCacheOpsPage() {
	return <CacheOpsClient />;
}
