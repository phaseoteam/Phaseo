"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useQueryState } from "nuqs";
import { ArrowUpRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArtificialAnalysisLogo } from "@/components/ArtificialAnalysisLogo";
import { artificialAnalysisMetrics } from "@/lib/benchmarks/artificialAnalysis";
import type { BenchmarkCard } from "@/lib/fetchers/benchmarks/types";

export default function BenchmarksDisplay({ benchmarks }: { benchmarks: BenchmarkCard[] }) {
  const [search, setSearch] = useQueryState("search", { defaultValue: "" });
  const [sort, setSort] = useState("coverage");
  const [limit, setLimit] = useState(36);
  const filtered = useMemo(() => benchmarks.filter((b) => b.benchmark_name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => sort === "name" ? a.benchmark_name.localeCompare(b.benchmark_name) : (b.total_models ?? 0) - (a.total_models ?? 0)), [benchmarks, search, sort]);
  return <div className="space-y-8">
    <div><h1 className="text-3xl font-semibold tracking-tight">Benchmarks</h1><p className="mt-2 text-sm text-muted-foreground">Compare model capability across independent evaluations.</p></div>
    <section className="overflow-hidden rounded-xl border bg-card" aria-label="Featured Artificial Analysis benchmarks">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div className="flex items-center gap-3"><ArtificialAnalysisLogo /><div><h2 className="font-semibold">Artificial Analysis</h2><p className="text-xs text-muted-foreground">Intelligence, coding, agents and evaluation cost</p></div></div>
        <a href="https://artificialanalysis.ai/models" target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:underline">Source: Artificial Analysis ↗</a>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4">
        {artificialAnalysisMetrics.map((metric) => {
          const benchmark = benchmarks.find((item) => item.benchmark_id === metric.id);
          return <Link key={metric.id} href={`/benchmarks/${metric.id}`} className="group space-y-3 border-b p-4 transition-colors hover:bg-muted/40 odd:border-r lg:border-b-0 lg:border-r lg:last:border-r-0 sm:p-5">
            <span className="flex items-center justify-between font-medium">{metric.label}<ArrowUpRight className="size-4 text-muted-foreground group-hover:text-foreground" /></span>
            <p className="min-h-10 text-sm text-muted-foreground">{metric.description}</p>
            <p className="text-xs tabular-nums">{benchmark ? `${(benchmark.total_models ?? 0).toLocaleString()} evaluated models` : "View results"}</p>
          </Link>;
        })}
      </div>
    </section>
    <section className="space-y-4" aria-label="All benchmarks">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">All benchmarks <span className="ml-1 text-sm font-normal text-muted-foreground">{filtered.length}</span></h2>
        <div className="flex w-full gap-2 sm:w-auto">
          <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="Search benchmarks" placeholder="Search benchmarks" value={search} onChange={(e) => { setSearch(e.target.value); setLimit(36); }} className="pl-9 sm:w-64" /></div>
          <select aria-label="Sort benchmarks" value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-md border bg-background px-3 text-sm"><option value="coverage">Most models</option><option value="name">Name A–Z</option></select>
        </div>
      </div>
      <div className="grid gap-x-8 md:grid-cols-2 xl:grid-cols-3">
        {filtered.slice(0, limit).map((benchmark) => <Link key={benchmark.benchmark_id} href={`/benchmarks/${benchmark.benchmark_id}`} className="group flex min-h-20 items-center justify-between gap-4 border-b py-4">
          <div className="min-w-0"><h3 className="text-sm font-medium group-hover:underline">{benchmark.benchmark_name}</h3><p className="mt-1 text-xs text-muted-foreground">{(benchmark.total_models ?? 0).toLocaleString()} models</p></div><ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>)}
      </div>
      {!filtered.length ? <p className="py-10 text-center text-sm text-muted-foreground">No benchmarks match your search.</p> : null}
      {filtered.length > limit ? <div className="pt-3 text-center"><Button variant="outline" onClick={() => setLimit((value) => value + 36)}>Show more benchmarks</Button><p className="mt-2 text-xs text-muted-foreground">Showing {limit} of {filtered.length}</p></div> : null}
    </section>
  </div>;
}
