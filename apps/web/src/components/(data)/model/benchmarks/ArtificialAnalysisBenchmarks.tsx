"use client";

import { useMemo, useState } from "react";
import NumberFlow from "@number-flow/react";
import { BarChart3, ExternalLink } from "lucide-react";
import { ArtificialAnalysisLogo } from "@/components/ArtificialAnalysisLogo";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PublicBenchmarkRanking } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import type { ModelBenchmarkHighlight, ModelBenchmarkResult } from "@/lib/fetchers/models/getModelBenchmarkData";
import { artificialAnalysisMetrics, artificialAnalysisVersion, isArtificialAnalysisBenchmark } from "@/lib/benchmarks/artificialAnalysis";

const configurationOrder = ["none", "low", "medium", "high", "xhigh", "max"];
const purple = "#8842FD";

function configurationLabel(value: string) {
	if (value === "none") return "Non-reasoning";
	if (value === "xhigh") return "Extra high";
	return value.charAt(0).toUpperCase() + value.slice(1);
}

type DisplayResult = { benchmarkId: string; score: number | null; otherInfo: string | null; sourceLink: string | null };

function AnimatedScore({ benchmarkId, score }: { benchmarkId: string; score: number }) {
	const cost = benchmarkId === "aa-intelligence-index-cost-v4";
	return <span className="tabular-nums">{cost ? "$" : ""}<NumberFlow value={score} format={cost ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { minimumFractionDigits: 1, maximumFractionDigits: 1 }} /></span>;
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
	const [comparisonModelId, setComparisonModelId] = useState("");
	const selectedResults: DisplayResult[] = selectedVariant ? aaResults.filter((item) => item.variant === selectedVariant).map((item) => ({ benchmarkId: item.benchmark_id, score: item.score, otherInfo: item.other_info, sourceLink: item.source_link })) : [];
	const fallback: DisplayResult[] = highlights.filter((item) => isArtificialAnalysisBenchmark(item.benchmarkId) && item.score !== null);
	const available = selectedResults.length ? selectedResults : fallback;
	if (!available.length) return null;
	const versions = [...new Set(available.map((item) => artificialAnalysisVersion(item.otherInfo)).filter(Boolean))];
	const activeRanking = rankings.find((ranking) => ranking.benchmark_id === expandedMetric);
	const activeMetric = artificialAnalysisMetrics.find((metric) => metric.id === expandedMetric);
	const peerRows = (activeRanking?.entries ?? []).map((entry) => ({ ...entry, score: Number(entry.score) })).filter((entry) => Number.isFinite(entry.score));
	const currentPeerIndex = peerRows.findIndex((entry) => entry.model_id === modelId);
	const nearbyPeers = activeRanking ? peerRows.slice(Math.max(0, currentPeerIndex - 3), currentPeerIndex < 0 ? 6 : currentPeerIndex + 4).filter((entry) => entry.model_id !== modelId).map((entry) => ({ id: entry.model_id, label: entry.model_name, score: entry.score, kind: "peer" as const, selected: false })) : [];
	const comparisonPeer = peerRows.find((entry) => entry.model_id === comparisonModelId);
	const peerComparisons = comparisonPeer && !nearbyPeers.some((entry) => entry.id === comparisonPeer.model_id) ? [...nearbyPeers, { id: comparisonPeer.model_id, label: comparisonPeer.model_name, score: comparisonPeer.score, kind: "peer" as const, selected: true }] : nearbyPeers.map((entry) => ({ ...entry, selected: entry.id === comparisonModelId }));
	const configurationRows = expandedMetric ? aaResults.filter((item) => item.benchmark_id === expandedMetric && item.score !== null && item.variant).map((item) => ({ id: `configuration-${item.variant}`, label: configurationLabel(item.variant as string), score: Number(item.score), kind: "configuration" as const, selected: item.variant === selectedVariant })).filter((item) => Number.isFinite(item.score)) : [];
	const comparisonRows = [...peerComparisons, ...configurationRows].sort((a, b) => activeRanking?.lower_is_better ? a.score - b.score : b.score - a.score);
	const maxComparisonScore = Math.max(...comparisonRows.map((row) => row.score), 1);
	const rankFor = (benchmarkId: string) => rankings.find((ranking) => ranking.benchmark_id === benchmarkId)?.entries.find((entry) => entry.model_id === modelId);

	return <section aria-label="Artificial Analysis benchmarks">
		<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
			<div className="flex items-center gap-3"><ArtificialAnalysisLogo /><div><h2 className="font-semibold">Artificial Analysis</h2><p className="text-xs text-muted-foreground">Independent evaluations{versions.length ? ` · Index v${versions.join(" / v")}` : ""}</p></div></div>
			{variants.length > 1 ? <div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">Configuration</span><Select value={selectedVariant} onValueChange={setSelectedVariant}><SelectTrigger size="sm" aria-label="Configuration" className="min-w-36"><SelectValue>{configurationLabel(selectedVariant)}</SelectValue></SelectTrigger><SelectContent align="end">{variants.map((variant) => <SelectItem key={variant} value={variant}>{configurationLabel(variant)}</SelectItem>)}</SelectContent></Select></div> : null}
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
			<div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="text-sm font-medium">{activeMetric?.label} comparison</h3><p className="text-xs text-muted-foreground">{activeRanking?.lower_is_better ? "Lower is better" : "Higher is better"} · this model’s configurations and nearby models</p></div>{peerRows.length ? <Select value={comparisonModelId} onValueChange={setComparisonModelId}><SelectTrigger size="sm" aria-label="Add model to comparison" className="w-full sm:w-52"><SelectValue placeholder="Compare another model">{comparisonPeer?.model_name}</SelectValue></SelectTrigger><SelectContent align="end">{peerRows.filter((entry) => entry.model_id !== modelId).map((entry) => <SelectItem key={entry.model_id} value={entry.model_id}>{entry.model_name}</SelectItem>)}</SelectContent></Select> : null}</div>
			{comparisonRows.length ? <div className="overflow-x-auto pb-2"><div className="flex h-64 min-w-max items-end gap-3 border-b px-1" style={{ width: `${Math.max(comparisonRows.length * 92, 640)}px` }}>{comparisonRows.map((row) => {
				const height = Math.max((row.score / maxComparisonScore) * 176, 4);
				const current = row.kind === "configuration";
				return <div key={row.id} className="flex h-full w-20 flex-col justify-end text-center text-xs"><span className={`mb-1 font-medium tabular-nums ${row.selected ? "text-[#8842FD]" : "text-foreground"}`}>{expandedMetric === "aa-intelligence-index-cost-v4" ? `$${row.score.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : row.score.toFixed(1)}</span><span className="mx-auto w-11 rounded-t-sm transition-[height] duration-500" style={{ height, backgroundColor: current ? purple : "var(--muted-foreground)", opacity: current && !row.selected ? 0.5 : 1 }} /><span className={`mt-2 line-clamp-2 min-h-8 leading-4 ${current ? "font-medium" : "text-muted-foreground"}`} title={row.label}>{row.label}</span></div>;
			})}</div></div> : <p className="text-sm text-muted-foreground">Comparison data is not available yet.</p>}
		</div> : null}

		<div className="mt-3 flex justify-end text-xs text-muted-foreground"><a href={available[0]?.sourceLink || "https://artificialanalysis.ai/models"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">Source: Artificial Analysis <ExternalLink className="size-3.5" /></a></div>
	</section>;
}
