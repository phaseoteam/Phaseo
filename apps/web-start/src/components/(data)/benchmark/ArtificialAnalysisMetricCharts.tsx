"use client";
import { localizedBenchmarkConfiguration, localizedArtificialAnalysisMetric } from "@/i18n/benchmark-display";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { useState } from "react";
import Image from "next/image";
import { ArrowUpRight, BrainCircuit, Bot, CircleDollarSign, Code2, Gauge, Search } from "lucide-react";
import { artificialAnalysisChartColour, artificialAnalysisMetricKey, artificialAnalysisMetrics, formatArtificialAnalysisScore } from "@/lib/benchmarks/artificialAnalysis";
import type { PublicBenchmarkRanking, PublicBenchmarkRankingEntry } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { ArtificialAnalysisLogo } from "@/components/ArtificialAnalysisLogo";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { parseEpochConfidenceInterval } from "@/lib/benchmarks/epoch";

const metricIcons = {
	intelligence: BrainCircuit,
	coding: Code2,
	agentic: Bot,
	cost: CircleDollarSign,
	epoch: Gauge,
};

type MetricDefinition = { id: string; key: keyof typeof metricIcons; label: string; description: string };

const DEFAULT_VISIBLE_MODELS = 14;

function contrastingTextColour(background: string) {
	const channels = [0, 2, 4].map((offset) => Number.parseInt(background.slice(offset + 1, offset + 3), 16) / 255).map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
	const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
	const darkContrast = (luminance + 0.05) / 0.065;
	const lightContrast = 1.05 / (luminance + 0.05);
	return darkContrast >= lightContrast ? "#111827" : "#ffffff";
}

function releaseDate(value: string | null | undefined, locale: string, unavailable: string) {
	if (!value) return unavailable;
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? unavailable
		: new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function configurationLabel(value: string | null | undefined, tx: { (key: never): string }) {
	if (!value) return null;
	const match = value.match(/\(([^)]*)\)/)?.[1] ?? value;
	if (/non-reasoning/i.test(match)) return localizedBenchmarkConfiguration("none", tx);
	if (/max/i.test(match)) return localizedBenchmarkConfiguration("max", tx);
	const effort = match.match(/\b(low|medium|high|xhigh)\b/i)?.[1];
	return effort ? localizedBenchmarkConfiguration(effort, tx) : null;
}

function sortEntries(ranking: PublicBenchmarkRanking, entries: PublicBenchmarkRankingEntry[]) {
	return [...entries].sort((left, right) => {
		const difference = left.score - right.score;
		return ranking.lower_is_better ? difference : -difference;
	});
}

