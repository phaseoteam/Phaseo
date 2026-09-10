"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, BrainCircuit, Bot, CircleDollarSign, Code2, Search } from "lucide-react";
import { artificialAnalysisMetricKey, artificialAnalysisMetrics, formatArtificialAnalysisScore } from "@/lib/benchmarks/artificialAnalysis";
import type { PublicBenchmarkRanking, PublicBenchmarkRankingEntry } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { ArtificialAnalysisLogo } from "@/components/ArtificialAnalysisLogo";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const metricIcons = {
	intelligence: BrainCircuit,
	coding: Code2,
	agentic: Bot,
	cost: CircleDollarSign,
};

const DEFAULT_VISIBLE_MODELS = 14;

function safeColour(value: string | null | undefined) {
	return value && /^#[\da-f]{6}$/i.test(value) ? value : "#6b7280";
}

function contrastingTextColour(background: string) {
	const channels = [0, 2, 4].map((offset) => Number.parseInt(background.slice(offset + 1, offset + 3), 16) / 255).map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
	const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
	const darkContrast = (luminance + 0.05) / 0.065;
	const lightContrast = 1.05 / (luminance + 0.05);
	return darkContrast >= lightContrast ? "#111827" : "#ffffff";
}

function releaseDate(value: string | null | undefined) {
	if (!value) return "Release date unavailable";
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? "Release date unavailable"
		: new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function configurationLabel(value: string | null | undefined) {
	if (!value) return null;
	const match = value.match(/\(([^)]*)\)/)?.[1] ?? value;
	if (/non-reasoning/i.test(match)) return "Non-reasoning";
	if (/max/i.test(match)) return "Max";
	const effort = match.match(/\b(low|medium|high|xhigh)\b/i)?.[1];
	return effort ? effort.charAt(0).toUpperCase() + effort.slice(1).toLowerCase() : null;
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
	metric: (typeof artificialAnalysisMetrics)[number];
	showAll: boolean;
	query: string;
}) {
	const MetricIcon = metricIcons[metric.key];
	const entries = ranking?.entries ?? [];
	const filteredEntries = entries.filter((entry) =>
		`${entry.model_name} ${entry.organisation_name ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
	);
	const sortedEntries = ranking ? sortEntries(ranking, filteredEntries) : [];
	const visibleEntries = showAll ? sortedEntries : sortedEntries.slice(0, DEFAULT_VISIBLE_MODELS);
	const scores = visibleEntries.map((entry) => entry.score).filter(Number.isFinite);
	const minimum = Math.min(...scores, 0);
	const maximum = Math.max(...scores, 1);
	const range = Math.max(maximum - minimum, 1);

	return (
		<section className="min-w-0 border-t border-border/70 pt-5" aria-labelledby={`${metric.key}-chart-title`}>
			<div className="flex items-start justify-between gap-3">
				<div className="flex min-w-0 items-start gap-2.5">
					<span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/60">
						<MetricIcon className="size-4 text-muted-foreground" />
					</span>
					<div className="min-w-0">
						<h3 id={`${metric.key}-chart-title`} className="font-semibold">{metric.label}</h3>
						<p className="mt-0.5 text-xs text-muted-foreground">{metric.description} · {ranking?.lower_is_better ? "Lower is better" : "Higher is better"}</p>
					</div>
				</div>
				{ranking ? <Link href={`/benchmarks/${ranking.benchmark_id}#model-results`} className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground">Full leaderboard <ArrowUpRight className="size-3.5" /></Link> : null}
			</div>

			{visibleEntries.length ? (
				<div className="mt-4 overflow-x-auto pb-2" data-testid={`${metric.key}-chart`}>
					<div className="relative h-[278px]" style={{ minWidth: "100%", width: `${Math.max(visibleEntries.length * 52 + 112, 520)}px` }}>
						<div className="pointer-events-none absolute inset-x-12 bottom-[112px] top-3 flex flex-col justify-between">
							{[0, 1, 2, 3].map((line) => <span key={line} className="border-t border-dashed border-border/70" />)}
						</div>
						<div className="absolute inset-x-12 bottom-0 top-3 flex items-end gap-1.5">
							{visibleEntries.map((entry) => {
								const height = ranking?.lower_is_better
									? ((maximum - entry.score) / range) * 158 + 24
									: ((entry.score - minimum) / range) * 158 + 24;
								const configuration = configurationLabel(entry.other_info);
								const colour = safeColour(entry.organisation_colour);
								return (
									<div key={`${entry.model_id}-${entry.score}-${entry.rank}`} className="group flex h-full min-w-11 flex-1 basis-11 cursor-default flex-col items-center justify-end rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" tabIndex={0} aria-label={`${entry.model_name}, ${formatArtificialAnalysisScore(ranking?.benchmark_id ?? metric.id, entry.score)}, rank ${entry.rank}, released ${releaseDate(entry.release_date)}`}>
										<span className="relative flex w-8 items-end justify-center rounded-t-[3px] pb-2 text-[10px] font-semibold tabular-nums shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)] transition-[height,filter] duration-300 group-hover:brightness-110 sm:w-9" style={{ height: `${Math.max(height, 3)}px`, backgroundColor: colour, color: contrastingTextColour(colour) }} title={`${entry.model_name} · ${releaseDate(entry.release_date)} · ${configuration ?? "Default"}`}>
											{formatArtificialAnalysisScore(ranking?.benchmark_id ?? metric.id, entry.score)}
										</span>
										<span className="relative my-1 size-4 shrink-0"><Logo id={entry.organisation_id ?? entry.model_id} alt="" fill className="object-contain" /></span>
										<div className="relative h-[104px] w-full"><Link href={`/models/${entry.model_id}`} className="absolute right-1/2 top-0 line-clamp-2 w-24 origin-top-right -rotate-[55deg] whitespace-normal break-words text-right text-[10px] leading-[1.15] decoration-transparent underline-offset-2 hover:underline hover:decoration-current focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{entry.model_name}{configuration ? <span className="text-muted-foreground"> ({configuration})</span> : null}</Link></div>
									</div>
								);
							})}
						</div>
					</div>
				</div>
			) : <p className="mt-4 flex h-32 items-center justify-center border border-dashed text-sm text-muted-foreground">{entries.length ? "No models match this search." : "No results available for this metric."}</p>}

			<p className="mt-1 text-xs text-muted-foreground">Showing {visibleEntries.length.toLocaleString()} of {filteredEntries.length.toLocaleString()} models</p>
		</section>
	);
}

