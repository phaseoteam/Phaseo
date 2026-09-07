import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ArtificialAnalysisLogo } from "@/components/ArtificialAnalysisLogo";
import type { ModelBenchmarkHighlight } from "@/lib/fetchers/models/getModelBenchmarkData";
import { artificialAnalysisMetrics, artificialAnalysisVersion, formatArtificialAnalysisScore, isArtificialAnalysisBenchmark } from "@/lib/benchmarks/artificialAnalysis";
export { isArtificialAnalysisBenchmark } from "@/lib/benchmarks/artificialAnalysis";

export function ArtificialAnalysisBenchmarks({ highlights }: { highlights: ModelBenchmarkHighlight[] }) {
  const available = highlights.filter((item) => isArtificialAnalysisBenchmark(item.benchmarkId) && item.score !== null);
  if (!available.length) return null;
  const provenance = [...new Set(available.map((item) => item.otherInfo).filter(Boolean))];
  const versions = [...new Set(available.map((item) => artificialAnalysisVersion(item.otherInfo)).filter(Boolean))];
  const configuration = available[0]?.otherInfo?.split(";")[0];
  return <section className="overflow-hidden rounded-xl border bg-card" aria-label="Artificial Analysis benchmarks">
    <div className="flex flex-wrap items-center justify-between gap-4 border-b px-5 py-4">
      <div className="flex items-center gap-3"><ArtificialAnalysisLogo /><div>
        <h2 className="font-semibold">Artificial Analysis</h2>
        <p className="text-xs text-muted-foreground">Independent evaluations{versions.length ? ` · Index v${versions.join(" / v")}` : ""}</p>
      </div></div>
      <a href={available[0]?.sourceLink || "https://artificialanalysis.ai/models"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">Source: Artificial Analysis <ArrowUpRight className="size-3.5" /></a>
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
    <div className="space-y-2 border-t bg-muted/20 px-5 py-3 text-xs text-muted-foreground">
      {configuration ? <p>Tested configuration: <span className="text-foreground">{configuration}</span></p> : null}
      {provenance.length ? <details><summary className="cursor-pointer hover:text-foreground">Source and evaluation details</summary><ul className="mt-2 space-y-1 break-words">{provenance.map((info) => <li key={info}>{info}</li>)}</ul></details> : null}
    </div>
  </section>;
}
