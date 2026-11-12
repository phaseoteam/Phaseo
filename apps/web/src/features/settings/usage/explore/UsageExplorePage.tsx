import { getTranslations } from "@/i18n/server";
import type { PageMetadata } from "@/lib/seo/metadataTypes";

import { ObservabilityPageContent } from "../ObservabilityPageContent";

export async function getUsageExploreMetadata(): Promise<PageMetadata> {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("observabilityExplore") };
}

export default function UsageExplorePage() {
	return (
		<ObservabilityPageContent
			initialTab="explore"
		/>
	);
}
