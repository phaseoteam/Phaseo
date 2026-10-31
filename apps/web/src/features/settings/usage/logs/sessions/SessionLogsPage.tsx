import { getTranslations } from "@/i18n/server";
import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { UsageLogsRoutePage } from "../UsageLogsContent";

export async function getSessionLogsMetadata(): Promise<PageMetadata> {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("sessionLogs") };
}

export default function SessionLogsPage() {
	return <UsageLogsRoutePage view="sessions" />;
}
