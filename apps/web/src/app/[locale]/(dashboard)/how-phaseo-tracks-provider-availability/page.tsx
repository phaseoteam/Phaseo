import type { Metadata } from "next";
import { MethodologyArticlePage } from "@/components/methodology/MethodologyArticlePage";
import {
	METHODOLOGY_ENTRY_BY_SLUG,
	type MethodologyEntry,
} from "@/lib/content/methodology";
import { buildMetadata } from "@/lib/seo";
import { getTranslations } from "next-intl/server";
import type { PublicLocale } from "@/i18n/routing";

const entry = METHODOLOGY_ENTRY_BY_SLUG[
	"how-phaseo-tracks-provider-availability"
] as MethodologyEntry;

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale: locale as PublicLocale, namespace: "Site.methodology" });
	const translate = t as unknown as (name: string) => string;
	return buildMetadata({ title: translate(`entries.${entry.slug}.title`), description: translate(`entries.${entry.slug}.description`), path: entry.path, keywords: entry.keywords });
}

export default function ProviderAvailabilityMethodologyPage() {
	return <MethodologyArticlePage entry={entry} />;
}
