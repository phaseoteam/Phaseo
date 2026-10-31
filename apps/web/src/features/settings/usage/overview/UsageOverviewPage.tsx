import { getTranslations } from "@/i18n/server";
import type { PageMetadata } from "@/lib/seo/metadataTypes";

import { ObservabilityPageContent } from "../ObservabilityPageContent";

export async function getUsageOverviewMetadata(): Promise<PageMetadata> {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("observabilityOverview") };
}

export default function UsageOverviewPage() {
	return (
		<ObservabilityPageContent
			initialTab="overview"
		/>
	);
}
