import Link from "next/link";
import type { Metadata } from "next";
import {
	ArrowRight,
	BookOpen,
	Database,
	GitBranch,
	LineChart,
	Route,
	ShieldCheck,
	Sparkles,
	Wallet,
} from "lucide-react";
import { buildMetadata } from "@/lib/seo";
import { getLocale, getTranslations } from "next-intl/server";
import type { PublicLocale } from "@/i18n/routing";
import { getLocalizedDocsHref } from "@/lib/docs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export async function generateMetadata({ params }: { params: Promise<{ locale: PublicLocale }> }): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "Site.about" });
	return buildMetadata({
		title: t("metadataTitle"),
		description: t("metadataDescription"),
		path: "/about",
		keywords: t.raw("metadataKeywords" as never) as string[],
	});
}

function SectionTitle({
	eyebrow,
	title,
	description,
}: {
	eyebrow?: string;
	title: string;
	description?: string;
}) {
	return (
		<div className="space-y-2">
			{eyebrow ? (
				<div className="text-[11px] font-semibold tracking-[0.26em] uppercase text-muted-foreground">
					{eyebrow}
				</div>
			) : null}
			<h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{title}</h2>
			{description ? <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
		</div>
	);
}

function ResourceButton({
	href,
	label,
	external,
	variant = "outline",
}: {
	href: string;
	label: string;
	external?: boolean;
	variant?: "outline" | "ghost";
}) {
	return (
		<Button asChild variant={variant} className="justify-between">
			<Link href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
				{label}
				<ArrowRight className="h-4 w-4" />
			</Link>
		</Button>
	);
}

const platformFlowLinks = [
	{ href: "/models", icon: Database },
	{ href: "/", icon: Route },
	{ href: "/updates/models", icon: GitBranch },
	{ href: "/settings/usage", icon: LineChart },
] as const;

const offeringLinks = [
	{ href: "/models", icon: Database },
	{ href: "/", icon: Route },
	{ href: "/updates/models", icon: GitBranch },
	{ href: "/settings/usage", icon: LineChart },
] as const;

const resourceLinks = [
	{ key: "announcements", href: "https://phaseo.app/docs/v1/changelog", external: true },
	{ key: "modelUpdates", href: "/updates/models" },
	{ key: "gatewayUsage", href: "/settings/usage" },
	{ key: "mission", href: "/mission" },
	{ key: "roadmap", href: "/roadmap" },
	{ key: "contact", href: "/contact" },
] as const;

export default async function AboutPage() {
	const locale = await getLocale();
	const t = await getTranslations({ locale, namespace: "Site.about" });
	const platformFlow = t.raw("platformFlow" as never) as Array<{
		title: string;
		description: string;
		points: string[];
	}>;
	const offerings = t.raw("offerings" as never) as Array<{
		title: string;
		description: string;
		badges: string[];
	}>;
	const heroTags = t.raw("heroTags" as never) as string[];
	const company = t.raw("company" as never) as Record<string, string>;
	const resources = t.raw("resources" as never) as Record<string, string>;
	return (
		<main className="relative min-h-screen overflow-hidden">
			<div className="mx-4 px-2 py-12 sm:mx-6 sm:px-0 sm:py-16 lg:mx-8 xl:mx-10 2xl:mx-auto 2xl:max-w-[1460px]">
				<section className="space-y-7 animate-in fade-in-0 slide-in-from-bottom-2 duration-700">
					<div className="flex flex-wrap items-center gap-2">
						<Badge variant="secondary" className="text-[11px]">
							{t("badge")}
						</Badge>
						{heroTags.map((tag) => <Badge key={tag} variant="outline" className="text-[11px]">{tag}</Badge>)}
					</div>

					<h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
						{t("title")}
					</h1>

					<p className="max-w-3xl text-base leading-7 text-muted-foreground">
						{t("intro")}
					</p>

					<div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
						<Button asChild className="h-10">
							<Link href="/models">
								{t("exploreModels")}
								<ArrowRight className="ml-2 h-4 w-4" />
							</Link>
						</Button>
						<Button asChild variant="outline" className="h-10">
							<Link href="/pricing">
								{t("pricing")}
								<ArrowRight className="ml-2 h-4 w-4" />
							</Link>
						</Button>
						<Button asChild variant="ghost" className="h-10 sm:px-3">
							<Link href="https://phaseo.app" target="_blank" rel="noopener noreferrer">
								<BookOpen className="mr-2 h-4 w-4" />
								{t("documentation")}
							</Link>
						</Button>
					</div>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="space-y-7 animate-in fade-in-0 slide-in-from-bottom-2 duration-700">
					<SectionTitle
						eyebrow={t("howItWorks")}
						title={t("howItWorksTitle")}
						description={t("howItWorksDescription")}
					/>

					<ol className="relative space-y-4 before:absolute before:left-4 before:top-4 before:h-[calc(100%-2rem)] before:w-px before:bg-zinc-200 dark:before:bg-zinc-800">
						{platformFlow.map((item, idx) => {
							const Icon = platformFlowLinks[idx].icon;
							return (
									<li key={platformFlowLinks[idx].href} className="relative pl-11">
									<div className="absolute left-0 top-2 flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
										<Icon className="h-4 w-4" />
									</div>
									<Card className="border-zinc-200/70 bg-white/75 dark:border-zinc-800/70 dark:bg-zinc-950/60">
										<CardHeader className="space-y-2 pb-3">
											<div className="flex flex-wrap items-center justify-between gap-3">
												<CardTitle className="text-base">{item.title}</CardTitle>
												<Badge variant="outline" className="text-[11px]">
												{t("step", { number: idx + 1 })}
												</Badge>
											</div>
											<p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
										</CardHeader>
										<CardContent className="pt-0">
											<ul className="space-y-2 text-sm text-muted-foreground">
												{item.points.map((point) => (
													<li key={point} className="flex items-start gap-2">
														<span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500/70" />
														<span>{point}</span>
													</li>
												))}
											</ul>
											<div className="mt-4">
												<Button asChild variant="ghost" className="h-9 px-2 -ml-2">
												<Link href={platformFlowLinks[idx].href}>{t("openItem", { title: item.title })}</Link>
												</Button>
											</div>
										</CardContent>
									</Card>
								</li>
							);
						})}
					</ol>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="space-y-7 animate-in fade-in-0 slide-in-from-bottom-2 duration-700">
					<SectionTitle
						eyebrow={t("whatWeBuild")}
						title={t("whatWeBuildTitle")}
						description={t("whatWeBuildDescription")}
					/>

					<div className="space-y-4">
						{offerings.map((item, idx) => {
							const Icon = offeringLinks[idx].icon;
							return (
								<Card key={offeringLinks[idx].href} className="border-zinc-200/70 bg-white/75 dark:border-zinc-800/70 dark:bg-zinc-950/60">
									<CardContent className="grid gap-4 p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center">
										<div className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200/70 bg-white dark:border-zinc-800/70 dark:bg-zinc-950">
											<Icon className="h-4 w-4 text-foreground" />
										</div>
										<div className="space-y-2">
											<h3 className="text-base font-semibold text-foreground">{item.title}</h3>
											<p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
											<div className="flex flex-wrap gap-2">
											{item.badges.map((badge) => (
													<Badge key={badge} variant="secondary" className="text-[11px]">
														{badge}
													</Badge>
												))}
											</div>
										</div>
										<Button asChild variant="outline" className="justify-between">
										<Link href={offeringLinks[idx].href}>
												{t("open")}
												<ArrowRight className="h-4 w-4" />
											</Link>
										</Button>
									</CardContent>
								</Card>
							);
						})}
					</div>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="space-y-7 animate-in fade-in-0 slide-in-from-bottom-2 duration-700">
					<SectionTitle
						eyebrow={t("pricingSection.eyebrow" as never)}
						title={t("pricingSection.title" as never)}
						description={t("pricingSection.description" as never)}
					/>

					<div className="grid gap-4 md:grid-cols-2">
						<Card className="border-zinc-200/70 bg-white/75 dark:border-zinc-800/70 dark:bg-zinc-950/60">
							<CardHeader className="space-y-2">
								<div className="flex items-center gap-2 text-sm font-semibold text-foreground">
									<Wallet className="h-4 w-4" />
									{t("pricing")}
								</div>
								<p className="text-sm leading-6 text-muted-foreground">
									{t("pricingSection.platformDescription" as never)}
								</p>
							</CardHeader>
							<CardContent className="pt-0">
								<ResourceButton href="/pricing" label={`${t("open")} ${t("pricing")}`} />
							</CardContent>
						</Card>

						<Card className="border-zinc-200/70 bg-white/75 dark:border-zinc-800/70 dark:bg-zinc-950/60">
							<CardHeader className="space-y-2">
								<div className="flex items-center gap-2 text-sm font-semibold text-foreground">
									<LineChart className="h-4 w-4" />
									{t("pricingSection.modelToolsTitle" as never)}
								</div>
								<p className="text-sm leading-6 text-muted-foreground">
									{t("pricingSection.modelToolsDescription" as never)}
								</p>
							</CardHeader>
							<CardContent className="pt-0 space-y-2">
								<ResourceButton href="/tools/pricing-calculator" label={`${t("open")} ${t("pricingSection.calculator" as never)}`} />
								<ResourceButton href="/models" label={t("exploreModels")} variant="ghost" />
							</CardContent>
						</Card>
					</div>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="grid gap-6 lg:grid-cols-[1fr_0.92fr] lg:items-start animate-in fade-in-0 slide-in-from-bottom-2 duration-700">
					<div className="space-y-6">
						<SectionTitle
							eyebrow={company.sectionLabel}
							title={company.title}
							description={company.description}
						/>

						<div className="grid gap-4 sm:grid-cols-2">
							<Card className="border-zinc-200/70 bg-white/75 dark:border-zinc-800/70 dark:bg-zinc-950/60">
								<CardHeader className="space-y-2">
									<div className="flex items-center gap-2 text-sm font-semibold text-foreground">
										<Sparkles className="h-4 w-4" />
										{company.openTitle}
									</div>
									<p className="text-sm leading-6 text-muted-foreground">
										{company.openDescription}
									</p>
								</CardHeader>
							</Card>

							<Card className="border-zinc-200/70 bg-white/75 dark:border-zinc-800/70 dark:bg-zinc-950/60">
								<CardHeader className="space-y-2">
									<div className="flex items-center gap-2 text-sm font-semibold text-foreground">
										<GitBranch className="h-4 w-4" />
										{company.lifecycleTitle}
									</div>
									<p className="text-sm leading-6 text-muted-foreground">
										{company.lifecycleDescription}
									</p>
								</CardHeader>
							</Card>

							<Card className="border-zinc-200/70 bg-white/75 dark:border-zinc-800/70 dark:bg-zinc-950/60 sm:col-span-2">
								<CardHeader className="space-y-2">
									<div className="flex items-center gap-2 text-sm font-semibold text-foreground">
										<ShieldCheck className="h-4 w-4" />
										{company.operationsTitle}
									</div>
									<p className="text-sm leading-6 text-muted-foreground">
										{company.operationsDescription}
									</p>
								</CardHeader>
							</Card>
						</div>
					</div>

					<Card className="border-zinc-200/70 bg-white/75 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950/60">
						<CardHeader className="space-y-2">
							<CardTitle className="text-base">{company.resourcesTitle}</CardTitle>
							<p className="text-sm leading-6 text-muted-foreground">
								{company.resourcesDescription}
							</p>
						</CardHeader>
							<CardContent className="grid gap-3">
								{resourceLinks.map((resource) => <ResourceButton key={resource.key} href={resource.href.startsWith("https://phaseo.app/docs/") ? getLocalizedDocsHref(locale, resource.href) : resource.href} label={resources[resource.key]} external={"external" in resource} />)}
							<Separator className="my-1 bg-zinc-200/70 dark:bg-zinc-800/70" />
							<div className="grid gap-2 sm:grid-cols-2">
								<ResourceButton href="/terms" label={resources.terms} variant="ghost" />
								<ResourceButton href="/privacy" label={resources.privacy} variant="ghost" />
							</div>
							<ResourceButton href="https://github.com/phaseoteam/Phaseo" label="GitHub" external variant="ghost" />
						</CardContent>
					</Card>
				</section>
			</div>
		</main>
	);
}
