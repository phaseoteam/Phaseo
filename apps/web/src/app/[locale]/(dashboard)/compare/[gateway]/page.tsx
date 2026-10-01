import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, ExternalLink, Minus } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { buildMetadata } from "@/lib/seo";
import type { PublicLocale } from "@/i18n/routing";

type ComparisonCopy = {
	intro: string;
	bestFor: string;
	phaseoAdvantage: string;
	competitorAdvantage: string;
	rows: Array<{ capability: string; phaseo: string; competitor: string }>;
	sources: string[];
};

type Comparison = {
	name: string;
	slug: string;
	contentKey: string;
	sourceHrefs: string[];
};

const comparisons: Record<string, Comparison> = {
	openrouter: {
		name: "OpenRouter",
		slug: "openrouter",
		contentKey: "openrouter",
		sourceHrefs: [
			"https://openrouter.ai/pricing",
			"https://openrouter.ai/docs/guides/routing/provider-selection",
			"https://openrouter.ai/docs/guides/overview/auth/byok",
		],
	},
	"vercel-ai-gateway": {
		name: "Vercel AI Gateway",
		slug: "vercel-ai-gateway",
		contentKey: "vercel-ai-gateway",
		sourceHrefs: [
			"https://vercel.com/docs/ai-gateway",
			"https://vercel.com/docs/ai-gateway/pricing",
			"https://vercel.com/docs/ai-gateway/models-and-providers/provider-options",
		],
	},
	"cloudflare-ai-gateway": {
		name: "Cloudflare AI Gateway",
		slug: "cloudflare-ai-gateway",
		contentKey: "cloudflare-ai-gateway",
		sourceHrefs: [
			"https://developers.cloudflare.com/ai-gateway/",
			"https://developers.cloudflare.com/ai-gateway/reference/pricing/",
		],
	},
};
export function generateStaticParams() {
	return Object.keys(comparisons).map((gateway) => ({ gateway }));
}

export async function generateMetadata({ params }: { params: Promise<{ gateway: string; locale: PublicLocale }> }): Promise<Metadata> {
	const { gateway, locale } = await params;
	const comparison = comparisons[gateway];
	if (!comparison) return {};
	const t = await getTranslations({ locale, namespace: "Site.gatewayComparison" });
	return buildMetadata({
		title: t("metadataTitle", { name: comparison.name }),
		description: t("metadataDescription", { name: comparison.name }),
		path: `/compare/${comparison.slug}`,
	});
}

export default async function ComparisonPage({ params }: { params: Promise<{ gateway: string; locale: PublicLocale }> }) {
	const { gateway, locale } = await params;
	const comparison = comparisons[gateway];
	if (!comparison) notFound();
	const t = await getTranslations({ locale, namespace: "Site.gatewayComparison" });
	const copy = t.raw(`content.${comparison.contentKey}` as never) as ComparisonCopy;
	const reviewedDate = new Intl.DateTimeFormat(locale, {
		dateStyle: "long",
		timeZone: "UTC",
	}).format(new Date("2026-08-12T00:00:00Z"));

	return (
		<main className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
			<section className="max-w-4xl border-b border-border pb-12">
				<p className="text-sm font-medium text-muted-foreground">{t("eyebrow")}</p>
				<h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-6xl">{t("title", { name: comparison.name })}</h1>
				<p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">{copy.intro}</p>
				<div className="mt-8 flex flex-wrap gap-3">
					<Button asChild><Link href="/sign-up">{t("tryPhaseo")} <ArrowRight className="size-4" /></Link></Button>
					<Button asChild variant="outline"><Link href={comparison.slug === "cloudflare-ai-gateway" ? "/migrate" : `/migrate/${comparison.slug}`}>{t("migrationGuide")}</Link></Button>
				</div>
			</section>

			<section className="grid gap-6 border-b border-border py-12 md:grid-cols-2">
				<div><h2 className="text-xl font-semibold">{t("phaseoStandsOut")}</h2><p className="mt-3 leading-7 text-muted-foreground">{copy.phaseoAdvantage}</p></div>
				<div><h2 className="text-xl font-semibold">{t("competitorStandsOut", { name: comparison.name })}</h2><p className="mt-3 leading-7 text-muted-foreground">{copy.competitorAdvantage}</p></div>
			</section>

			<section className="py-12">
				<h2 className="text-2xl font-semibold">{t("capabilityComparison")}</h2>
				<div className="mt-6 overflow-hidden rounded-2xl border border-border">
					<div className="grid grid-cols-[0.75fr_1fr_1fr] bg-muted/40 text-sm font-semibold"><div className="p-4">{t("capability")}</div><div className="p-4">{t("phaseo")}</div><div className="p-4">{comparison.name}</div></div>
					{copy.rows.map((row) => <div key={row.capability} className="grid grid-cols-1 border-t border-border md:grid-cols-[0.75fr_1fr_1fr]"><div className="p-4 font-medium">{row.capability}</div><div className="flex gap-2 p-4 text-sm leading-6 text-muted-foreground"><Check className="mt-1 size-4 shrink-0 text-foreground" />{row.phaseo}</div><div className="flex gap-2 p-4 text-sm leading-6 text-muted-foreground"><Minus className="mt-1 size-4 shrink-0" />{row.competitor}</div></div>)}
				</div>
			</section>

			<section className="border-y border-border py-12"><h2 className="text-2xl font-semibold">{t("whichShouldYouChoose")}</h2><p className="mt-4 max-w-4xl leading-7 text-muted-foreground">{copy.bestFor}</p></section>
			<section className="pt-10"><h2 className="text-lg font-semibold">{t("officialSources", { name: comparison.name })}</h2><ul className="mt-4 space-y-2">{comparison.sourceHrefs.map((href, index) => <li key={href}><a className="inline-flex items-center gap-2 text-sm underline underline-offset-4" href={href} target="_blank" rel="noreferrer">{copy.sources[index]}<ExternalLink className="size-3.5" /></a></li>)}</ul><p className="mt-5 text-xs text-muted-foreground">{t("lastReviewed", { date: reviewedDate })}</p></section>
			<nav aria-label={t("otherComparisons")} className="mt-10 border-t border-border pt-8">
				<p className="text-sm font-medium">{t("moreComparisons")}</p>
				<div className="mt-3 flex flex-wrap gap-4 text-sm">
					{Object.values(comparisons).filter((item) => item.slug !== comparison.slug).map((item) => <Link key={item.slug} className="underline underline-offset-4" href={`/compare/${item.slug}`}>{t("title", { name: item.name })}</Link>)}
				</div>
			</nav>
		</main>
	);
}
