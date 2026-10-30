import { getTranslations } from "next-intl/server";
import { Suspense, use } from "react";
import type { Metadata } from "next";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { UsageLogsContent } from "../../page";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("requestLog") };
}

export default function RequestLogPage(props: {
	params: Promise<{ requestId: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const { requestId } = use(props.params);
	return <Suspense fallback={<SettingsSectionFallback />}><UsageLogsContent searchParams={props.searchParams} selectedRequestId={decodeURIComponent(requestId)} selectedView="logs" /></Suspense>;
}
