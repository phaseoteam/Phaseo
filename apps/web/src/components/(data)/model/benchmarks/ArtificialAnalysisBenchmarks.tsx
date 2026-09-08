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
	const selectedResults: DisplayResult[] = selectedVariant ? aaResults.filter((item) => item.variant === selectedVariant).map((item) => ({ benchmarkId: item.benchmark_id, score: item.score, otherInfo: item.other_info, sourceLink: item.source_link })) : [];
	const fallback: DisplayResult[] = highlights.filter((item) => isArtificialAnalysisBenchmark(item.benchmarkId) && item.score !== null);
	const available = selectedResults.length ? selectedResults : fallback;
	if (!available.length) return null;
	const versions = [...new Set(available.map((item) => artificialAnalysisVersion(item.otherInfo)).filter(Boolean))];
	const activeRanking = rankings.find((ranking) => ranking.benchmark_id === expandedMetric);
	const activeResult = available.find((item) => item.benchmarkId === expandedMetric);
	const activeMetric = artificialAnalysisMetrics.find((metric) => metric.id === expandedMetric);
	const peerRows = (activeRanking?.entries ?? []).map((entry) => ({ ...entry, score: Number(entry.score) })).filter((entry) => Number.isFinite(entry.score));
	const currentPeer = peerRows.find((entry) => entry.model_id === modelId);
	const comparisonRows = activeRanking && activeResult?.score != null ? [...peerRows.slice(0, 5).filter((entry) => entry.model_id !== modelId), {
		model_id: modelId ?? "current-model",
		model_name: currentPeer?.model_name ?? modelId?.split("/").at(-1)?.replaceAll("-", " ") ?? "This model",
		organisation_id: null,
		organisation_name: null,
		score: Number(activeResult.score),
		rank: currentPeer?.rank ?? 0,
	}].sort((a, b) => activeRanking.lower_is_better ? a.score - b.score : b.score - a.score).slice(0, 6) : [];
	const maxComparisonScore = Math.max(...comparisonRows.map((row) => row.score), 1);

	return <section aria-label="Artificial Analysis benchmarks">
		<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
			<div className="flex items-center gap-3"><ArtificialAnalysisLogo /><div><h2 className="font-semibold">Artificial Analysis</h2><p className="text-xs text-muted-foreground">Independent evaluations{versions.length ? ` · Index v${versions.join(" / v")}` : ""}</p></div></div>
			{variants.length > 1 ? <div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">Configuration</span><Select value={selectedVariant} onValueChange={setSelectedVariant}><SelectTrigger size="sm" aria-label="Configuration" className="min-w-36"><SelectValue>{configurationLabel(selectedVariant)}</SelectValue></SelectTrigger><SelectContent align="end">{variants.map((variant) => <SelectItem key={variant} value={variant}>{configurationLabel(variant)}</SelectItem>)}</SelectContent></Select></div> : null}
		</div>

		<div className="mt-4 grid grid-cols-2 border-y lg:grid-cols-4">
			{artificialAnalysisMetrics.map(({ id, label, description }, index) => {
				const result = available.find((item) => item.benchmarkId === id);
				const active = expandedMetric === id;
				return <button key={id} type="button" aria-expanded={active} onClick={() => setExpandedMetric(active ? null : id)} className={`group min-w-0 py-4 text-left sm:py-5 ${index % 2 ? "border-l pl-4 sm:pl-5" : "pr-4 sm:pr-5"} ${index > 1 ? "border-t lg:border-t-0 lg:border-l lg:pl-5" : ""}`}>
					<span className="flex items-center gap-1.5 text-sm font-medium">{label}<BarChart3 className={`size-3.5 transition-colors ${active ? "text-[#8842FD]" : "text-muted-foreground/60 group-hover:text-foreground"}`} /></span>
					<span className="my-2 block text-xl font-semibold tracking-tight sm:text-2xl xl:text-3xl">{result?.score == null ? "—" : <AnimatedScore benchmarkId={id} score={result.score} />}</span>
					<span className="block text-xs leading-5 text-muted-foreground">{result?.score == null ? "Not available" : description}</span>
				</button>;
			})}
		</div>

		{expandedMetric ? <div className="border-b py-5" aria-live="polite">
			<div className="mb-4"><h3 className="text-sm font-medium">{activeMetric?.label} comparison</h3><p className="text-xs text-muted-foreground">{activeRanking?.lower_is_better ? "Lower is better" : "Higher is better"} · leading configurations</p></div>
			{comparisonRows.length ? <div className="space-y-2.5">{comparisonRows.map((row) => {
				const current = row.model_id === (modelId ?? "current-model");
				return <div key={row.model_id} className="grid grid-cols-[minmax(7rem,10rem)_1fr_auto] items-center gap-3 text-xs"><span className={`truncate capitalize ${current ? "font-medium text-foreground" : "text-muted-foreground"}`}>{current ? `${row.model_name} · ${configurationLabel(selectedVariant)}` : row.model_name}</span><span className="h-1.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max((row.score / maxComparisonScore) * 100, 2)}%`, backgroundColor: current ? purple : "var(--muted-foreground)" }} /></span><span className="w-16 text-right font-medium tabular-nums">{expandedMetric === "aa-intelligence-index-cost-v4" ? `$${row.score.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : row.score.toFixed(1)}</span></div>;
			})}</div> : <p className="text-sm text-muted-foreground">Comparison data is not available yet.</p>}
		</div> : null}

		<div className="mt-3 flex justify-end text-xs text-muted-foreground"><a href={available[0]?.sourceLink || "https://artificialanalysis.ai/models"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">Source: Artificial Analysis <ExternalLink className="size-3.5" /></a></div>
	</section>;
}
