"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import NumberFlow from "@number-flow/react";
import Link from "next/link";
import { ArrowUpRight, Bot, BrainCircuit, ChevronsUpDown, CircleDollarSign, Code2, ExternalLink, ListChecks, ListX } from "lucide-react";
import { ArtificialAnalysisLogo } from "@/components/ArtificialAnalysisLogo";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { PublicBenchmarkRanking, PublicBenchmarkRankingEntry } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import type { ModelBenchmarkHighlight, ModelBenchmarkResult } from "@/lib/fetchers/models/getModelBenchmarkData";
import { artificialAnalysisMetricKey, artificialAnalysisMetrics, artificialAnalysisVersion, isArtificialAnalysisBenchmark, isArtificialAnalysisCostBenchmark } from "@/lib/benchmarks/artificialAnalysis";

const configurationOrder = ["none", "low", "medium", "high", "xhigh", "max"];
const metricIcons = {
	intelligence: BrainCircuit,
	coding: Code2,
	agentic: Bot,
	cost: CircleDollarSign,
};

function configurationLabel(value: string | null) {
	if (!value || value === "none") return "Non-reasoning";
	if (value === "xhigh") return "Extra high";
	return value.charAt(0).toUpperCase() + value.slice(1);
}

function safeColour(value: string | null | undefined, fallback: string) {
	return value && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
}

