import Link from "next/link";
import { Suspense } from "react";
import {
	ArrowRight,
	CalendarOff,
	Coins,
	KeyRound,
	type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/seo";
import { buildLocalizedPageMetadata } from "@/lib/auth/localized-metadata";
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
import { getTranslations } from "next-intl/server";
import type { PublicLocale } from "@/i18n/routing";

export async function generateMetadata({
	params,
}: LayoutProps<"/[locale]">): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale: locale as PublicLocale, namespace: "Site.home" });
	return {
		...buildLocalizedPageMetadata({
			locale: locale as PublicLocale,
			title: t("title"),
			description: t("description"),
			pathname: "/",
			keywords: ["AI models", "AI benchmarks", "AI gateway", "model pricing", "AI providers"],
		}),
		title: { absolute: t("title") },
	};
}

const standardTier =
	GATEWAY_TIERS.find((tier) => tier.key === "standard") ?? GATEWAY_TIERS[0];
const standardFeePct = standardTier?.feePct ?? 5;
const standardFeeText = Number.isInteger(standardFeePct)
	? standardFeePct.toFixed(0)
	: String(standardFeePct);
const GITHUB_HREF = "https://github.com/phaseoteam/Phaseo";
type HomeTranslator = (key: string, values?: Record<string, unknown>) => string;

const PRICING_POINTS: Array<{
	title: string;
	body: string;
	icon: LucideIcon;
}> = [
	{
		title: "payAsYouGo",
		body: "payAsYouGoBody",
		icon: CalendarOff,
	},
	{
		title: "creditFee",
		body: "creditFeeBody",
		icon: Coins,
	},
	{
		title: "managedCredits",
		body: "managedCreditsBody",
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

function LandingSecondarySections({ isBeta, t }: { isBeta: boolean; t: HomeTranslator }) {
	return (
		<>
			<section className="space-y-6 border-b border-zinc-200/80 pb-20 dark:border-zinc-800/80">
				<div className="mx-auto max-w-3xl space-y-3 text-center">
					<h2 className="text-3xl font-semibold tracking-[-0.05em] text-zinc-950 dark:text-zinc-50 sm:text-4xl">
						{t("openModelDatabase")}
					</h2>
					<p className="mx-auto max-w-2xl text-base leading-7 text-zinc-600 dark:text-zinc-300 md:text-lg">
						{t("openModelDatabaseDescription")}
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
						{t("transparentPricing")}
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
										{point.title === "creditFee" ? t(`pricingPoints.${point.title}`, { fee: standardFeeText }) : t(`pricingPoints.${point.title}`)}
									</h3>
								</div>
								<p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
										{t(`pricingPoints.${point.body}`)}
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
										{t("viewPricing")}
							<ArrowRight className="h-4 w-4" />
						</Link>
					</Button>
					<Button
						asChild
						size="lg"
						variant="outline"
						className="h-11 w-full rounded-xl text-sm font-semibold"
					>
										<Link href="/tools/pricing-calculator">{t("usePricingCalculator")}</Link>
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
	t,
	modelPrices,
}: {
	isBeta: boolean;
	t: HomeTranslator;
	modelPrices: HomeModelPrices;
}) {
	return (
		<div className="container mx-auto mt-16 mb-20 px-4 sm:mt-20 sm:px-6 lg:px-8">
			<div className="space-y-14">
				<section className="space-y-12 border-b border-zinc-200/80 pb-20 dark:border-zinc-800/80">
					<div className="mx-auto max-w-5xl space-y-8 text-center">
						<div className="space-y-6">
							<h1 className="text-balance mx-auto max-w-5xl text-5xl font-semibold leading-[0.96] tracking-[-0.065em] text-zinc-950 dark:text-zinc-50 md:text-7xl md:leading-[0.94] 2xl:max-w-7xl 2xl:whitespace-nowrap">
								{t("heroTitle")}
							</h1>
							<p className="text-balance mx-auto max-w-[44rem] text-lg leading-8 text-zinc-600 dark:text-zinc-300 2xl:max-w-5xl 2xl:text-pretty">
								{t("heroDescription")} {" "}
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
										<span>{t("explore")}</span>
									<ExploreModelsProviderTicker />
									<span>{t("models")}</span>
								</Link>
							</Button>
							<Button
								asChild
								size="lg"
								className="h-11 w-full rounded-xl text-sm font-semibold"
							>
								<Link href="/settings/keys">
									{t("getApiKey")}
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
										{t("viewGithub")}
									</Link>
								</Button>
							) : null}
						</div>
					</div>

					<HomeQuickstartSection
						variant={isBeta ? "beta" : "default"}
						modelPrices={modelPrices}
					/>
				</section>
				<LandingSecondarySections isBeta={isBeta} t={t} />
			</div>
		</div>
	);
}

export default async function Page() {
	const t = await getTranslations("Site.home");
	const [heroVariant, modelPrices] = await Promise.all([
		getGatewayHeroVariant(),
		fetchFrontendGatewayModels()
			.then(buildHomeModelPrices)
			.catch((error) => {
				console.warn("[Homepage] failed to load gateway model prices", error);
				return {};
			}),
	]);
	const softwareApplicationSchema = {
		"@context": "https://schema.org",
		"@type": "SoftwareApplication",
		name: SITE_NAME,
		alternateName: PREFERRED_SITE_NAME,
		applicationCategory: "DeveloperApplication",
		operatingSystem: "Web",
		url: absoluteUrl("/"),
		description: t("description"),
	};
	const websiteSchema = {
		"@context": "https://schema.org",
		"@type": "WebSite",
		name: PREFERRED_SITE_NAME,
		alternateName: SITE_ALTERNATE_NAME,
		url: absoluteUrl("/"),
		description: t("description"),
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
				t={t as unknown as HomeTranslator}
				modelPrices={modelPrices}
			/>
		</>
	);
}
