"use client";
import { useState } from "react";
import type { BenchmarkPage } from "@/lib/fetchers/benchmarks/types";
import { artificialAnalysisVersion, formatArtificialAnalysisScore } from "@/lib/benchmarks/artificialAnalysis";
import BenchmarkProgressChart from "./BenchmarkProgressChart";
import ModelsUsingBenchmark from "./ModelsUsingBenchmark";

export function ArtificialAnalysisOverview({ benchmark }: { benchmark: BenchmarkPage }) {
  const versionOf = (info: unknown) => artificialAnalysisVersion(typeof info === "string" ? info : null) ?? "Unspecified";
  const versions = [...new Set(benchmark.results.map((result) => versionOf(result.other_info)))].sort((a, b) => b.localeCompare(a, "en", { numeric: true }));
  const preferredVersion = versions.find((version) => version !== "Unspecified") ?? versions[0] ?? "Unspecified";
  const [selectedVersion, setSelectedVersion] = useState(preferredVersion);
  const results = benchmark.results.filter((result) => versionOf(result.other_info) === selectedVersion && result.score !== null && Number.isFinite(Number(result.score)));
  const current = { ...benchmark, results };
  const cost = benchmark.id === "aa-intelligence-index-cost-v4";
  const sorted = [...results].sort((a, b) => cost ? Number(a.score) - Number(b.score) : Number(b.score) - Number(a.score));
  const updated = results.map((result) => result.updated_at).filter((date): date is string => Boolean(date)).sort().at(-1);
  const best = sorted[0];
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">{cost ? "Cost of completing the full Intelligence Index evaluation in USD. Lower is better." : "Independent model evaluations. Higher scores indicate stronger performance."}</p>
      {versions.length > 1 ? <select aria-label="Index version" value={selectedVersion} onChange={(e) => setSelectedVersion(e.target.value)} className="rounded-md border bg-background p-2 text-sm">{versions.map((version) => <option key={version} value={version}>{version === "Unspecified" ? "Version unspecified" : `Index v${version}`}</option>)}</select> : <span className="text-xs text-muted-foreground">{selectedVersion === "Unspecified" ? "Version unspecified" : `Index v${selectedVersion}`}</span>}
    </div>
    <div className="grid grid-cols-2 overflow-hidden rounded-xl border bg-card lg:grid-cols-4">
      {[
        { label: "Models with results", value: new Set(results.map((result) => result.model_id)).size.toLocaleString() },
        { label: cost ? "Lowest evaluation cost" : "Highest score", value: best ? formatArtificialAnalysisScore(benchmark.id, Number(best.score)) : "—" },
        { label: cost ? "Lowest-cost model" : "Leading model", value: best?.model?.name ?? best?.model_id ?? "—" },
        { label: "Last synced", value: updated ? new Date(updated).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—" },
      ].map((item) => <div key={item.label} className="space-y-3 border-b p-5 odd:border-r lg:border-b-0 lg:border-r lg:last:border-r-0"><p className="text-xs text-muted-foreground">{item.label}</p><p className="text-lg font-semibold tabular-nums">{item.value}</p></div>)}
    </div>
    <p className="text-xs text-muted-foreground">Source: <a href="https://artificialanalysis.ai/models" target="_blank" rel="noreferrer" className="underline underline-offset-2">Artificial Analysis</a>. Results reflect the tested configuration shown in each record.</p>
    <section id="model-results" className="scroll-mt-36"><ModelsUsingBenchmark benchmark={current} /></section>
    <section id="progress" className="scroll-mt-36"><BenchmarkProgressChart benchmark={current} /></section>
  </div>;
}
