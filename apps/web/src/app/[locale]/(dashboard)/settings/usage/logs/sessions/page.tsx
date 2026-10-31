import { getTranslations } from "@/i18n/server";
import type { Metadata } from "@/lib/seo/metadataTypes";
import { UsageLogsRoutePage } from "../page";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("sessionLogs") };
}

export default function SessionsPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
	return <UsageLogsRoutePage view="sessions" searchParams={props.searchParams} />;
}
