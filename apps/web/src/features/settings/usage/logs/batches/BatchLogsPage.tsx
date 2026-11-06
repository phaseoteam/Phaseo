import { getTranslations } from "@/i18n/server";
import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { UsageLogsRoutePage } from "../UsageLogsContent";

export async function getBatchLogsMetadata(): Promise<PageMetadata> {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("batchLogs") };
}

export default function BatchLogsPage() {
	return <UsageLogsRoutePage view="jobs" jobKind="batch" />;
}
