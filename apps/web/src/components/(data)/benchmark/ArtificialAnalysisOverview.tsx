"use client";
import type { BenchmarkPage } from "@/lib/fetchers/benchmarks/types";
import { artificialAnalysisVersion, formatArtificialAnalysisScore, isArtificialAnalysisCostBenchmark } from "@/lib/benchmarks/artificialAnalysis";
import BenchmarkProgressChart from "./BenchmarkProgressChart";
import ModelsUsingBenchmark from "./ModelsUsingBenchmark";

export function ArtificialAnalysisOverview({ benchmark }: { benchmark: BenchmarkPage }) {
  const versionOf = (info: unknown) => artificialAnalysisVersion(typeof info === "string" ? info : null) ?? "Unspecified";
  const versions = [...new Set(benchmark.results.map((result) => versionOf(result.other_info)))].sort((a, b) => b.localeCompare(a, "en", { numeric: true }));
  const latestVersion = versions.find((version) => version !== "Unspecified") ?? versions[0] ?? "Unspecified";
  const results = benchmark.results.filter((result) => versionOf(result.other_info) === latestVersion && result.score !== null && Number.isFinite(Number(result.score)));
  const current = { ...benchmark, results };
  const cost = isArtificialAnalysisCostBenchmark(benchmark.id);
  const sorted = [...results].sort((a, b) => cost ? Number(a.score) - Number(b.score) : Number(b.score) - Number(a.score));
  const updated = results.map((result) => result.updated_at).filter((date): date is string => Boolean(date)).sort().at(-1);
  const best = sorted[0];
  return <div className="space-y-6">
    <section id="summary" className="scroll-mt-36 space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
	  <p className="text-sm text-muted-foreground">{cost ? "Cost Of Completing The Full Intelligence Index Evaluation In USD. Lower Is Better." : "Independent Model Evaluations. Higher Scores Indicate Stronger Performance."}</p>
      <span className="text-xs text-muted-foreground">{latestVersion === "Unspecified" ? "Version unspecified" : `Index v${latestVersion}`}</span>
    </div>
    <div className="grid grid-cols-2 overflow-hidden rounded-xl border bg-card lg:grid-cols-4">
      {[
		{ label: "Models With Results", value: new Set(results.map((result) => result.model_id)).size.toLocaleString() },
		{ label: cost ? "Lowest Evaluation Cost" : "Highest Score", value: best ? formatArtificialAnalysisScore(benchmark.id, Number(best.score)) : "—" },
		{ label: cost ? "Lowest-Cost Model" : "Leading Model", value: best?.model?.name ?? best?.model_id ?? "—" },
		{ label: "Last Synced", value: updated ? new Date(updated).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—" },
      ].map((item) => <div key={item.label} className="space-y-3 border-b p-5 odd:border-r lg:border-b-0 lg:border-r lg:last:border-r-0"><p className="text-xs text-muted-foreground">{item.label}</p><p className="text-lg font-semibold tabular-nums">{item.value}</p></div>)}
    </div>
    <p className="text-xs text-muted-foreground">Source: <a href="https://artificialanalysis.ai/models" target="_blank" rel="noreferrer" className="underline underline-offset-2">Artificial Analysis</a>. Results reflect the tested configuration shown in each record.</p>
    </section>
    <section id="model-results" className="scroll-mt-36"><ModelsUsingBenchmark benchmark={current} /></section>
    <section id="progress" className="scroll-mt-36"><BenchmarkProgressChart benchmark={current} /></section>
  </div>;
}
