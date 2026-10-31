import { getTranslations } from "@/i18n/server";
import { Suspense } from "react";
import { useParams } from "@tanstack/react-router";
import type { PageMetadata } from "@/lib/seo/metadataTypes";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { UsageLogsContent } from "../../UsageLogsContent";

export async function getRequestLogMetadata(): Promise<PageMetadata> {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("requestLog") };
}

export default function RequestLogPage() {
	const { requestId } = useParams({ from: "/{-$locale}/_dashboard/settings/usage/logs/requests/$requestId/" });
	return <Suspense fallback={<SettingsSectionFallback />}><UsageLogsContent selectedRequestId={decodeURIComponent(requestId)} selectedView="logs" /></Suspense>;
}
