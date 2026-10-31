import { getTranslations } from "@/i18n/server";
import type { Metadata } from "@/lib/seo/metadataTypes";
import { UsageLogsRoutePage } from "../page";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("upstreamRequests") };
}

export default function UpstreamPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
	return <UsageLogsRoutePage view="upstream" searchParams={props.searchParams} />;
}
