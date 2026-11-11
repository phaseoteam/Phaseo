import { getTranslations } from "@/i18n/server";
import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { UsageLogsRoutePage } from "../UsageLogsContent";

export async function getVideoLogsMetadata(): Promise<PageMetadata> {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("videoLogs") };
}

export default function VideoLogsPage() {
	return <UsageLogsRoutePage view="jobs" jobKind="video" />;
}
