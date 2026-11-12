import { getTranslations } from "@/i18n/server";
import type { PageMetadata } from "@/lib/seo/metadataTypes";

import { ObservabilityPageContent } from "../ObservabilityPageContent";

export async function getUsageGuardrailsMetadata(): Promise<PageMetadata> {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("observabilityGuardrails") };
}

export default function UsageGuardrailsPage() {
	return (
		<ObservabilityPageContent
			initialTab="guardrails"
		/>
	);
}
