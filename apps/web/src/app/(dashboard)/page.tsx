import Link from "next/link";
import { Suspense } from "react";
import {
	ArrowRight,
	Boxes,
	Coins,
	LockOpen,
	type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { getGatewayHeroVariant } from "@/lib/flags/gatewayHero";
import { GATEWAY_TIERS } from "@/components/(gateway)/credits/tiers";
import DatabaseStats from "@/components/landingPage/DatabaseStatistics";
import HomeAnnouncementsSection, {
	HomeAnnouncementsSectionFallback,
} from "@/components/landingPage/Home/HomeAnnouncementsSection";
import ExploreModelsProviderTicker from "@/components/landingPage/Home/ExploreModelsProviderTicker";
import HomeModelUpdatesSection, {
	HomeModelUpdatesSectionFallback,
} from "@/components/landingPage/Home/HomeModelUpdatesSection";
import HomeOpenSourceSection from "@/components/landingPage/Home/HomeOpenSourceSection";
import HomeQuickstartSection from "@/components/landingPage/Home/HomeQuickstartSection";
import HomeReliabilitySection from "@/components/landingPage/Home/HomeReliabilitySection";
import PartnerLogos from "@/components/landingPage/PartnerLogos/PartnerLogos";
import { Logo } from "@/components/Logo";
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

const standardTier =
	GATEWAY_TIERS.find((tier) => tier.key === "standard") ?? GATEWAY_TIERS[0];
const standardFeePct = standardTier?.feePct ?? 5;
const standardFeeText = Number.isInteger(standardFeePct)
	? standardFeePct.toFixed(0)
	: String(standardFeePct);
const GITHUB_HREF = "https://github.com/AI-Stats/AI-Stats";

const HERO_METRICS = [
	{ label: "Models live", value: "300+" },
	{ label: "Providers tracked", value: "60+" },
	{ label: "Gateway fee", value: `${standardFeeText}%` },
] as const;

const PRICING_POINTS: Array<{
	title: string;
	body: string;
	icon: LucideIcon;
}> = [
	{
		title: "Official API rates underneath",
		body: "Usage pricing follows the official provider rates you would expect if you were calling them directly.",
		icon: Coins,
	},
	{
		title: `Flat ${standardFeeText}% gateway fee`,
		body: "No mandatory seat pricing and no separate plan unlock just to use the core gateway surface.",
		icon: Boxes,
	},
	{
		title: "Managed credits or BYOK",
		body: "Start with AI Stats credits, or keep provider relationships intact and route through your own keys when you need to.",
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

function HeroSection() {
	return (
		<section className="relative -mx-4 bg-white px-4 py-5 sm:-mx-6 sm:px-6 sm:py-8 lg:-mx-8 lg:px-8 lg:py-10">
			<div className="relative mx-auto max-w-5xl space-y-7">
				<div className="space-y-6 text-center">
					<div className="space-y-5">
						<h1 className="mx-auto max-w-4xl text-[2.65rem] font-semibold leading-[0.99] tracking-[-0.05em] text-zinc-950 sm:text-[4.1rem] sm:leading-[0.98] lg:text-[5rem]">
							Compare models.
							<span className="block text-[#d04e2a]">Route requests.</span>
							<span className="block">Keep the stack legible.</span>
						</h1>
						<p className="mx-auto max-w-2xl text-[15px] leading-[1.75] text-zinc-700 sm:text-lg sm:leading-[1.85]">
							AI Stats gives teams one place to compare benchmarks, pricing, and
							provider coverage, then ship through a single OpenAI-compatible
							gateway without losing operational clarity.
						</p>
					</div>

					<div className="flex flex-col items-center justify-center gap-3 pt-1 sm:flex-row">
						<Button
							asChild
							size="lg"
							className="h-12 rounded-full bg-zinc-950 px-6 text-sm font-semibold text-white hover:bg-zinc-800"
						>
							<Link href="/settings/keys">
								Get API Key
								<ArrowRight className="h-4 w-4" />
							</Link>
						</Button>
						<Button
							asChild
							size="lg"
							variant="outline"
							className="h-12 rounded-full border-zinc-300/80 bg-white px-6 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
						>
							<Link
								href="/models"
								className="group inline-flex items-center gap-2"
							>
								<span>Explore</span>
								<ExploreModelsProviderTicker />
								<span>Models</span>
							</Link>
						</Button>
					</div>

					<div className="mx-auto grid gap-3 border-t border-zinc-200/80 pt-4 sm:grid-cols-3 lg:max-w-3xl">
						{HERO_METRICS.map((metric) => (
							<div
								key={metric.label}
								className="rounded-[1.35rem] border border-zinc-200/80 bg-white px-4 py-4"
							>
								<p className="text-[1.7rem] font-semibold tracking-[-0.06em] text-zinc-950">
									{metric.value}
								</p>
								<p className="mt-1 text-xs uppercase tracking-[0.22em] text-zinc-500">
									{metric.label}
								</p>
							</div>
						))}
					</div>
				</div>
			</div>
		</section>
	);
}

function LandingSecondarySections({ isBeta }: { isBeta: boolean }) {
	return (
		<>
			<section className="space-y-6 border-b border-zinc-200/80 pb-20 dark:border-zinc-800/80">
				<div className="mx-auto max-w-3xl space-y-3 text-center">
					<h2 className="text-3xl font-semibold tracking-[-0.05em] text-zinc-950 dark:text-zinc-50 sm:text-4xl">
						Open model database, unified gateway
					</h2>
					<p className="mx-auto max-w-2xl text-base leading-7 text-zinc-600 dark:text-zinc-300 md:text-lg">
						Track broad ecosystem coverage in the database, then ship through one
						OpenAI-compatible gateway with 300+ production-ready models today.
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
							<div
								key={point.title}
								className="space-y-4 border-t border-zinc-200/80 pt-5 dark:border-zinc-800/80"
							>
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
					<Button
						asChild
						size="lg"
						className="h-11 w-full rounded-xl text-sm font-semibold"
					>
						<Link href="/pricing">
							View pricing
							<ArrowRight className="h-4 w-4" />
						</Link>
					</Button>
					<Button
						asChild
						size="lg"
						variant="outline"
						className="h-11 w-full rounded-xl text-sm font-semibold"
					>
						<Link href="/tools/pricing-calculator">Use pricing calculator</Link>
					</Button>
				</div>
			</section>

			<HomeReliabilitySection />

			<section className="grid gap-10 border-b border-zinc-200/80 pb-12 dark:border-zinc-800/80 lg:grid-cols-2 lg:items-start">
				<div className="min-w-0">
					<Suspense fallback={<HomeModelUpdatesSectionFallback />}>
						<HomeModelUpdatesSection />
					</Suspense>
				</div>
				<div className="min-w-0">
					<Suspense fallback={<HomeAnnouncementsSectionFallback />}>
						<HomeAnnouncementsSection />
					</Suspense>
				</div>
			</section>

			<HomeOpenSourceSection variant={isBeta ? "beta" : "default"} />
		</>
	);
}

function LandingPage({ isBeta }: { isBeta: boolean }) {
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
								Open-source AI gateway and open model database, with
								OpenAI-compatible drop-in access to 300+ models plus benchmarks,
								pricing, and reliability data.
							</p>
						</div>
						<div
							className={`mx-auto grid w-full grid-cols-1 gap-3 ${
								isBeta ? "max-w-3xl sm:grid-cols-3" : "max-w-2xl sm:grid-cols-2"
							}`}
						>
							<Button
								asChild
								size="lg"
								variant="outline"
								className="h-11 w-full rounded-xl text-sm font-semibold"
							>
								<Link
									href="/models"
									className="group inline-flex w-full items-center justify-center gap-2 whitespace-nowrap"
								>
									<span>Explore</span>
									<ExploreModelsProviderTicker />
									<span>Models</span>
								</Link>
							</Button>
							<Button
								asChild
								size="lg"
								className="h-11 w-full rounded-xl text-sm font-semibold"
							>
								<Link href="/settings/keys">
									Get API Key
									<ArrowRight className="h-4 w-4" />
								</Link>
							</Button>
							{isBeta ? (
								<Button
									asChild
									size="lg"
									variant="outline"
									className="h-11 w-full rounded-xl text-sm font-semibold"
								>
									<Link href={GITHUB_HREF} target="_blank" rel="noreferrer">
										<Logo
											id="github"
											alt="GitHub"
											width={16}
											height={16}
											className="h-4 w-4"
										/>
										View GitHub
									</Link>
								</Button>
							) : null}
						</div>
					</div>

					<HomeQuickstartSection variant={isBeta ? "beta" : "default"} />
				</section>
				<LandingSecondarySections isBeta={isBeta} />
			</div>
		</div>
	);
}

export default async function Page() {
	const heroVariant = await getGatewayHeroVariant();
	return <LandingPage isBeta={heroVariant === "experimental"} />;
}
