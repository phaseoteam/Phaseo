import { getTranslations } from "@/i18n/server";
import type { PageMetadata } from "@/lib/seo/metadataTypes";

import { ObservabilityPageContent } from "../ObservabilityPageContent";

export async function getUsageTrendsMetadata(): Promise<PageMetadata> {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("observabilityTrends") };
}

export default function UsageTrendsPage() {
	return (
		<ObservabilityPageContent
			initialTab="trends"
		/>
	);
}