export default function ArtificialAnalysisMetricCharts({ rankings }: { rankings: PublicBenchmarkRanking[] }) {
	const [query, setQuery] = useState("");
	const [showAll, setShowAll] = useState(true);

	return (
		<section id="comparisons" className="scroll-mt-36 space-y-5" aria-labelledby="aa-metric-comparisons-title">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<div className="flex items-center gap-2.5"><ArtificialAnalysisLogo size={26} /><h2 id="aa-metric-comparisons-title" className="text-xl font-semibold">Index comparisons</h2></div>
					<p className="mt-1 max-w-2xl text-sm text-muted-foreground">Compare the four Artificial Analysis measures across the models in the current index.</p>
				</div>
				<div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
					<div className="relative sm:w-56"><Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input aria-label="Filter Artificial Analysis models" placeholder="Filter models" value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" /></div>
					<Button type="button" variant="outline" size="sm" onClick={() => setShowAll((value) => !value)}>{showAll ? `Show top ${DEFAULT_VISIBLE_MODELS}` : "Show all models"}</Button>
				</div>
			</div>
			<div className="grid gap-x-8 gap-y-8 lg:grid-cols-2">
				{artificialAnalysisMetrics.map((metric) => <MetricChart key={metric.key} metric={metric} ranking={rankings.find((ranking) => artificialAnalysisMetricKey(ranking.benchmark_id) === metric.key) ?? null} showAll={showAll} query={query} />)}
			</div>
		</section>
	);
}
