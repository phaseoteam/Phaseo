import { getTranslations } from "@/i18n/server";
import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { UsageLogsRoutePage } from "../UsageLogsContent";

export async function getUpstreamLogsMetadata(): Promise<PageMetadata> {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("upstreamRequests") };
}

export default function UpstreamLogsPage() {
	return <UsageLogsRoutePage view="upstream" />;
}
