import type { PageMetadata } from "@/lib/seo/metadataTypes";
import type { RouteMetadataInput } from "@/lib/start/metadata";
import { MethodologyArticlePage } from "@/components/methodology/MethodologyArticlePage";
import {
	METHODOLOGY_ENTRY_BY_SLUG,
	type MethodologyEntry,
} from "@/lib/content/methodology";
import { buildMetadata } from "@/lib/seo";
import { getTranslations } from "@/i18n/server";
import type { PublicLocale } from "@/i18n/routing";

const entry = METHODOLOGY_ENTRY_BY_SLUG[
	"how-phaseo-normalises-ai-benchmarks"
] as MethodologyEntry;

export async function getHowPhaseoNormalisesBenchmarksMetadata({ params }: RouteMetadataInput): Promise<PageMetadata> {
	const { locale } = params as { locale: PublicLocale };
	const t = await getTranslations({ locale: locale as PublicLocale, namespace: "Site.methodology" });
	const translate = t as unknown as (name: string) => string;
	return buildMetadata({ title: translate(`entries.${entry.slug}.title`), description: translate(`entries.${entry.slug}.description`), path: entry.path, keywords: entry.keywords });
}

export function HowPhaseoNormalisesBenchmarksPage() {
	return <MethodologyArticlePage entry={entry} />;
}
