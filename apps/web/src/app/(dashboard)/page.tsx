import Link from "next/link";
import { Suspense } from "react";
import {
	ArrowRight,
	CalendarOff,
	Coins,
	GitBranch,
	Handshake,
	KeyRound,
	ShieldCheck,
	type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import { absoluteUrl, buildMetadata } from "@/lib/seo";
import { enterpriseSelfServePreviewEnabled } from "@/lib/flags";
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
import {
	buildHomeModelPrices,
	type HomeModelPrices,
} from "@/components/landingPage/Home/homeModelIntel";
import HomeReliabilitySection from "@/components/landingPage/Home/HomeReliabilitySection";
import PartnerLogos from "@/components/landingPage/PartnerLogos/PartnerLogos";
import { Logo } from "@/components/Logo";
import { HomepageModelContext } from "@/components/agents/HomepageModelContext";
import { Button } from "@/components/ui/button";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import Script from "next/script";
import {
	PREFERRED_SITE_NAME,
	SITE_ALTERNATE_NAME,
	SITE_NAME,
} from "@/lib/seo";

export const metadata: Metadata = {
	...buildMetadata({
		title: "Phaseo: The Open Gateway for Affordable AI",
		description:
			"Discover models, route across providers, and use an open-source AI gateway designed to keep inference accessible, portable, and transparent.",
		path: "/",
		keywords: [
			"AI models",
			"AI benchmarks",
			"AI gateway",
			"open-source AI gateway",
			"affordable AI inference",
			"provider-neutral AI",
			"model pricing",
			"AI providers",
		],
	}),
	title: { absolute: "Phaseo: The Open Gateway for Affordable AI" },
};

const standardTier =
	GATEWAY_TIERS.find((tier) => tier.key === "standard") ?? GATEWAY_TIERS[0];
const standardFeePct = standardTier?.feePct ?? 5;
const standardFeeText = Number.isInteger(standardFeePct)
	? standardFeePct.toFixed(0)
	: String(standardFeePct);
const GITHUB_HREF = "https://github.com/phaseoteam/Phaseo";

const MISSION_PROOFS: Array<{
	title: string;
	body: string;
	icon: LucideIcon;
}> = [
	{
		title: "Open source",
		body: "Inspect, extend, and improve the gateway.",
		icon: GitBranch,
	},
	{
		title: "Provider neutral",
		body: "Choose the provider that fits your work.",
		icon: Handshake,
	},
	{
		title: "Lower overhead",
		body: "Use efficiency and partnerships to reduce avoidable cost.",
		icon: Coins,
	},
];

const PRICING_POINTS: Array<{
	title: string;
	body: string;
	icon: LucideIcon;
}> = [
	{
		title: "Pay as you go for usage",
		body: "No contract, subscription, or minimum spend for model usage.",
		icon: CalendarOff,
	},
	{
		title: "Self-serve Enterprise",
		body: "An optional monthly workspace plan for SSO, SCIM, governance, and priority support.",
		icon: ShieldCheck,
	},
	{
		title: `${standardFeeText}% credit purchase fee`,
		body: "Applied when you purchase credits, with a $1 minimum. Usage follows the model prices shown in the catalog.",
		icon: Coins,
	},
	{
		title: "Managed credits or BYOK",
		body: "BYOK includes 250,000 fee-free requests each month, then a 2.5% service fee on provider-equivalent cost.",
		icon: KeyRound,
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

function LandingSecondarySections({
	isBeta,
	showEnterprisePreview,
}: {
	isBeta: boolean;
	showEnterprisePreview: boolean;
}) {
	return (
		<>
			<section className="space-y-6 border-b border-zinc-200/80 pb-20 dark:border-zinc-800/80">
				<div className="mx-auto max-w-3xl space-y-3 text-center">
					<h2 className="text-3xl font-semibold tracking-[-0.05em] text-zinc-950 dark:text-zinc-50 sm:text-4xl">
						Open model database, unified gateway
					</h2>
					<p className="mx-auto max-w-2xl text-base leading-7 text-zinc-600 dark:text-zinc-300 md:text-lg">
						Explore the broader model catalog, then filter to models with an active
						Gateway route before you ship.
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
						Clear prices today. Lower overhead tomorrow.
					</h2>
					<p className="mx-auto max-w-2xl text-base leading-7 text-zinc-600 dark:text-zinc-300 md:text-lg">
						Usage follows the model prices shown in the catalog. Today&apos;s credit purchase fee is
						shown openly; our mission is to reduce avoidable platform cost as provider partnerships
						and operating efficiency make that sustainable.
					</p>
				</div>
				<div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-4">
					{PRICING_POINTS.filter(
						(point) => showEnterprisePreview || point.title !== "Self-serve Enterprise",
					).map((point) => {
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

			<section className="border-b border-zinc-200/80 pb-12 dark:border-zinc-800/80">
				<Suspense fallback={<HomeModelUpdatesSectionFallback />}>
					<HomeModelUpdatesSection />
				</Suspense>
			</section>

			<section className="border-b border-zinc-200/80 pb-12 dark:border-zinc-800/80">
				<Suspense fallback={<HomeAnnouncementsSectionFallback />}>
					<HomeAnnouncementsSection />
				</Suspense>
			</section>

			<HomeOpenSourceSection variant={isBeta ? "beta" : "default"} />
		</>
	);
}

function LandingPage({
	isBeta,
	modelPrices,
	showEnterprisePreview,
}: {
	isBeta: boolean;
	modelPrices: HomeModelPrices;
	showEnterprisePreview: boolean;
}) {
	return (
		<div className="container mx-auto mt-16 mb-20 px-4 sm:mt-20 sm:px-6 lg:px-8">
			<div className="space-y-14">
				<section className="space-y-12 border-b border-zinc-200/80 pb-20 dark:border-zinc-800/80">
					<div className="mx-auto max-w-5xl space-y-8 text-center">
						<div className="space-y-6">
							<h1 className="text-balance mx-auto max-w-5xl text-5xl font-semibold leading-[0.96] tracking-[-0.065em] text-zinc-950 dark:text-zinc-50 md:text-7xl md:leading-[0.94] 2xl:max-w-7xl">
								AI Inference Should Be Open, Affordable, and Yours to Choose.
							</h1>
							<p className="text-balance mx-auto max-w-[44rem] text-lg leading-8 text-zinc-600 dark:text-zinc-300 2xl:max-w-5xl 2xl:text-pretty">
								Phaseo is building the open-source, provider-neutral gateway for AI. Discover models,
								route across providers, and keep your integration portable while better partnerships
								help move the cost of inference down.
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
						<Link
							className="mt-4 inline-flex items-center text-sm font-medium text-zinc-600 underline decoration-zinc-300 underline-offset-4 transition-colors hover:text-zinc-950 dark:text-zinc-300 dark:decoration-zinc-700 dark:hover:text-white"
							href="/mission"
						>
							See what we are building toward
							<ArrowRight aria-hidden="true" className="ml-2 size-4" />
						</Link>

						<div className="mx-auto mt-10 grid max-w-3xl gap-3 border-y border-zinc-200/80 py-4 text-left dark:border-zinc-800/80 sm:grid-cols-3">
							{MISSION_PROOFS.map(({ body, icon: Icon, title }) => (
								<div className="flex gap-3 sm:block" key={title}>
									<Icon
										aria-hidden="true"
										className="mt-0.5 size-4 shrink-0 text-primary sm:mb-2"
									/>
									<div>
										<p className="text-sm font-semibold text-zinc-950 dark:text-white">{title}</p>
										<p className="mt-1 text-sm leading-5 text-zinc-500 dark:text-zinc-400">{body}</p>
									</div>
								</div>
							))}
						</div>
					</div>

					<HomeQuickstartSection
						variant={isBeta ? "beta" : "default"}
						modelPrices={modelPrices}
					/>
				</section>
				<LandingSecondarySections isBeta={isBeta} showEnterprisePreview={showEnterprisePreview} />
			</div>
		</div>
	);
}

export default async function Page() {
	const [heroVariant, modelPrices, showEnterprisePreview] = await Promise.all([
		getGatewayHeroVariant(),
		fetchFrontendGatewayModels()
			.then(buildHomeModelPrices)
			.catch((error) => {
				console.warn("[Homepage] failed to load gateway model prices", error);
				return {};
			}),
		enterpriseSelfServePreviewEnabled(),
	]);
	const softwareApplicationSchema = {
		"@context": "https://schema.org",
		"@type": "SoftwareApplication",
		name: SITE_NAME,
		alternateName: PREFERRED_SITE_NAME,
		applicationCategory: "DeveloperApplication",
		operatingSystem: "Web",
		url: absoluteUrl("/"),
		description:
			"Open-source, provider-neutral AI gateway and model intelligence database for accessible, portable model access.",
	};
	const websiteSchema = {
		"@context": "https://schema.org",
		"@type": "WebSite",
		name: PREFERRED_SITE_NAME,
		alternateName: SITE_ALTERNATE_NAME,
		url: absoluteUrl("/"),
		description:
			"Discover models and compare providers, pricing, benchmarks, and gateway reliability data through an open AI layer.",
		potentialAction: {
			"@type": "SearchAction",
			target: `${absoluteUrl("/models")}?q={search_term_string}`,
			"query-input": "required name=search_term_string",
		},
	};
	const organizationSchema = {
		"@context": "https://schema.org",
		"@type": "Organization",
		name: PREFERRED_SITE_NAME,
		alternateName: SITE_ALTERNATE_NAME,
		url: absoluteUrl("/"),
		logo: absoluteUrl("/png_logo_light.png"),
		sameAs: [
			"https://github.com/phaseoteam/Phaseo",
			"https://x.com/phaseoteam",
			"https://www.linkedin.com/company/phaseoapp/",
			"https://www.reddit.com/r/Phaseo/",
		],
	};

	return (
		<>
			<Script
				id="homepage-software-application-schema"
				type="application/ld+json"
				dangerouslySetInnerHTML={{
					__html: JSON.stringify(softwareApplicationSchema),
				}}
			/>
			<Script
				id="homepage-website-schema"
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
			/>
			<Script
				id="homepage-organization-schema"
				type="application/ld+json"
				dangerouslySetInnerHTML={{
					__html: JSON.stringify(organizationSchema),
				}}
			/>
			<HomepageModelContext />
			<LandingPage
				isBeta={heroVariant === "experimental"}
				modelPrices={modelPrices}
				showEnterprisePreview={showEnterprisePreview}
			/>
		</>
	);
}
