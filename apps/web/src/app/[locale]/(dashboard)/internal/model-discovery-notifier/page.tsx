import type { Metadata } from "@/lib/seo/metadataTypes";
import { getTranslations } from "@/i18n/server";
import NotifierClient from "./NotifierClient";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("SettingsUI.internalTools");
	return {
		title: t("modelDiscoveryNotifierTitle"),
		description: t("modelDiscoveryNotifierDescription"),
		robots: { index: false, follow: false },
	};
}

// The admin gate (requireInternalAdmin) runs in the route's beforeLoad.
export default function InternalModelDiscoveryNotifierPage() {
	return <NotifierClient />;
}
