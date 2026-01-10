import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeroProviderMarquee } from "./HeroProviderMarquee";
import type { GatewayMarketingMetrics } from "@/lib/fetchers/gateway/getMarketingMetrics";
import { resolveLogo } from "@/lib/logos";

function formatPercent(value: number | null | undefined, digits = 2): string {
	const normalized = value == null || Number.isNaN(value) ? 0 : value;
	return `${normalized.toFixed(digits)}%`;
}

function formatAbsoluteNumber(
	value: number | string | null | undefined
): string {
	if (value == null) return "0";
	const numericValue =
		typeof value === "number" ? value : Number.parseFloat(String(value));
	if (!Number.isFinite(numericValue)) return "0";
	return Intl.NumberFormat("en-US").format(Math.round(numericValue));
}

function formatCompactNumber(value: number | null | undefined): string {
	const normalized = value == null || Number.isNaN(value) ? 0 : value;
	return Intl.NumberFormat("en-US", {
		notation: "compact",
		maximumFractionDigits: 1,
	}).format(normalized);
}

interface HeroSectionProps {
	metrics: GatewayMarketingMetrics;
}

export function HeroSection({ metrics }: HeroSectionProps) {
	const statCards = [
		{
			label: "Uptime (24h)",
			value: formatPercent(metrics.summary.uptimePct, 2),
		},
		{
			label: "Supported providers",
			value: formatAbsoluteNumber(metrics.summary.supportedProviders),
		},
		{
			label: "Supported models",
			value: formatAbsoluteNumber(metrics.summary.supportedModels),
		},
		{
			label: "Tokens (24h)",
			value: formatCompactNumber(metrics.summary.tokens24h),
		},
	];

	const heroProviderLogos = (() => {
		const providerIds = metrics.supported.providerIds ?? [];
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
							<span>World's largest unified AI gateway.</span>
							<span className="block text-indigo-600">
								Fully open source.
							</span>
						</h1>
						<p className="text-lg text-slate-600 dark:text-slate-400">
							One API for chat, vision, audio, and embeddings with
							live telemetry, compliance controls, and provider
							failover built in.
						</p>
						<div className="flex flex-wrap gap-3">
							<Button asChild size="lg">
								<Link href="/sign-up">
									Start building
									<ArrowRight className="h-4 w-4" />
								</Link>
							</Button>
							<Button asChild variant="outline" size="lg">
								<Link href="#quickstart">View quickstart</Link>
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
							Supported providers
						</p>
						<HeroProviderMarquee logos={heroProviderLogos} />
					</div>
					<div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
						<p className="font-semibold text-amber-900">
							Working to lower pricing + increase model offering
						</p>
						<p className="mt-2 text-slate-700">
							I am working as hard as I can to lower pricing and
							will do so at every opportunity; I'm a solo
							developer, but this is something I'm actively
							addressing as well as looking to expand the gateway
							substantially as soon as possible.
						</p>
					</div>
				</div>
			</div>
		</section>
	);
}
