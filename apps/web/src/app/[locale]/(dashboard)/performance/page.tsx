import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart3, Check, Clock3, Gauge, Route, ShieldCheck, Sparkles } from "lucide-react";

import ShowFooterStyle from "@/components/layout/ShowFooterStyle";
import { Button } from "@/components/ui/button";
import { getLocale, getTranslations } from "next-intl/server";
import { buildLocalizedPageMetadata } from "@/lib/auth/localized-metadata";
import type { PublicLocale } from "@/i18n/routing";
import TokenSpeedSimulation from "./TokenSpeedSimulation";

const metrics = [
	{
		index: "01",
		nameKey: "timeToFirstToken",
		unit: "ms",
		descriptionKey: "timeToFirstTokenDescription",
		goodForKey: "timeToFirstTokenGoodFor",
		icon: Clock3,
	},
	{
		index: "02",
		nameKey: "outputSpeed",
		unit: "tokens/s",
		descriptionKey: "outputSpeedDescription",
		goodForKey: "outputSpeedGoodFor",
		icon: Gauge,
	},
	{
		index: "03",
		nameKey: "endToEndLatency",
		unit: "ms",
		descriptionKey: "endToEndLatencyDescription",
		goodForKey: "endToEndLatencyGoodFor",
		icon: Route,
	},
];

const profiles = [
	{ nameKey: "instantInteraction", noteKey: "optimiseStart", latency: 22, throughput: 62, reliability: 92 },
	{ nameKey: "balancedProduct", noteKey: "optimiseWholeRequest", latency: 48, throughput: 54, reliability: 88 },
	{ nameKey: "heavyReasoning", noteKey: "optimiseUsefulWork", latency: 84, throughput: 34, reliability: 82 },
];

const latencyJourney = [
	{ labelKey: "phaseoRouting", value: 38, width: 13, tone: "bg-sky-500" },
	{ labelKey: "providerQueue", value: 76, width: 25, tone: "bg-amber-500" },
	{ labelKey: "firstToken", value: 188, width: 62, tone: "bg-foreground" },
];

const uptimeBudgets = [
	{ availability: "99.9%", monthly: "43m 50s", yearly: "8h 46m", width: 100 },
	{ availability: "99.95%", monthly: "21m 55s", yearly: "4h 23m", width: 50 },
	{ availability: "99.99%", monthly: "4m 23s", yearly: "52m 36s", width: 10 },
];

const decisions = [
	{
		titleKey: "conversationalTitle",
		answerKey: "conversationalAnswer",
		detailKey: "conversationalDetail",
	},
	{
		titleKey: "longAnswersTitle",
		answerKey: "longAnswersAnswer",
		detailKey: "longAnswersDetail",
	},
	{
		titleKey: "toolsTitle",
		answerKey: "toolsAnswer",
		detailKey: "toolsDetail",
	},
];

export async function generateMetadata(): Promise<Metadata> {
	const locale = await getLocale();
	const t = await getTranslations("Catalogue.performance");
	return buildLocalizedPageMetadata({
		locale: locale as PublicLocale,
		pathname: "/performance",
		title: t("title"),
		description: t("description"),
		keywords: ["AI model performance", "LLM latency", "LLM throughput", "AI model reliability"],
	});
}

