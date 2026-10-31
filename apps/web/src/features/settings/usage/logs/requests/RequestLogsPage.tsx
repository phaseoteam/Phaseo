import { getTranslations } from "@/i18n/server";
import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { UsageLogsRoutePage } from "../UsageLogsContent";

export async function getRequestLogsMetadata(): Promise<PageMetadata> {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("requestLogs") };
}

export default function RequestLogsPage() {
	return <UsageLogsRoutePage view="logs" />;
}
