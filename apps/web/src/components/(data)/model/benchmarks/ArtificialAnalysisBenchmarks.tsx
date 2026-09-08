"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { ArtificialAnalysisLogo } from "@/components/ArtificialAnalysisLogo";
import type { ModelBenchmarkHighlight, ModelBenchmarkResult } from "@/lib/fetchers/models/getModelBenchmarkData";
import { artificialAnalysisMetrics, artificialAnalysisVersion, formatArtificialAnalysisScore, isArtificialAnalysisBenchmark } from "@/lib/benchmarks/artificialAnalysis";
export { isArtificialAnalysisBenchmark } from "@/lib/benchmarks/artificialAnalysis";

const configurationOrder = ["none", "low", "medium", "high", "xhigh", "max"];

function configurationLabel(value: string) {
	if (value === "none") return "Non-reasoning";
	if (value === "xhigh") return "Extra high";
	return value.charAt(0).toUpperCase() + value.slice(1);
}

type DisplayResult = {
	benchmarkId: string;
	score: number | null;
	otherInfo: string | null;
	sourceLink: string | null;
};

export function ArtificialAnalysisBenchmarks({ highlights, results = [] }: { highlights: ModelBenchmarkHighlight[]; results?: ModelBenchmarkResult[] }) {
	const aaResults = useMemo(() => results.filter((item) => isArtificialAnalysisBenchmark(item.benchmark_id) && item.score !== null), [results]);
	const variants = useMemo(() => [...new Set(aaResults.map((item) => item.variant).filter((value): value is string => Boolean(value)))].sort((a, b) => {
		const ai = configurationOrder.indexOf(a);
		const bi = configurationOrder.indexOf(b);
		return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.localeCompare(b);
	}), [aaResults]);
	const preferred = variants.includes("max") ? "max" : variants.at(-1) ?? "";
	const [selectedVariant, setSelectedVariant] = useState(preferred);
	const selectedResults: DisplayResult[] = selectedVariant
		? aaResults.filter((item) => item.variant === selectedVariant).map((item) => ({ benchmarkId: item.benchmark_id, score: item.score, otherInfo: item.other_info, sourceLink: item.source_link }))
		: [];
	const fallback: DisplayResult[] = highlights.filter((item) => isArtificialAnalysisBenchmark(item.benchmarkId) && item.score !== null);
	const available = selectedResults.length ? selectedResults : fallback;
	if (!available.length) return null;
	const versions = [...new Set(available.map((item) => artificialAnalysisVersion(item.otherInfo)).filter(Boolean))];

	return <section className="overflow-hidden rounded-xl border bg-card" aria-label="Artificial Analysis benchmarks">
		<div className="flex flex-col gap-4 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
			<div className="flex items-center gap-3"><ArtificialAnalysisLogo /><div>
				<h2 className="font-semibold">Artificial Analysis</h2>
				<p className="text-xs text-muted-foreground">Independent evaluations{versions.length ? ` · Index v${versions.join(" / v")}` : ""}</p>
			</div></div>
			{variants.length > 1 ? <label className="relative flex min-w-44 flex-col gap-1 text-xs font-medium text-muted-foreground">
				Reasoning configuration
				<select value={selectedVariant} onChange={(event) => setSelectedVariant(event.target.value)} className="h-9 appearance-none rounded-md border bg-background py-1 pl-3 pr-9 text-sm font-medium text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring">
					{variants.map((variant) => <option key={variant} value={variant}>{configurationLabel(variant)}</option>)}
				</select>
				<ChevronDown className="pointer-events-none absolute bottom-2.5 right-3 size-4 text-muted-foreground" />
			</label> : null}
		</div>
		<div className="grid grid-cols-2 lg:grid-cols-4">
			{artificialAnalysisMetrics.map(({ id, label, description }, index) => {
				const result = available.find((item) => item.benchmarkId === id);
				return <Link key={id} href={`/benchmarks/${id}`} className={`group min-w-0 p-4 transition-colors hover:bg-muted/40 sm:p-5 ${index % 2 ? "border-l" : ""} ${index > 1 ? "border-t lg:border-t-0 lg:border-l" : ""}`}>
					<span className="flex items-center justify-between gap-2 text-sm font-medium">{label}<ArrowUpRight className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" /></span>
					<span className="my-3 block text-xl font-semibold tracking-tight tabular-nums sm:text-2xl xl:text-3xl">{result?.score == null ? "—" : formatArtificialAnalysisScore(id, result.score)}</span>
					<span className="block text-xs leading-5 text-muted-foreground">{result?.score == null ? "Not available" : description}</span>
				</Link>;
			})}
		</div>
		<div className="flex flex-col gap-2 border-t bg-muted/20 px-5 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
			<p>Tested configuration: <span className="text-foreground">{selectedVariant ? configurationLabel(selectedVariant) : available[0]?.otherInfo?.split(";")[0]}</span></p>
			<a href={available[0]?.sourceLink || "https://artificialanalysis.ai/models"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">Source: Artificial Analysis <ArrowUpRight className="size-3.5" /></a>
		</div>
	</section>;
}
