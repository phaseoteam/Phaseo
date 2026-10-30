import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

import { ObservabilityPageContent } from "../page";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("observabilityTrends") };
}

type SearchParams = Record<string, string | string[] | undefined>;

export default function Page(props: { searchParams: Promise<SearchParams> }) {
	return (
		<ObservabilityPageContent
			searchParams={props.searchParams}
			initialTab="trends"
		/>
	);
}