export default async function PerformancePage() {
	const t = await getTranslations("Catalogue.performance");
	const translate = (key: string) => t(key as never);
	return (
		<main className="min-h-screen overflow-hidden bg-background">
			<ShowFooterStyle />
			<section className="relative border-b border-border/70">
				<div
					className="pointer-events-none absolute inset-0 opacity-40 dark:opacity-20"
					style={{
						backgroundImage:
							"linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
						backgroundSize: "48px 48px",
						maskImage: "linear-gradient(to bottom, black, transparent 90%)",
					}}
				/>
				<div className="relative mx-auto grid w-full max-w-7xl gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[minmax(0,1fr)_25rem] lg:items-end lg:px-8">
					<div className="max-w-3xl">
						<h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-[-0.045em] sm:text-6xl lg:text-7xl">
							{t("heroTitle")}
						</h1>
						<p className="mt-6 max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
							{t("heroDescription")}
						</p>
						<div className="mt-8 flex flex-wrap gap-3">
							<Button className="rounded-md" asChild><Link href="/compare">{t("compareModels")} <ArrowRight /></Link></Button>
							<Button className="rounded-md" variant="outline" asChild><Link href="/how-phaseo-measures-latency-throughput">{t("methodology")}</Link></Button>
						</div>
					</div>
					<div className="border-l border-border/70 pl-6 lg:pb-2">
						<p className="text-sm font-medium text-muted-foreground">{t("viewAsks")}</p>
						<ol className="mt-5 space-y-4 text-sm">
							{[t("askStart"), t("askResult"), t("askSuccess")].map((item, index) => (
								<li key={item} className="flex items-start gap-3">
									<span className="mt-0.5 font-mono text-xs text-muted-foreground">0{index + 1}</span>
									<span className="font-medium">{item}</span>
								</li>
							))}
						</ol>
					</div>
				</div>
			</section>

			<PageSection intro={{ title: t("measuresTitle"), description: t("measuresDescription") }}>
				<div className="border-y border-border/70">
					{metrics.map((metric) => {
						const Icon = metric.icon;
						return (
							<article key={metric.nameKey} className="group grid gap-5 border-b border-border/70 py-7 last:border-b-0 sm:grid-cols-[3rem_minmax(0,1fr)_9rem]">
								<div className="flex size-10 items-center justify-center rounded-md border border-border/70 bg-muted/30 text-muted-foreground transition-colors group-hover:text-foreground"><Icon className="size-4" /></div>
								<div>
									<div className="flex flex-wrap items-baseline gap-3"><h2 className="text-xl font-semibold tracking-tight">{translate(metric.nameKey)}</h2><span className="font-mono text-xs text-muted-foreground">{metric.unit}</span></div>
									<p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{translate(metric.descriptionKey)}</p>
								</div>
								<div className="sm:text-right"><p className="font-mono text-xs text-muted-foreground">{metric.index}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{translate(metric.goodForKey)}</p></div>
							</article>
						);
					})}
				</div>
			</PageSection>

			<div className="border-y border-border/70 bg-muted/20">
				<PageSection intro={{ title: t("watchTitle"), description: t("watchDescription") }}>
					<TokenSpeedSimulation />
				</PageSection>
			</div>

			<div className="border-y border-border/70 bg-muted/20">
				<PageSection intro={{ title: t("experienceTitle"), description: t("experienceDescription") }}>
					<div className="overflow-hidden rounded-md border border-border/70 bg-background">
						<div className="hidden grid-cols-[minmax(11rem,1fr)_repeat(3,minmax(7rem,0.7fr))] border-b border-border/70 bg-muted/30 px-5 py-3 text-xs font-medium text-muted-foreground sm:grid">
							<span>{t("productProfile")}</span><span>{t("startLatency")}</span><span>{t("throughput")}</span><span>{t("reliability")}</span>
						</div>
						{profiles.map((profile) => (
							<div key={profile.nameKey} className="grid gap-5 border-b border-border/70 px-5 py-6 last:border-b-0 sm:grid-cols-[minmax(11rem,1fr)_repeat(3,minmax(7rem,0.7fr))] sm:items-center">
								<div><h3 className="font-medium">{translate(profile.nameKey)}</h3><p className="mt-1 text-xs text-muted-foreground">{translate(profile.noteKey)}</p></div>
								<MetricBar label={t("startLatency")} value={profile.latency} inverse />
								<MetricBar label={t("throughput")} value={profile.throughput} />
								<MetricBar label={t("reliability")} value={profile.reliability} />
							</div>
						))}
						<div className="flex items-start gap-2 border-t border-border/70 bg-muted/20 px-5 py-3 text-xs leading-5 text-muted-foreground"><Sparkles className="mt-0.5 size-3.5 shrink-0" />{t("tradeoffsNote")}</div>
					</div>
				</PageSection>
			</div>

			<PageSection intro={{ title: t("waitTitle"), description: t("waitDescription") }}>
				<div className="grid overflow-hidden rounded-md border border-border/70 bg-background lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
					<div className="border-b border-border/70 p-6 lg:border-b-0 lg:border-r">
						<div className="flex items-end justify-between gap-4">
							<div><p className="text-sm font-medium">{t("requestJourney")}</p><p className="mt-1 text-xs text-muted-foreground">{t("browserToToken")}</p></div>
							<p className="font-mono text-2xl font-semibold">302 ms</p>
						</div>
						<div className="mt-10 flex h-12 overflow-hidden rounded-md border border-border/70">
							{latencyJourney.map((stage) => <div key={stage.labelKey} className={`${stage.tone} h-full border-r border-background/40 last:border-r-0`} style={{ width: `${stage.width}%` }} />)}
						</div>
						<div className="mt-5 grid gap-3 sm:grid-cols-3">
							{latencyJourney.map((stage) => (
								<div key={stage.labelKey} className="border-l-2 border-border pl-3"><p className="text-xs text-muted-foreground">{translate(stage.labelKey)}</p><p className="mt-1 font-mono text-sm font-medium">{stage.value} ms</p></div>
							))}
						</div>
					</div>
					<div className="flex flex-col justify-between bg-muted/20 p-6">
						<Route className="size-5 text-muted-foreground" />
						<div className="mt-12"><p className="text-lg font-medium">{t("longestStage")}</p><p className="mt-3 text-sm leading-6 text-muted-foreground">{t("longestStageDescription")}</p></div>
					</div>
				</div>
			</PageSection>

			<div className="border-y border-border/70 bg-muted/20">
				<PageSection intro={{ title: t("uptimeTitle"), description: t("uptimeDescription") }}>
					<div className="overflow-hidden rounded-md border border-border/70 bg-background">
						<div className="grid grid-cols-[5rem_minmax(0,1fr)_6rem] gap-4 border-b border-border/70 bg-muted/30 px-5 py-3 text-xs font-medium text-muted-foreground sm:grid-cols-[7rem_minmax(0,1fr)_8rem]">
							<span>{t("availability")}</span><span>{t("monthlyDowntime")}</span><span className="text-right">{t("perYear")}</span>
						</div>
						{uptimeBudgets.map((budget) => (
							<div key={budget.availability} className="grid grid-cols-[5rem_minmax(0,1fr)_6rem] items-center gap-4 border-b border-border/70 px-5 py-6 last:border-b-0 sm:grid-cols-[7rem_minmax(0,1fr)_8rem]">
								<div className="flex items-center gap-2"><ShieldCheck className="hidden size-4 text-emerald-500 sm:block" /><span className="font-mono font-medium">{budget.availability}</span></div>
								<div><div className="h-2 overflow-hidden rounded-md bg-muted"><div className="h-full rounded-md bg-emerald-500" style={{ width: `${budget.width}%` }} /></div><p className="mt-2 font-mono text-xs text-muted-foreground">{budget.monthly}</p></div>
								<p className="text-right font-mono text-xs text-muted-foreground">{budget.yearly}</p>
							</div>
						))}
					</div>
				</PageSection>
			</div>

			<PageSection intro={{ title: t("constraintTitle"), description: t("constraintDescription") }}>
				<div className="grid gap-px overflow-hidden rounded-md border border-border/70 bg-border/70 md:grid-cols-3">
					{decisions.map((decision, index) => (
										<article key={decision.titleKey} className="flex min-h-64 flex-col bg-background p-6">
							<span className="font-mono text-xs text-muted-foreground">0{index + 1}</span>
							<h3 className="mt-8 text-lg font-medium tracking-tight">{translate(decision.titleKey)}</h3>
							<p className="mt-4 flex items-start gap-2 text-sm font-medium"><Check className="mt-0.5 size-4 shrink-0 text-emerald-500" />{translate(decision.answerKey)}</p>
							<p className="mt-auto pt-6 text-sm leading-6 text-muted-foreground">{translate(decision.detailKey)}</p>
						</article>
					))}
				</div>
			</PageSection>

			<section className="border-t border-border/70">
				<div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center lg:px-8">
					<div className="flex items-start gap-4">
						<div className="mt-1 flex size-10 shrink-0 items-center justify-center rounded-md border border-border/70 bg-muted/30"><BarChart3 className="size-4" /></div>
						<div><h2 className="text-2xl font-semibold tracking-tight">{t("frameworkTitle")}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t("frameworkDescription")}</p></div>
					</div>
					<Button className="rounded-md" size="lg" asChild><Link href="/compare">{t("openComparison")} <ArrowRight /></Link></Button>
				</div>
			</section>
		</main>
	);
}

function PageSection({ intro, children }: { intro: { title: string; description: string }; children: React.ReactNode }) {
	return (
		<section className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[16rem_minmax(0,1fr)] lg:px-8">
			<header>
				<h2 className="text-balance text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">{intro.title}</h2>
				<p className="mt-4 text-sm leading-6 text-muted-foreground">{intro.description}</p>
			</header>
			{children}
		</section>
	);
}

function MetricBar({ label, value, inverse = false }: { label: string; value: number; inverse?: boolean }) {
	return (
		<div>
			<div className="mb-2 flex items-center justify-between sm:hidden"><span className="text-xs text-muted-foreground">{label}</span></div>
			<div className="h-1.5 overflow-hidden rounded-md bg-muted"><div className={`h-full rounded-md ${inverse ? "bg-amber-500" : "bg-foreground"}`} style={{ width: `${value}%` }} /></div>
		</div>
	);
}
