import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Coins, LockOpen, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { getGatewayHeroVariant } from "@/lib/flags/gatewayHero";
import type { GatewayHeroVariant } from "@/lib/statsig/shared";
import { GATEWAY_TIERS } from "@/components/(gateway)/credits/tiers";
import { Logo } from "@/components/Logo";
import HomeOpenSourceSection from "@/components/landingPage/Home/HomeOpenSourceSection";
import HomeModelUpdatesSection, {
	HomeModelUpdatesSectionFallback,
} from "@/components/landingPage/Home/HomeModelUpdatesSection";
import HomeAnnouncementsSection, {
	HomeAnnouncementsSectionFallback,
} from "@/components/landingPage/Home/HomeAnnouncementsSection";
import ExploreModelsProviderTicker from "@/components/landingPage/Home/ExploreModelsProviderTicker";
import HomeQuickstartSection from "@/components/landingPage/Home/HomeQuickstartSection";
import HomeReliabilitySection from "@/components/landingPage/Home/HomeReliabilitySection";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = buildMetadata({
	title: "AI Models, Benchmarks & Gateway API",
	description:
		"Compare AI models, benchmarks, pricing and providers, then route them through one OpenAI-compatible gateway with transparent pricing.",
	path: "/",
	keywords: [
		"AI models",
		"AI benchmarks",
		"AI gateway",
		"model pricing",
		"AI providers",
	],
});

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

function HomepageHero({ heroVariant }: { heroVariant: GatewayHeroVariant }) {
	const isExperimental = heroVariant === "experimental";

	return (
		<section className="space-y-12 border-b border-zinc-200/80 pb-20 dark:border-zinc-800/80">
			<div className={`mx-auto w-full space-y-8 text-center ${isExperimental ? "" : "max-w-5xl"}`}>
				<div className="space-y-6">
					{isExperimental ? (
						<div className="flex justify-center">
							<Link
								href="https://github.com/AI-Stats/AI-Stats"
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-2 rounded-full border border-zinc-200/80 bg-zinc-50/70 px-4 py-1.5 text-xs font-semibold text-zinc-800 transition-colors hover:bg-zinc-100 dark:border-zinc-800/80 dark:bg-zinc-900/70 dark:text-zinc-200 dark:hover:bg-zinc-900"
							>
								<Logo id="github" alt="GitHub" width={14} height={14} className="h-3.5 w-3.5" />
								<span>Open Source</span>
								<ArrowRight className="h-3.5 w-3.5" />
							</Link>
						</div>
					) : null}
					<h1 className={`mx-auto text-5xl font-semibold tracking-[-0.07em] text-zinc-950 dark:text-zinc-50 md:text-7xl ${isExperimental ? "max-w-none" : "max-w-4xl"}`}>
						{isExperimental ? (
							<>
								<span className="block">One Open Platform for Every AI Model.</span>
							</>
						) : (
							<>
								<span className="block">One API for Every AI Model</span>
								<span className="mt-2 block">One Open Model Database</span>
							</>
						)}
					</h1>
					<p className={`mx-auto text-lg leading-8 text-zinc-600 dark:text-zinc-300 ${isExperimental ? "max-w-none" : "max-w-2xl"}`}>
						{isExperimental
							? "Build, test, compare, and route models through one gateway, one chat experience, and a live open database of pricing, benchmarks, and reliability."
							: "Open-source AI gateway and open model database, with OpenAI-compatible drop-in access to 300+ models plus benchmarks, pricing, and reliability data."}
					</p>
				</div>
				<div className="mx-auto grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
					<Button asChild size="lg" variant="outline" className="h-11 w-full rounded-xl text-sm font-semibold">
						<Link href="/models" className="group inline-flex w-full items-center justify-center gap-2 whitespace-nowrap">
							<span>Explore</span>
							<ExploreModelsProviderTicker />
							<span>Models</span>
						</Link>
					</Button>
					<Button asChild size="lg" className="h-11 w-full rounded-xl text-sm font-semibold">
						<Link href="/settings/keys">
							Get API Key
							<ArrowRight className="h-4 w-4" />
						</Link>
					</Button>
				</div>
			</div>

			<HomeQuickstartSection variant={isExperimental ? "beta" : "default"} />
		</section>
	);
}

export default async function Page() {
	const heroVariant = await getGatewayHeroVariant();

	return (
		<div className="container mx-auto mt-16 mb-20 px-4 sm:mt-20 sm:px-6 lg:px-8">
			<div className="space-y-14">
				<HomepageHero heroVariant={heroVariant} />

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
					<div className="mx-auto grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
						<Button asChild size="lg" className="h-11 w-full rounded-xl text-sm font-semibold">
							<Link href="/pricing">
								View pricing
								<ArrowRight className="h-4 w-4" />
							</Link>
						</Button>
						<Button asChild size="lg" variant="outline" className="h-11 w-full rounded-xl text-sm font-semibold">
							<Link href="/tools/pricing-calculator">Use pricing calculator</Link>
						</Button>
					</div>
				</section>

				<HomeReliabilitySection />

				<Suspense fallback={<HomeModelUpdatesSectionFallback />}>
					<HomeModelUpdatesSection />
				</Suspense>

				<HomeOpenSourceSection />

				<Suspense fallback={<HomeAnnouncementsSectionFallback />}>
					<HomeAnnouncementsSection />
				</Suspense>
			</div>
		</div>
	);
}













