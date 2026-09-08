"use client";

import { useMemo, useState } from "react";
import NumberFlow from "@number-flow/react";
import { BarChart3, Check, ChevronsUpDown, ExternalLink } from "lucide-react";
import { ArtificialAnalysisLogo } from "@/components/ArtificialAnalysisLogo";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PublicBenchmarkRanking, PublicBenchmarkRankingEntry } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import type { ModelBenchmarkHighlight, ModelBenchmarkResult } from "@/lib/fetchers/models/getModelBenchmarkData";
import { artificialAnalysisMetrics, artificialAnalysisVersion, isArtificialAnalysisBenchmark } from "@/lib/benchmarks/artificialAnalysis";
import { cn } from "@/lib/utils";

const configurationOrder = ["none", "low", "medium", "high", "xhigh", "max"];
const purple = "#8842FD";

function configurationLabel(value: string | null) {
	if (!value || value === "none") return "Non-reasoning";
	if (value === "xhigh") return "Extra high";
	return value.charAt(0).toUpperCase() + value.slice(1);
}

function safeColour(value: string | null | undefined, fallback: string) {
	return value && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
}

type DisplayResult = { benchmarkId: string; score: number | null; otherInfo: string | null; sourceLink: string | null };
type Configuration = NonNullable<PublicBenchmarkRankingEntry["configurations"]>[number];

