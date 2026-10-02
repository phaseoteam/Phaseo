import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import CacheOpsClient from "./CacheOpsClient";

export async function generateMetadata(): Promise<Metadata> {
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
