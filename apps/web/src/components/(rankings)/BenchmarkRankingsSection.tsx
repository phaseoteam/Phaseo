"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { Logo } from "@/components/Logo";
import { ArtificialAnalysisLogo } from "@/components/ArtificialAnalysisLogo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { artificialAnalysisMetrics, artificialAnalysisVersion, formatArtificialAnalysisScore } from "@/lib/benchmarks/artificialAnalysis";
import type { PublicBenchmarkRanking } from "@/lib/fetchers/frontend/fetchPublicCatalog";

export function BenchmarkRankingsSection({ benchmarks }: { benchmarks: PublicBenchmarkRanking[] }) {
  const [selected, setSelected] = useState<string>(artificialAnalysisMetrics[0].id);
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(20);
  const benchmark = benchmarks.find((item) => item.benchmark_id === selected);
  const metric = artificialAnalysisMetrics.find((item) => item.id === selected)!;
  const entries = benchmark?.entries ?? [];
  const filtered = entries.filter((entry) => `${entry.model_name} ${entry.organisation_name ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  const versions = [...new Set(entries.map((entry) => artificialAnalysisVersion(entry.other_info)).filter(Boolean))];
  const maximum = Math.max(1, ...entries.map((entry) => entry.score));
  return <section id="benchmarks" className="scroll-mt-32 space-y-5 border-t pt-12">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><ArtificialAnalysisLogo size={32} /><div><h2 className="text-2xl font-semibold">Benchmark rankings</h2><p className="text-sm text-muted-foreground">Independent evaluations by Artificial Analysis</p></div></div>
      <a href="https://artificialanalysis.ai/models" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">Source & methodology <ArrowUpRight className="size-4" /></a>
    </div>
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="grid grid-cols-2 border-b lg:grid-cols-4" role="group" aria-label="Benchmark metric">
        {artificialAnalysisMetrics.map((item) => <button key={item.id} type="button" aria-pressed={selected === item.id} onClick={() => { setSelected(item.id); setLimit(20); }} className={`border-b-2 px-4 py-4 text-sm transition-colors hover:bg-muted/40 ${selected === item.id ? "border-foreground bg-muted/50 font-semibold" : "border-transparent text-muted-foreground"}`}>{item.label}</button>)}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
        <div><h3 className="font-semibold">{metric.label}</h3><p className="mt-1 text-xs text-muted-foreground">{entries.length} matched models · {selected.endsWith("cost-v4") ? "Lower cost is better · USD" : "Higher is better"}{versions.length ? ` · Index v${versions.join(" / v")}` : ""}</p></div>
        <div className="relative w-full sm:w-64"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="Search ranked models" placeholder="Search models" value={search} onChange={(e) => { setSearch(e.target.value); setLimit(20); }} className="pl-9" /></div>
      </div>
      <ol className="divide-y px-4 sm:px-5">
        {filtered.slice(0, limit).map((entry) => <li key={entry.model_id} className="relative grid min-h-20 grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-3 py-3 sm:grid-cols-[2rem_2rem_minmax(0,1fr)_auto]">
          <span className="text-sm tabular-nums text-muted-foreground">{entry.rank}</span>
          <span className="hidden size-8 items-center justify-center rounded-md border sm:flex"><Logo id={entry.organisation_id ?? entry.model_id} alt="" width={20} height={20} /></span>
          <div className="min-w-0"><Link href={`/models/${entry.model_id}`} className="block truncate text-sm font-medium hover:underline">{entry.model_name}</Link><p className="mt-1 truncate text-xs text-muted-foreground" title={entry.other_info ?? undefined}>{entry.other_info?.split(";")[0] ?? entry.organisation_name}</p></div>
          <div className="min-w-20 text-right"><span className="text-sm font-semibold tabular-nums">{formatArtificialAnalysisScore(selected, entry.score)}</span><div className="mt-2 h-1 w-20 overflow-hidden rounded-full bg-muted sm:w-28" aria-hidden="true"><div className="h-full rounded-full bg-foreground/65" style={{ width: `${Math.max(0, entry.score / maximum * 100)}%` }} /></div></div>
        </li>)}
      </ol>
      {!filtered.length ? <p className="px-5 py-10 text-center text-sm text-muted-foreground">{entries.length ? "No models match your search." : "No results available for this metric yet."}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4 text-xs text-muted-foreground">
        <Link href={`/benchmarks/${selected}`} className="inline-flex items-center gap-1 hover:text-foreground">All results and evaluation details <ArrowUpRight className="size-3.5" /></Link>
        {filtered.length > limit ? <Button variant="ghost" size="sm" onClick={() => setLimit((value) => value + 20)}>Show more</Button> : <span>{filtered.length} results</span>}
      </div>
    </div>
  </section>;
}
