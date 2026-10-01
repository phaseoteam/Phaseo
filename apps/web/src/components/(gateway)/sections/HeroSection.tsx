import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeroProviderMarquee } from "./HeroProviderMarquee";
import type { GatewayMarketingMetrics } from "@/lib/fetchers/gateway/getMarketingMetrics";
import { resolveLogo } from "@/lib/logos";
import { useTranslations } from "next-intl";
import { DisplayNumber } from "@/components/display/DisplayValue";

interface HeroSectionProps {
	metrics: GatewayMarketingMetrics;
}

const blockedMarqueeProviderIds = new Set([
	"openrouter",
	"huggingface",
	"hugging-face",
	"phaseo",
]);

export function HeroSection({ metrics }: HeroSectionProps) {
	const t = useTranslations("Site.gatewayMarketing.hero");
	const statCards = [
		{
			label: t("uptime24h"),
			value: <><DisplayNumber value={metrics.summary.uptimePct ?? 0} options={{ minimumFractionDigits: 2, maximumFractionDigits: 2, notation: "standard" }} />%</>,
		},
		{
			label: t("supportedProviders"),
			value: <DisplayNumber value={Number(metrics.summary.supportedProviders ?? 0)} options={{ maximumFractionDigits: 0 }} />,
		},
		{
			label: t("supportedModels"),
			value: <DisplayNumber value={Number(metrics.summary.supportedModels ?? 0)} options={{ maximumFractionDigits: 0 }} />,
		},
		{
			label: t("tokens24h"),
			value: <DisplayNumber value={metrics.summary.tokens24h ?? 0} />,
		},
	];

	const heroProviderLogos = (() => {
		const providerIds = (metrics.supported.providerIds ?? []).filter(
			(id) =>
				!id.startsWith("observability-") &&
				!blockedMarqueeProviderIds.has(id.toLowerCase())
		);
		if (!providerIds.length) return [];
		const seen = new Set<string>();
		const deduped: string[] = [];
		for (const id of providerIds) {
			const resolved = resolveLogo(id, { fallbackToColor: false });
			const src = resolved.src;
			if (!src || seen.has(src)) continue;
			seen.add(src);
			deduped.push(id);
		}
		return deduped.slice(0, 16);
	})();

	return (
		<section className="border-b border-slate-200">
			<div className="mx-auto max-w-7xl px-6 py-16 lg:py-20">
				<div className="space-y-10">
					<div className="space-y-5">
						<h1 className="text-4xl font-semibold leading-tight tracking-tight text-slate-900 dark:text-slate-100 sm:text-5xl lg:text-6xl">
							<span>{t("title")}</span>
							<span className="block text-indigo-600">
								{t("openSourceTitle")}
							</span>
						</h1>
						<p className="text-lg text-slate-600 dark:text-slate-400">
							{t("description")}
						</p>
						<div className="flex flex-wrap gap-3">
							<Button asChild size="lg">
								<Link href="/sign-up">
									{t("startBuilding")}
									<ArrowRight className="h-4 w-4" />
								</Link>
							</Button>
							<Button asChild variant="outline" size="lg">
								<Link href="#quickstart">{t("viewQuickstart")}</Link>
							</Button>
						</div>
					</div>
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
						{statCards.map((card) => (
							<div
								key={card.label}
								className="rounded-[1.75rem] border border-slate-200 p-5 text-slate-900 dark:text-slate-100 shadow-sm"
							>
								<div className="text-xs font-semibold text-slate-500 dark:text-slate-300">
									{card.label}
								</div>
								<div className="mt-3 text-3xl font-semibold">
									{card.value}
								</div>
							</div>
						))}
					</div>
					<div className="space-y-3">
						<p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
							{t("supportedProviders")}
						</p>
						<HeroProviderMarquee logos={heroProviderLogos} />
					</div>
					<div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
						<p className="font-semibold text-amber-900">
							{t("pricingCommitmentTitle")}
						</p>
						<p className="mt-2 text-slate-700">
							{t("pricingCommitmentDescription")}
						</p>
					</div>
				</div>
			</div>
		</section>
	);
}
