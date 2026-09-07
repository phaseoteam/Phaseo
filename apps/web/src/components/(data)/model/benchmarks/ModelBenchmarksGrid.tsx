"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ModelBenchmarkHighlight } from "@/lib/fetchers/models/getModelBenchmarkData";

export function ModelBenchmarksGrid({ highlights }: { highlights: ModelBenchmarkHighlight[] }) {
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const filtered = [...highlights].filter((item) => item.benchmarkName.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b.totalModels ?? 0) - (a.totalModels ?? 0) || a.benchmarkName.localeCompare(b.benchmarkName));
  return <div className="space-y-3">
    {highlights.length > 8 ? <Input aria-label="Search model benchmarks" placeholder="Search benchmarks" value={search} onChange={(e) => setSearch(e.target.value)} className="sm:max-w-xs" /> : null}
    <div className="grid gap-x-6 sm:grid-cols-2">
      {(showAll || search ? filtered : filtered.slice(0, 8)).map((item) => <div key={item.benchmarkId} className="border-b py-3">
        <div className="flex items-center justify-between gap-4"><Link href={`/benchmarks/${item.benchmarkId}`} className="text-sm font-medium hover:underline">{item.benchmarkName}</Link><span className="shrink-0 text-sm font-semibold tabular-nums">{item.scoreDisplay}</span></div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">{item.isSelfReported ? <span>Self-reported</span> : null}{item.sourceLink ? <a href={item.sourceLink} target="_blank" rel="noreferrer" className="hover:underline">Source ↗</a> : null}{item.otherInfo ? <details><summary className="cursor-pointer">Details</summary><p className="mt-1 break-words">{item.otherInfo}</p></details> : null}</div>
      </div>)}
    </div>
    {!filtered.length ? <p className="py-6 text-sm text-muted-foreground">No benchmarks match your search.</p> : null}
    {!search && filtered.length > 8 ? <Button variant="ghost" size="sm" onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer benchmarks" : `Show all ${filtered.length} benchmarks`}</Button> : null}
  </div>;
}
