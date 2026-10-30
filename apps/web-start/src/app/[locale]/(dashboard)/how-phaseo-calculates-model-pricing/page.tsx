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
	"how-phaseo-calculates-model-pricing"
] as MethodologyEntry;

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale: locale as PublicLocale, namespace: "Site.methodology" });
	const key = `entries.${entry.slug}` as const;
	const translate = t as unknown as (name: string) => string;
	return buildMetadata({ title: translate(`${key}.title`), description: translate(`${key}.description`), path: entry.path, keywords: entry.keywords });
}

export default function ModelPricingMethodologyPage() {
	return <MethodologyArticlePage entry={entry} />;
}
