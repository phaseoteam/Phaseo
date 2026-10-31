import { getTranslations } from "@/i18n/server";
import type { Metadata } from "@/lib/seo/metadataTypes";

import { ObservabilityPageContent } from "../page";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("observabilityGuardrails") };
}

type SearchParams = Record<string, string | string[] | undefined>;

export default function Page(props: { searchParams: Promise<SearchParams> }) {
	return (
		<ObservabilityPageContent
			searchParams={props.searchParams}
			initialTab="guardrails"
		/>
	);
}