function MetricChart({
	ranking,
	metric,
	showAll,
	query,
}: {
	ranking: PublicBenchmarkRanking | null;
	metric: MetricDefinition;
	showAll: boolean;
	query: string;
}) {
	const tx = useTranslations();
	const locale = useLocale();
	const MetricIcon = metricIcons[metric.key];
	const entries = ranking?.entries ?? [];
	const filteredEntries = entries.filter((entry) =>
		`${entry.model_name} ${entry.organisation_name ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
	);
	const sortedEntries = ranking ? sortEntries(ranking, filteredEntries) : [];
	const visibleEntries = showAll ? sortedEntries : sortedEntries.slice(0, DEFAULT_VISIBLE_MODELS);
	const scores = visibleEntries.flatMap((entry) => {
		const interval = metric.key === "epoch" ? parseEpochConfidenceInterval(entry.other_info) : null;
		return interval ? [entry.score, interval.low, interval.high] : [entry.score];
	}).filter(Number.isFinite);
	const rawMinimum = Math.min(...scores);
	const rawMaximum = Math.max(...scores);
	const rawRange = Math.max(rawMaximum - rawMinimum, Math.abs(rawMaximum) * 0.04, 1);
	const domainPadding = rawRange * 0.08;
	const minimum = rawMinimum - domainPadding;
	const maximum = rawMaximum + domainPadding;
	const range = maximum - minimum;
	const chartHeight = 182;
	const heightFor = (value: number) => Math.max(24, Math.min(chartHeight, ((value - minimum) / range) * 158 + 24));

	return (
		<section className="min-w-0 border-t border-border/70 pt-5" aria-labelledby={`${metric.key}-chart-title`}>
			<div className="flex items-start justify-between gap-3">
				<div className="flex min-w-0 items-start gap-2.5">
					<span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/60">
						<MetricIcon className="size-4 text-muted-foreground" />
					</span>
					<div className="min-w-0">
						<h3 id={`${metric.key}-chart-title`} className="font-semibold">{metric.label}</h3>
						<p className="mt-0.5 text-xs text-muted-foreground">{metric.description} · {ranking?.lower_is_better ? tx("Common.ui.benchmarkComparison.lowerIsBetter" as never) : tx("Common.ui.modelCreation.form.higherIsBetter" as never)}</p>
					</div>
				</div>
				{ranking ? <Link href={`/benchmarks/${ranking.benchmark_id}#model-results`} className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground">{tx("Common.ui.benchmarkChartCopy.fullLeaderboard" as never)} <ArrowUpRight className="size-3.5" /></Link> : null}
			</div>

			{visibleEntries.length ? (
				<TooltipProvider delayDuration={120}><ScrollArea className="mt-4 w-full" scrollBarOrientation="horizontal" keepScrollbarMounted viewportClassName="pb-4" data-testid={`${metric.key}-chart`}>
					<div className="relative h-[304px]" style={{ minWidth: "100%", width: `${Math.max(visibleEntries.length * 56 + 96, 520)}px` }}>
						<div className="pointer-events-none absolute inset-x-12 bottom-[112px] top-3 flex flex-col justify-between">
							{[0, 1, 2, 3].map((line) => <span key={line} className="border-t border-dashed border-border/70" />)}
						</div>
						<div className="absolute inset-x-12 bottom-0 top-3 flex items-start gap-2">
							{visibleEntries.map((entry) => {
								const plottedScore = ranking?.lower_is_better ? maximum - entry.score + minimum : entry.score;
								const height = heightFor(plottedScore);
								const configuration = configurationLabel(entry.other_info, tx);
								const colour = artificialAnalysisChartColour(entry.organisation_id, entry.organisation_colour);
								const isOpenAI = entry.organisation_id === "openai";
								const interval = metric.key === "epoch" ? parseEpochConfidenceInterval(entry.other_info) : null;
								const intervalLow = interval ? heightFor(interval.low) : null;
								const intervalHigh = interval ? heightFor(interval.high) : null;
								const intervalLabel = interval ? `, ${tx("Catalogue.benchmarks.confidenceInterval", { low: interval.low.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), high: interval.high.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })}` : "";
								return (
									<div key={`${entry.model_id}-${entry.score}-${entry.rank}`} className="group flex w-12 shrink-0 cursor-default flex-col items-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" tabIndex={0} aria-label={tx("Common.ui.benchmarkChartCopy.modelScoreintervalRankRankReleasedDate", { model: entry.model_name, score: formatArtificialAnalysisScore(ranking?.benchmark_id ?? metric.id, entry.score, locale), interval: intervalLabel, rank: entry.rank, date: releaseDate(entry.release_date, locale, tx("Common.ui.benchmarkChartCopy.releaseDateUnavailable" as never)) })}>
										<div className="relative flex h-[182px] w-full items-end justify-center border-b border-border/80">
											<Tooltip>
												<TooltipTrigger asChild><span className={`relative flex w-8 items-start justify-center rounded-t-[3px] pt-2 text-[10px] font-semibold tabular-nums shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)] outline-none transition-[height,filter,box-shadow,transform] duration-200 group-hover:-translate-y-0.5 group-hover:brightness-125 group-hover:ring-2 group-hover:ring-foreground/70 group-focus-visible:ring-2 group-focus-visible:ring-ring sm:w-9 ${isOpenAI ? "bg-black text-white" : ""}`} style={{ height: `${height}px`, backgroundColor: isOpenAI ? undefined : colour, color: isOpenAI ? undefined : contrastingTextColour(colour) }}>
													{formatArtificialAnalysisScore(ranking?.benchmark_id ?? metric.id, entry.score, locale)}
												</span></TooltipTrigger>
												<TooltipContent className="block min-w-44 space-y-1 px-3 py-2.5">
													<p className="font-semibold">{entry.model_name}</p>
													<p className="flex justify-between gap-5"><span className="opacity-70">{tx("Common.ui.modelEditor.score" as never)}</span><span className="font-medium tabular-nums">{formatArtificialAnalysisScore(ranking?.benchmark_id ?? metric.id, entry.score, locale)}</span></p>
													{interval ? <p className="flex justify-between gap-5"><span className="opacity-70">{tx("Catalogue.benchmarks.current.confidence")}</span><span className="tabular-nums">{interval.low.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}–{interval.high.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></p> : null}
													<p className="flex justify-between gap-5"><span className="opacity-70">{tx("Site.homeQuickstart.rank" as never)}</span><span>#{entry.rank}</span></p>
													<p className="flex justify-between gap-5"><span className="opacity-70">{tx("Common.ui.modelEditor.modelStatuses.released" as never)}</span><span>{releaseDate(entry.release_date, locale, tx("Common.ui.benchmarkChartCopy.releaseDateUnavailable" as never))}</span></p>
												</TooltipContent>
											</Tooltip>
											{interval && intervalLow !== null && intervalHigh !== null ? <span className="pointer-events-none absolute left-1/2 z-10 w-px -translate-x-1/2 bg-foreground" style={{ bottom: `${intervalLow}px`, height: `${Math.max(intervalHigh - intervalLow, 2)}px` }} title={tx("Catalogue.benchmarks.confidenceInterval", { low: interval.low.toLocaleString(locale), high: interval.high.toLocaleString(locale) })}><span className="absolute -left-1.5 top-0 h-px w-3 bg-foreground" /><span className="absolute -bottom-px -left-1.5 h-px w-3 bg-foreground" /><span className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-background bg-foreground" /></span> : null}
										</div>
										<span className="relative my-1 size-4 shrink-0"><Logo id={entry.organisation_id ?? entry.model_id} alt="" fill className="object-contain" /></span>
										<div className="relative h-[104px] w-full"><Link href={`/models/${entry.model_id}`} className="absolute right-1/2 top-0 line-clamp-2 w-24 origin-top-right -rotate-[55deg] whitespace-normal break-words text-right text-[10px] leading-[1.15] decoration-transparent underline-offset-2 hover:underline hover:decoration-current focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{entry.model_name}{configuration ? <span className="text-muted-foreground"> ({configuration})</span> : null}</Link></div>
									</div>
								);
							})}
						</div>
					</div>
				</ScrollArea></TooltipProvider>
			) : <p className="mt-4 flex h-32 items-center justify-center border border-dashed text-sm text-muted-foreground">{entries.length ? tx("Common.ui.benchmarkChartCopy.noModelsMatchThisSearch" as never) : tx("Common.ui.benchmarkChartCopy.noResultsAvailableForThisMetric" as never)}</p>}

			<p className="mt-1 text-xs text-muted-foreground">{tx("Common.ui.benchmarkChartCopy.showingShownOfTotalModels", { shown: visibleEntries.length, total: filteredEntries.length })}</p>
		</section>
	);
}

export default function ArtificialAnalysisMetricCharts({ rankings, variant = "artificial-analysis" }: { rankings: PublicBenchmarkRanking[]; variant?: "artificial-analysis" | "epoch" }) {
	const tx = useTranslations();
	const [query, setQuery] = useState("");
	const [showAll, setShowAll] = useState(false);
	const epoch = variant === "epoch";
	const metrics: MetricDefinition[] = epoch
		? [{ id: "epoch-capabilities-index", key: "epoch", label: "Capabilities Index", description: tx("Common.ui.benchmarkChartCopy.frontierAICapability" as never) }]
		: artificialAnalysisMetrics.map((metric) => localizedArtificialAnalysisMetric(metric, tx));
	const title = epoch ? tx("Catalogue.benchmarks.tocIndexLeaderboard" as never) : tx("Catalogue.benchmarks.tocIndexComparisons" as never);
	const description = epoch ? tx("Common.ui.benchmarkChartCopy.compareEpochAICapabilitiesIndexScoresAcrossTheCurrentModelSet" as never) : tx("Common.ui.benchmarkChartCopy.compareTheFourArtificialAnalysisMeasuresAcrossTheModelsInTheCurrentIndex" as never);
	const titleId = epoch ? "epoch-index-leaderboard-title" : "aa-metric-comparisons-title";

	return (
		<section id="comparisons" className="scroll-mt-36 space-y-5" aria-labelledby={titleId}>
			<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<div className="flex items-center gap-2.5">{epoch ? <><Image src="/benchmarks/epoch-ai.svg" alt="Epoch AI" width={150} height={26} className="h-[22px] w-auto dark:hidden" /><Image src="/benchmarks/epoch-ai_dark.svg" alt="" aria-hidden="true" width={150} height={26} className="hidden h-[22px] w-auto dark:block" /></> : <ArtificialAnalysisLogo size={26} />}<h2 id={titleId} className="text-xl font-semibold">{title}</h2></div>
					<p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
				</div>
				<div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
					<div className="relative sm:w-56"><Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input aria-label={tx("Common.ui.benchmarkChartCopy.filterBrandModels", { brand: epoch ? "Epoch AI" : "Artificial Analysis" })} placeholder={tx("Catalogue.benchmarks.filterModels" as never)} value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" /></div>
					<Button type="button" variant="outline" size="sm" onClick={() => setShowAll((value) => !value)}>{showAll ? tx("Common.ui.rankings.showTop", { count: DEFAULT_VISIBLE_MODELS }) : tx("Common.ui.benchmarkChartCopy.showAllModels" as never)}</Button>
				</div>
			</div>
			<div className={`grid gap-x-8 gap-y-8 ${epoch ? "grid-cols-1" : "lg:grid-cols-2"}`}>
				{metrics.map((metric) => <MetricChart key={metric.key} metric={metric} ranking={epoch ? rankings[0] ?? null : rankings.find((ranking) => artificialAnalysisMetricKey(ranking.benchmark_id) === metric.key) ?? null} showAll={showAll} query={query} />)}
			</div>
		</section>
	);
}