function AnimatedScore({ benchmarkId, score }: { benchmarkId: string; score: number }) {
	const cost = benchmarkId === "aa-intelligence-index-cost-v4";
	return <span className="tabular-nums">{cost ? "$" : ""}<NumberFlow value={score} format={cost ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { minimumFractionDigits: 1, maximumFractionDigits: 1 }} /></span>;
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
	const [configurationByMetric, setConfigurationByMetric] = useState<Record<string, Record<string, string>>>({});
	const selectedResults: DisplayResult[] = selectedVariant ? aaResults.filter((item) => item.variant === selectedVariant).map((item) => ({ benchmarkId: item.benchmark_id, score: item.score, otherInfo: item.other_info, sourceLink: item.source_link })) : [];
	const fallback: DisplayResult[] = highlights.filter((item) => isArtificialAnalysisBenchmark(item.benchmarkId) && item.score !== null);
	const available = selectedResults.length ? selectedResults : fallback;
	if (!available.length) return null;

	const versions = [...new Set(available.map((item) => artificialAnalysisVersion(item.otherInfo)).filter(Boolean))];
	const activeRanking = rankings.find((ranking) => ranking.benchmark_id === expandedMetric);
	const activeMetric = artificialAnalysisMetrics.find((metric) => metric.id === expandedMetric);
	const entries = activeRanking?.entries ?? [];
	const currentIndex = entries.findIndex((entry) => entry.model_id === modelId);
	const defaultStart = currentIndex < 0 ? 0 : Math.min(Math.max(0, currentIndex - 4), Math.max(0, entries.length - 9));
	const defaultSelection = entries.slice(defaultStart, defaultStart + 9).map((entry) => entry.model_id);
	if (modelId && entries.some((entry) => entry.model_id === modelId) && !defaultSelection.includes(modelId)) defaultSelection.unshift(modelId);
	const selectedIds = expandedMetric ? selectionByMetric[expandedMetric] ?? defaultSelection : [];
	const localConfigs = expandedMetric ? localConfigurations(aaResults, expandedMetric) : [];
	const chartRows = selectedIds.map((id) => entries.find((entry) => entry.model_id === id)).filter((entry): entry is PublicBenchmarkRankingEntry => Boolean(entry)).map((entry) => {
		const configurations = entry.model_id === modelId && localConfigs.length ? localConfigs : entry.configurations?.length ? entry.configurations : [{ variant: null, result_key: null, score: Number(entry.score), other_info: entry.other_info ?? null, source_link: entry.source_link ?? null, updated_at: entry.updated_at ?? null }];
		const selectedKey = expandedMetric ? configurationByMetric[expandedMetric]?.[entry.model_id] : undefined;
		const configuration = configurations.find((item) => (item.result_key || item.variant || "default") === selectedKey) ?? (entry.model_id === modelId ? configurations.find((item) => item.variant === selectedVariant) : undefined) ?? configurations[0];
		return { entry, configuration, configurations };
	});
	const maxScore = Math.max(...chartRows.map((row) => Number(row.configuration.score)), 1);
	const rankFor = (benchmarkId: string) => rankings.find((ranking) => ranking.benchmark_id === benchmarkId)?.entries.find((entry) => entry.model_id === modelId);
	const setSelectedIds = (ids: string[]) => expandedMetric && setSelectionByMetric((current) => ({ ...current, [expandedMetric]: ids }));

	return <section aria-label="Artificial Analysis benchmarks">
		<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
			<div className="flex items-center gap-3"><ArtificialAnalysisLogo /><div><h2 className="font-semibold">Artificial Analysis</h2><p className="text-xs text-muted-foreground">Independent evaluations{versions.length ? ` · Index v${versions.join(" / v")}` : ""}</p></div></div>
			{variants.length > 1 ? <div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">Model configuration</span><Select value={selectedVariant} onValueChange={setSelectedVariant}><SelectTrigger size="sm" aria-label="Configuration" className="min-w-36"><SelectValue>{configurationLabel(selectedVariant)}</SelectValue></SelectTrigger><SelectContent align="end">{variants.map((variant) => <SelectItem key={variant} value={variant}>{configurationLabel(variant)}</SelectItem>)}</SelectContent></Select></div> : null}
		</div>

		<div className="mt-4 grid grid-cols-2 border-y lg:grid-cols-4">
			{artificialAnalysisMetrics.map(({ id, label, description }, index) => {
				const result = available.find((item) => item.benchmarkId === id);
				const ranking = rankings.find((item) => item.benchmark_id === id);
				const rank = rankFor(id);
				const active = expandedMetric === id;
				return <button key={id} type="button" aria-expanded={active} onClick={() => setExpandedMetric(active ? null : id)} className={`group min-w-0 py-4 text-left sm:py-5 ${index % 2 ? "border-l pl-4 sm:pl-5" : "pr-4 sm:pr-5"} ${index > 1 ? "border-t lg:border-t-0 lg:border-l lg:pl-5" : ""}`}>
					<span className="flex items-center gap-1.5 text-sm font-medium">{label}<BarChart3 className={`size-3.5 transition-colors ${active ? "text-[#8842FD]" : "text-muted-foreground/60 group-hover:text-foreground"}`} /></span>
					<span className="my-2 block text-xl font-semibold tracking-tight sm:text-2xl xl:text-3xl">{result?.score == null ? "—" : <AnimatedScore benchmarkId={id} score={result.score} />}</span>
					<span className="block text-xs leading-5 text-muted-foreground">{result?.score == null ? "Not available" : description}</span>
					{result?.score != null && rank ? <span className="mt-1 block text-xs font-medium text-muted-foreground">#{rank.rank} of {ranking?.entries.length ?? ranking?.total_models ?? "—"} models</span> : null}
				</button>;
			})}
		</div>

		{expandedMetric ? <div className="border-b py-5" aria-live="polite">
			<div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div><h3 className="text-sm font-medium">{activeMetric?.label} comparison</h3><p className="text-xs text-muted-foreground">{activeRanking?.lower_is_better ? "Lower is better" : "Higher is better"} · rank uses each model’s best configuration</p></div>
				{entries.length ? <Popover><PopoverTrigger asChild><Button variant="outline" size="sm" className="w-full justify-between sm:w-56"><span>{selectedIds.length} of {entries.length} models</span><ChevronsUpDown className="size-3.5 text-muted-foreground" /></Button></PopoverTrigger><PopoverContent align="end" className="w-[min(26rem,calc(100vw-2rem))] gap-0 p-0">
					<Command><CommandInput placeholder="Search every evaluated model…" /><CommandList className="max-h-64"><CommandEmpty>No evaluated model found.</CommandEmpty><CommandGroup>{entries.map((entry) => { const selected = selectedIds.includes(entry.model_id); return <CommandItem key={entry.model_id} value={`${entry.model_name} ${entry.organisation_name ?? ""} ${entry.model_id}`} data-checked={selected} onSelect={() => setSelectedIds(selected ? selectedIds.filter((id) => id !== entry.model_id) : [...selectedIds, entry.model_id])}><span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: safeColour(entry.organisation_colour, purple) }} /><span className="min-w-0 flex-1 truncate">{entry.model_name}</span><span className="shrink-0 text-xs text-muted-foreground">#{entry.rank}</span><Check className={cn("size-4", selected ? "opacity-100" : "opacity-0")} /></CommandItem>; })}</CommandGroup></CommandList></Command>
					{chartRows.some((row) => row.configurations.length > 1) ? <div className="border-t p-3"><p className="mb-2 text-xs font-medium text-muted-foreground">Selected configurations</p><ScrollArea className="max-h-48" viewportClassName="pr-2"><div className="space-y-2">{chartRows.filter((row) => row.configurations.length > 1).map(({ entry, configuration, configurations }) => <div key={entry.model_id} className="flex items-center justify-between gap-3"><span className="min-w-0 truncate text-xs">{entry.model_name}</span><Select value={configuration.result_key || configuration.variant || "default"} onValueChange={(value) => { setConfigurationByMetric((current) => ({ ...current, [expandedMetric]: { ...current[expandedMetric], [entry.model_id]: value } })); if (entry.model_id === modelId) { const variant = configurations.find((item) => (item.result_key || item.variant || "default") === value)?.variant; if (variant) setSelectedVariant(variant); } }}><SelectTrigger size="sm" className="h-7 w-32 text-xs"><SelectValue>{configurationLabel(configuration.variant)}</SelectValue></SelectTrigger><SelectContent>{configurations.map((item) => { const key = item.result_key || item.variant || "default"; return <SelectItem key={key} value={key}>{configurationLabel(item.variant)}</SelectItem>; })}</SelectContent></Select></div>)}</div></ScrollArea></div> : null}
				</PopoverContent></Popover> : null}
			</div>
			{chartRows.length ? <ScrollArea className="w-full" scrollBarOrientation="horizontal" viewportClassName="pb-3"><div className="relative h-[350px] border-b" style={{ width: `${Math.max(chartRows.length * 76 + 16, 360)}px`, minWidth: "100%" }}>
				<div className="pointer-events-none absolute inset-x-0 bottom-[116px] top-4 flex flex-col justify-between">{[0, 1, 2, 3, 4].map((line) => <span key={line} className="border-t border-dashed border-border/70" />)}</div>
				<div className="absolute inset-x-2 bottom-0 top-4 flex items-end gap-1.5">{chartRows.map(({ entry, configuration }) => {
					const height = Math.max((Number(configuration.score) / maxScore) * 210, 5);
					const colour = safeColour(entry.organisation_colour, entry.model_id === modelId ? purple : "#6b7280");
					return <Tooltip key={entry.model_id}><TooltipTrigger asChild><div className="group flex h-full min-w-16 flex-1 basis-16 flex-col items-center justify-end"><span className="mb-1 text-[11px] font-semibold tabular-nums">{expandedMetric === "aa-intelligence-index-cost-v4" ? `$${Number(configuration.score).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : Number(configuration.score).toFixed(1)}</span><span className="w-10 rounded-t-[3px] transition-[height,filter] duration-300 group-hover:brightness-110" style={{ height, backgroundColor: colour }} /><div className="relative h-[112px] w-full"><span className="absolute right-1/2 top-2 w-28 origin-top-right -rotate-[55deg] text-right text-[11px] leading-[1.1]">{entry.model_name}{configuration.variant ? <span className="text-muted-foreground"> ({configurationLabel(configuration.variant)})</span> : null}</span></div></div></TooltipTrigger><TooltipContent side="top" className="max-w-64"><p className="font-medium">{entry.model_name}</p><p className="text-muted-foreground">{entry.organisation_name ?? "Unknown organization"} · {configurationLabel(configuration.variant)}</p><p className="mt-1 tabular-nums">{activeMetric?.label}: {expandedMetric === "aa-intelligence-index-cost-v4" ? `$${Number(configuration.score).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : Number(configuration.score).toFixed(1)} · rank #{entry.rank} of {entries.length}</p></TooltipContent></Tooltip>;
				})}</div>
			</div></ScrollArea> : <p className="text-sm text-muted-foreground">Select models to compare.</p>}
		</div> : null}

		<div className="mt-3 flex justify-end text-xs text-muted-foreground"><a href={available[0]?.sourceLink || "https://artificialanalysis.ai/models"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">Source: Artificial Analysis <ExternalLink className="size-3.5" /></a></div>
	</section>;
}
