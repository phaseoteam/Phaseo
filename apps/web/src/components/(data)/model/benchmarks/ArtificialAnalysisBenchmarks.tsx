import Link from "next/link";
import { Card } from "@/components/ui/card";
import type { ModelBenchmarkHighlight } from "@/lib/fetchers/models/getModelBenchmarkData";

const metrics = [
	["aa-intelligence-index-v4", "Intelligence"],
	["aa-coding-index-v4", "Coding"],
	["aa-agentic-index-v4", "Agentic"],
	["aa-intelligence-index-cost-v4", "Evaluation cost"],
] as const;

export function isArtificialAnalysisBenchmark(id: string) {
	return metrics.some(([metricId]) => metricId === id);
}

export function ArtificialAnalysisBenchmarks({ highlights }: { highlights: ModelBenchmarkHighlight[] }) {
	const available = highlights.filter((item) => isArtificialAnalysisBenchmark(item.benchmarkId));
	if (!available.length) return null;
	const provenance = [...new Set(available.map((item) => item.otherInfo).filter(Boolean))];
	return (
		<section className="space-y-3" aria-label="Artificial Analysis benchmarks">
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<h2 className="text-xl font-semibold">Artificial Analysis</h2>
				<a href="https://artificialanalysis.ai/" target="_blank" rel="noreferrer" className="text-sm text-muted-foreground underline underline-offset-4">Source: Artificial Analysis</a>
			</div>
			<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
				{metrics.map(([id, label]) => {
					const result = available.find((item) => item.benchmarkId === id);
					const score = result?.score;
					const cost = id === "aa-intelligence-index-cost-v4";
					const display = score == null ? "Not available" : cost
						? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(score)
						: new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(score);
					return <Card key={id} className="gap-2 p-4">
						{result ? <Link href={`/benchmarks/${id}`} className="text-sm font-medium hover:underline">{label}</Link> : <span className="text-sm font-medium">{label}</span>}
						<span className={score == null ? "text-sm text-muted-foreground" : "text-2xl font-semibold tabular-nums"}>{display}</span>
						{cost ? <span className="text-xs text-muted-foreground">Full Intelligence Index evaluation · USD</span> : null}
					</Card>;
				})}
			</div>
			{provenance.length ? <details className="text-xs text-muted-foreground">
				<summary className="cursor-pointer">Evaluation details</summary>
				<ul className="mt-2 space-y-1">{provenance.map((info) => <li key={info}>{info}</li>)}</ul>
			</details> : null}
		</section>
	);
}
