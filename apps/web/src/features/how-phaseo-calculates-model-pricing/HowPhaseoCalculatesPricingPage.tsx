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
	"how-phaseo-calculates-model-pricing"
] as MethodologyEntry;

export async function getHowPhaseoCalculatesPricingMetadata({ params }: RouteMetadataInput): Promise<PageMetadata> {
	const { locale } = params as { locale: PublicLocale };
	const t = await getTranslations({ locale: locale as PublicLocale, namespace: "Site.methodology" });
	const key = `entries.${entry.slug}` as const;
	const translate = t as unknown as (name: string) => string;
	return buildMetadata({ title: translate(`${key}.title`), description: translate(`${key}.description`), path: entry.path, keywords: entry.keywords });
}

export function HowPhaseoCalculatesPricingPage() {
	return <MethodologyArticlePage entry={entry} />;
}
