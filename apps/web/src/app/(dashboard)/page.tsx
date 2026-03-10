import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Coins, LockOpen, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { GATEWAY_TIERS } from "@/components/(gateway)/credits/tiers";
import DatabaseStats from "@/components/landingPage/DatabaseStatistics";
import HomeOpenSourceSection from "@/components/landingPage/Home/HomeOpenSourceSection";
import HomeModelUpdatesSection, {
	HomeModelUpdatesSectionFallback,
} from "@/components/landingPage/Home/HomeModelUpdatesSection";
import ExploreModelsProviderTicker from "@/components/landingPage/Home/ExploreModelsProviderTicker";
import HomeQuickstartSection from "@/components/landingPage/Home/HomeQuickstartSection";
import HomeReliabilitySection from "@/components/landingPage/Home/HomeReliabilitySection";
import PartnerLogos from "@/components/landingPage/PartnerLogos/PartnerLogos";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
	title: "One API for AI Models | AI Stats Gateway",
	description:
		"AI Stats Gateway gives teams one OpenAI-compatible API for multiple model providers, transparent pricing, and no lock-in.",
	alternates: {
		canonical: "/",
	},
};

const basicTier = GATEWAY_TIERS.find((tier) => tier.key === "basic");

const PRICING_POINTS = [
	{
		title: "Billed at official API rates",
		body: "You get billed at official API rates as if you were using the provider directly, so you always know exactly what you are paying.",
		icon: Coins,
	},
	{
		title: `Flat ${basicTier?.feePct.toFixed(0) ?? "7"}% fee`,
		body: `Gateway pricing is a flat ${basicTier?.feePct.toFixed(0) ?? "7"}% fee on credit purchases. No subscriptions, and no plan ladder to unlock the core product.`,
		icon: ShieldCheck,
	},
	{
		title: "No lock-in",
		body: "Run on managed credits or bring your own provider keys. Use the unified API either way.",
		icon: LockOpen,
	},
] as const;

function DatabaseStatsFallback() {
	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
			{Array.from({ length: 3 }).map((_, index) => (
				<div
					key={index}
					className="h-28 animate-pulse rounded-2xl border border-zinc-200/70 bg-zinc-50/70 dark:border-zinc-800/70 dark:bg-zinc-950/50"
				/>
			))}
		</div>
	);
}



export default function Page() {
	return (
		<div className="container mx-auto mt-16 mb-20 px-4 sm:mt-20 sm:px-6 lg:px-8">
			<div className="space-y-14">
				<section className="space-y-12 border-b border-zinc-200/80 pb-20 dark:border-zinc-800/80">
					<div className="mx-auto max-w-5xl space-y-8 text-center">
						<div className="space-y-6">
							<h1 className="mx-auto max-w-4xl text-5xl font-semibold tracking-[-0.07em] text-zinc-950 dark:text-zinc-50 md:text-7xl">
								<span className="block">One API for Every AI Model</span>
								<span className="mt-2 block">One Open Model Database</span>
							</h1>
							<p className="mx-auto max-w-2xl text-lg leading-8 text-zinc-600 dark:text-zinc-300">
								Access 200+ AI models through a unified API, with open benchmarks, pricing data, and reliability insights.
							</p>
						</div>
						<div className="flex flex-wrap justify-center gap-3">
							<Button asChild size="lg" variant="outline" className="h-11 rounded-xl px-6 text-sm font-semibold">
								<Link href="/models" className="group inline-flex items-center gap-2 whitespace-nowrap">
									<span>Explore</span>
									<ExploreModelsProviderTicker />
									<span>Models</span>
								</Link>
							</Button>
							<Button asChild size="lg" className="h-11 rounded-xl px-6 text-sm font-semibold">
								<Link href="/settings/keys">
									Get API Key
									<ArrowRight className="h-4 w-4" />
								</Link>
							</Button>
						</div>
					</div>

					<HomeQuickstartSection />
				</section>

				<section className="space-y-6 border-b border-zinc-200/80 pb-20 dark:border-zinc-800/80">
					<div className="mx-auto max-w-3xl space-y-3 text-center">
						<h2 className="text-3xl font-semibold tracking-[-0.05em] text-zinc-950 dark:text-zinc-50 sm:text-4xl">
							Open model database, unified gateway
						</h2>
						<p className="mx-auto max-w-2xl text-base leading-7 text-zinc-600 dark:text-zinc-300 md:text-lg">
							Track broad ecosystem coverage in the database, then ship through one
							OpenAI-compatible gateway with 200+ production-ready models today.
						</p>
					</div>
					<PartnerLogos />
					<Suspense fallback={<DatabaseStatsFallback />}>
						<DatabaseStats />
					</Suspense>
				</section>

				<section className="space-y-6 border-b border-zinc-200/80 pb-20 dark:border-zinc-800/80">
					<div className="mx-auto max-w-3xl space-y-3 text-center">
						<h2 className="text-3xl font-semibold tracking-[-0.05em] text-zinc-950 dark:text-zinc-50 sm:text-4xl">
							Transparent pricing
						</h2>

					</div>
					<div className="grid gap-6 lg:grid-cols-3">
						{PRICING_POINTS.map((point) => {
							const Icon = point.icon;
							return (
								<div key={point.title} className="space-y-4 border-t border-zinc-200/80 pt-5 dark:border-zinc-800/80">
									<div className="flex items-center gap-3">
										<div className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200/80 dark:border-zinc-800/80">
											<Icon className="h-4 w-4 text-zinc-700 dark:text-zinc-300" />
										</div>
										<h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
											{point.title}
										</h3>
									</div>
									<p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
										{point.body}
									</p>
								</div>
							);
						})}
					</div>
					<div className="flex flex-wrap justify-center gap-3">
						<Button asChild size="lg" className="h-11 rounded-xl px-6 text-sm font-semibold">
							<Link href="/pricing">
								View pricing
								<ArrowRight className="h-4 w-4" />
							</Link>
						</Button>
						<Button asChild size="lg" variant="outline" className="h-11 rounded-xl px-6 text-sm font-semibold">
							<Link href="/tools/pricing-calculator">Use pricing calculator</Link>
						</Button>
					</div>
				</section>

				<HomeReliabilitySection />

				<Suspense fallback={<HomeModelUpdatesSectionFallback />}>
					<HomeModelUpdatesSection />
				</Suspense>

				<HomeOpenSourceSection />
			</div>
		</div>
	);
}