function releaseTime(value: string | null | undefined) {
	if (!value) return Number.NEGATIVE_INFINITY;
	const time = Date.parse(value);
	return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

function formatReleaseDate(value: string | null | undefined) {
	if (!value) return "Release date unavailable";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "Release date unavailable";
	return new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function modelDateDescending(left: PublicBenchmarkRankingEntry, right: PublicBenchmarkRankingEntry) {
	return releaseTime(right.release_date) - releaseTime(left.release_date) || left.model_name.localeCompare(right.model_name);
}

function configurationRank(value: string | null) {
	const index = configurationOrder.indexOf(value || "none");
	return index < 0 ? configurationOrder.length : index;
}

function orderConfigurations(configurations: Configuration[]) {
	return [...configurations].sort((left, right) => configurationRank(left.variant) - configurationRank(right.variant) || Number(left.score) - Number(right.score));
}

function configurationKey(configuration: Configuration) {
	return configuration.result_key || configuration.variant || "default";
}

function releaseMonth(value: string | null | undefined) {
	if (!value || Number.isNaN(Date.parse(value))) return { key: "unknown", label: "Release date unavailable" };
	const date = new Date(value);
	return {
		key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
		label: new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(date),
	};
}

type DisplayResult = { benchmarkId: string; score: number | null; otherInfo: string | null; sourceLink: string | null };
type Configuration = NonNullable<PublicBenchmarkRankingEntry["configurations"]>[number];

function AnimatedScore({ benchmarkId, score }: { benchmarkId: string; score: number }) {
	const cost = isArtificialAnalysisCostBenchmark(benchmarkId);
	return <span className="tabular-nums">{cost ? "$" : ""}<NumberFlow value={score} format={cost ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { minimumFractionDigits: 1, maximumFractionDigits: 1 }} /></span>;
}

function barScore(benchmarkId: string, score: number) {
	if (isArtificialAnalysisCostBenchmark(benchmarkId)) return `$${new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(score)}`;
	return Number(score).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function localConfigurations(results: ModelBenchmarkResult[], benchmarkId: string): Configuration[] {
	return results.filter((item) => item.benchmark_id === benchmarkId && item.score !== null).map((item) => ({
		variant: item.variant ?? null,
		result_key: item.result_key ?? null,
		score: Number(item.score),
		other_info: item.other_info,
		source_link: item.source_link,
		updated_at: item.updated_at,
	}));
}

function ModelHoverCard({ entry, configurations, metricLabel, total }: { entry: PublicBenchmarkRankingEntry; configurations: Configuration[]; metricLabel?: string; total: number }) {
	return <HoverCardContent side="top" align="center" className="w-72 rounded-xl p-3">
		<div className="flex items-start gap-2.5">
			<span className="relative size-8 shrink-0 overflow-hidden rounded-md bg-muted">
				<Logo id={entry.organisation_id ?? entry.model_id} alt={`${entry.organisation_name ?? entry.model_name} logo`} fill className="object-contain p-1" />
			</span>
			<div className="min-w-0 flex-1">
				<Link href={`/models/${entry.model_id}`} className="font-medium leading-5 decoration-transparent underline-offset-2 hover:underline hover:decoration-current focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{entry.model_name}</Link>
				<p className="text-xs text-muted-foreground">{entry.organisation_name ?? "Unknown organization"} · {formatReleaseDate(entry.release_date)}</p>
			</div>
		</div>
		<div className="mt-3 space-y-1.5 border-t pt-2.5">
			{orderConfigurations(configurations).map((item) => <div key={item.result_key || item.variant || "default"} className="flex items-center justify-between gap-3 text-xs">
				<span className="text-muted-foreground">{configurationLabel(item.variant)}</span>
				<span className="font-medium tabular-nums">{metricLabel ? `${metricLabel}: ` : ""}{Number(item.score).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
			</div>)}
		</div>
		<p className="mt-2 text-xs text-muted-foreground">Rank #{entry.rank} of {total}</p>
	</HoverCardContent>;
}

export function ArtificialAnalysisBenchmarks({ highlights, results = [], rankings = [], modelId }: {
	highlights: ModelBenchmarkHighlight[];
	results?: ModelBenchmarkResult[];
	rankings?: PublicBenchmarkRanking[];
	modelId?: string;
}) {
	const aaResults = useMemo(() => results.filter((item) => isArtificialAnalysisBenchmark(item.benchmark_id) && item.score !== null), [results]);
	const variants = useMemo(() => [...new Set(aaResults.map((item) => item.variant).filter((value): value is string => Boolean(value)))].sort((a, b) => {
		const ai = configurationOrder.indexOf(a);
		const bi = configurationOrder.indexOf(b);
		return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.localeCompare(b);
	}), [aaResults]);
	const preferred = variants.includes("max") ? "max" : variants.at(-1) ?? "";
	const [selectedVariant, setSelectedVariant] = useState(preferred);
	const [expandedMetric, setExpandedMetric] = useState<string | null>(null);
	const [selectionByMetric, setSelectionByMetric] = useState<Record<string, string[]>>({});
	const [pickerOpen, setPickerOpen] = useState(false);
	const [pickerQuery, setPickerQuery] = useState("");
	const pickerScrollY = useRef<number | null>(null);
	useEffect(() => {
		if (!pickerOpen || pickerScrollY.current === null) return;
		const restore = () => window.scrollTo({ top: pickerScrollY.current ?? 0, behavior: "auto" });
		const firstFrame = requestAnimationFrame(() => requestAnimationFrame(restore));
		return () => cancelAnimationFrame(firstFrame);
	}, [pickerOpen]);
	const selectedResults: DisplayResult[] = selectedVariant ? aaResults.filter((item) => item.variant === selectedVariant).map((item) => ({ benchmarkId: item.benchmark_id, score: item.score, otherInfo: item.other_info, sourceLink: item.source_link })) : [];
	const fallback: DisplayResult[] = highlights.filter((item) => isArtificialAnalysisBenchmark(item.benchmarkId) && item.score !== null);
	const available = selectedResults.length ? selectedResults : fallback;
	if (!available.length) return null;

	const versions = [...new Set(available.map((item) => artificialAnalysisVersion(item.otherInfo)).filter(Boolean))];
	const activeRanking = rankings.find((ranking) => ranking.benchmark_id === expandedMetric);
	const activeMetric = artificialAnalysisMetrics.find((metric) => metric.key === artificialAnalysisMetricKey(expandedMetric ?? ""));
	const entries = activeRanking?.entries ?? [];
	const datedEntries = [...entries].sort(modelDateDescending);
	const localConfigs = expandedMetric ? localConfigurations(aaResults, expandedMetric) : [];
	const pickerRows = datedEntries.flatMap((entry) => {
		const configurations = orderConfigurations(entry.model_id === modelId && localConfigs.length ? localConfigs : entry.configurations?.length ? entry.configurations : [{ variant: null, result_key: null, score: Number(entry.score), other_info: entry.other_info ?? null, source_link: entry.source_link ?? null, updated_at: entry.updated_at ?? null }]);
		return configurations.map((configuration) => ({ key: `${entry.model_id}:${configurationKey(configuration)}`, entry, configuration }));
	});
	const normalizedPickerQuery = pickerQuery.trim().toLocaleLowerCase();
	const visiblePickerRows = normalizedPickerQuery ? pickerRows.filter((row) => `${row.entry.model_name} ${row.entry.organisation_name ?? ""} ${row.entry.model_id} ${configurationLabel(row.configuration.variant)}`.toLocaleLowerCase().includes(normalizedPickerQuery)) : pickerRows;
	const pickerGroups = [...visiblePickerRows.reduce((groups, row) => {
		const month = releaseMonth(row.entry.release_date);
		const group = groups.get(month.key) ?? { ...month, rows: [] as typeof pickerRows };
		group.rows.push(row);
		groups.set(month.key, group);
		return groups;
	}, new Map<string, { key: string; label: string; rows: typeof pickerRows }>()).values()];
	const currentIndex = entries.findIndex((entry) => entry.model_id === modelId);
	const defaultVisibleModels = 14;
	const defaultStart = currentIndex < 0 ? 0 : Math.min(Math.max(0, currentIndex - 6), Math.max(0, entries.length - defaultVisibleModels));
	const defaultSelection = entries.slice(defaultStart, defaultStart + defaultVisibleModels).map((entry) => entry.model_id);
	if (modelId && entries.some((entry) => entry.model_id === modelId) && !defaultSelection.includes(modelId)) defaultSelection.unshift(modelId);
	const defaultSelectedKeys = pickerRows.filter((row) => defaultSelection.includes(row.entry.model_id)).map((row) => row.key);
	const selectedKeys = expandedMetric ? selectionByMetric[expandedMetric] ?? defaultSelectedKeys : [];
	const chartRows = pickerRows.filter((row) => selectedKeys.includes(row.key)).sort((left, right) => {
		const scoreDifference = Number(left.configuration.score) - Number(right.configuration.score);
		return (activeRanking?.lower_is_better ? scoreDifference : -scoreDifference)
			|| left.entry.rank - right.entry.rank
			|| configurationRank(left.configuration.variant) - configurationRank(right.configuration.variant);
	});
	const maxScore = Math.max(...chartRows.map((row) => Number(row.configuration.score)), 1);
	const rankFor = (benchmarkId: string, score: number) => {
		const ranking = rankings.find((item) => item.benchmark_id === benchmarkId);
		if (!ranking) return null;
		const betterModels = ranking.entries.filter((entry) => entry.model_id !== modelId && (ranking.lower_is_better ? entry.score < score : entry.score > score));
		return betterModels.length + 1;
	};
	const setSelectedKeys = (keys: string[]) => expandedMetric && setSelectionByMetric((current) => ({ ...current, [expandedMetric]: keys }));

	return <section aria-label="Artificial Analysis benchmarks">
		<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
			<div className="flex items-center gap-3"><ArtificialAnalysisLogo /><div><h2 className="font-semibold">Artificial Analysis</h2><p className="text-xs text-muted-foreground">Independent evaluations{versions.length ? ` · Index v${versions.join(" / v")}` : ""}</p></div></div>
			{variants.length > 1 ? <div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">Model configuration</span><Select value={selectedVariant} onValueChange={setSelectedVariant}><SelectTrigger size="sm" aria-label="Configuration" className="min-w-36"><SelectValue>{configurationLabel(selectedVariant)}</SelectValue></SelectTrigger><SelectContent align="end">{variants.map((variant) => <SelectItem key={variant} value={variant}>{configurationLabel(variant)}</SelectItem>)}</SelectContent></Select></div> : null}
		</div>

		<div className="mt-4 grid grid-cols-2 border-t lg:grid-cols-4">
			{artificialAnalysisMetrics.map(({ id: fallbackId, key, label }, index) => {
				const result = available.filter((item) => artificialAnalysisMetricKey(item.benchmarkId) === key).sort((left, right) => right.benchmarkId.localeCompare(left.benchmarkId, "en", { numeric: true }))[0];
				const id = result?.benchmarkId ?? fallbackId;
				const rank = result?.score == null ? null : rankFor(id, result.score);
				const active = expandedMetric === id;
				const MetricIcon = metricIcons[key];
				return <button key={id} type="button" aria-expanded={active} onClick={() => { setPickerOpen(false); setExpandedMetric(active ? null : id); }} className={`group min-w-0 py-3 text-left sm:py-4 ${index % 2 ? "border-l pl-4 sm:pl-5" : "pr-4 sm:pr-5"} ${index > 1 ? "border-t lg:border-t-0 lg:border-l lg:pl-5" : ""}`}>
					<span className="flex items-center gap-2 text-sm font-medium"><MetricIcon className={`size-4 transition-colors ${active ? "text-[#8842FD]" : "text-muted-foreground group-hover:text-foreground"}`} />{label}</span>
					<span className="mt-2 flex items-baseline gap-1.5 text-xl font-semibold tracking-tight sm:text-2xl"><span>{result?.score == null ? "—" : <AnimatedScore benchmarkId={id} score={result.score} />}</span>{result?.score != null && rank ? <span className="flex items-baseline text-sm font-medium text-muted-foreground">(#<NumberFlow value={rank} />)</span> : null}</span>
				</button>;
			})}
		</div>

		{expandedMetric ? <div className="border-b py-5" aria-live="polite">
			<div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div><h3 className="text-sm font-medium">{activeMetric?.label} comparison</h3><p className="text-xs text-muted-foreground">{activeRanking?.lower_is_better ? "Lower is better" : "Higher is better"} · selected configuration ranked against each model’s best</p></div>
				{entries.length ? <Popover open={pickerOpen} onOpenChange={setPickerOpen}><PopoverTrigger asChild><Button variant="outline" size="sm" className="w-full justify-between sm:w-64" onPointerDown={() => { pickerScrollY.current = window.scrollY; }} onKeyDown={() => { pickerScrollY.current = window.scrollY; }}><span>{selectedKeys.length} of {pickerRows.length} configurations</span><ChevronsUpDown className="size-3.5 text-muted-foreground" /></Button></PopoverTrigger><PopoverContent initialFocus={false} align="end" className="w-[min(28rem,calc(100vw-2rem))] gap-0 p-0">
					<Command shouldFilter={false}><CommandInput value={pickerQuery} onValueChange={setPickerQuery} placeholder="Search models or configurations…" /><CommandList className="max-h-80"><CommandEmpty>No evaluated configuration found.</CommandEmpty>{pickerGroups.map((group) => <CommandGroup key={group.key} heading={group.label} className="overflow-visible [&_[cmdk-group-heading]]:sticky [&_[cmdk-group-heading]]:top-0 [&_[cmdk-group-heading]]:z-10 [&_[cmdk-group-heading]]:bg-popover [&_[cmdk-group-heading]]:shadow-[0_1px_0_hsl(var(--border))]">{group.rows.map(({ key, entry, configuration }) => { const selected = selectedKeys.includes(key); return <CommandItem key={key} value={key} data-checked={selected} onSelect={() => setSelectedKeys(selected ? selectedKeys.filter((item) => item !== key) : [...selectedKeys, key])} className="min-h-8 py-1"><span className="relative size-5 shrink-0 overflow-hidden rounded bg-muted"><Logo id={entry.organisation_id ?? entry.model_id} alt="" fill className="object-contain p-0.5" /></span><span className="min-w-0 flex-1 truncate">{entry.model_name} <span className="text-muted-foreground">({configurationLabel(configuration.variant)})</span></span></CommandItem>; })}</CommandGroup>)}</CommandList></Command>
					<div className="grid grid-cols-2 gap-1.5 border-t bg-popover p-2"><Button type="button" variant="ghost" size="sm" className="h-8 justify-between bg-muted/40 px-2.5 text-xs" onClick={() => setSelectedKeys([])}>Clear<ListX className="size-3.5" /></Button><Button type="button" variant="ghost" size="sm" className="h-8 justify-between bg-muted/40 px-2.5 text-xs" onClick={() => setSelectedKeys(pickerRows.map((row) => row.key))}>Select all<ListChecks className="size-3.5" /></Button></div>
				</PopoverContent></Popover> : null}
			</div>
			{chartRows.length ? <ScrollArea className="w-full" scrollBarOrientation="horizontal" viewportClassName="pb-3"><div className="relative h-[360px] border-b" style={{ width: `${Math.max(chartRows.length * 54 + 144, 480)}px`, minWidth: "100%" }}>
				<div className="pointer-events-none absolute inset-x-16 bottom-[140px] top-4 flex flex-col justify-between">{[0, 1, 2, 3, 4].map((line) => <span key={line} className="border-t border-dashed border-border/70" />)}</div>
				<div className="absolute inset-x-16 bottom-0 top-4 flex items-end gap-1.5">{chartRows.map(({ entry, configuration }) => {
					const proportionalHeight = (Number(configuration.score) / maxScore) * 205;
					const height = Math.max(proportionalHeight, 3);
					const compactBar = proportionalHeight < 30;
					const colour = safeColour(entry.organisation_colour, "#6b7280");
					return <HoverCard key={`${entry.model_id}:${configuration.result_key || configuration.variant || "default"}`}><HoverCardTrigger asChild delay={80} closeDelay={80}><div tabIndex={0} className="group flex h-full min-w-12 flex-1 basis-12 cursor-default flex-col items-center justify-end rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className={`relative flex w-8 items-end justify-center rounded-t-[3px] text-[10px] font-semibold tabular-nums shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] transition-[height,filter] duration-300 group-hover:brightness-110 sm:w-9 ${compactBar ? "" : "pb-2 text-white"}`} style={{ height, backgroundColor: colour }}><span className={compactBar ? "absolute bottom-full mb-1 text-foreground" : ""}>{barScore(expandedMetric, Number(configuration.score))}</span></span><span className="relative my-1 size-4 shrink-0"><Logo id={entry.organisation_id ?? entry.model_id} alt="" fill className="object-contain" /></span><div className="relative h-[112px] w-full"><Link href={`/models/${entry.model_id}`} className="absolute right-1/2 top-0 line-clamp-2 w-24 origin-top-right -rotate-[55deg] whitespace-normal break-words text-right text-[11px] leading-[1.15] decoration-transparent underline-offset-2 hover:underline hover:decoration-current focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{entry.model_name}{configuration.variant ? <span className="text-muted-foreground"> ({configurationLabel(configuration.variant)})</span> : null}</Link></div></div></HoverCardTrigger><ModelHoverCard entry={entry} configurations={[configuration]} metricLabel={activeMetric?.label} total={entries.length} /></HoverCard>;
				})}</div>
			</div></ScrollArea> : <p className="text-sm text-muted-foreground">Select models to compare.</p>}
		</div> : null}

		<div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
			<Link href={expandedMetric ? `/benchmarks/${expandedMetric}#model-results` : "/rankings#benchmarks"} className="inline-flex items-center gap-1 hover:text-foreground">View full leaderboard <ArrowUpRight className="size-3.5" /></Link>
			<a href={available[0]?.sourceLink || "https://artificialanalysis.ai/models"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">Source: Artificial Analysis <ExternalLink className="size-3.5" /></a>
		</div>
	</section>;
}
