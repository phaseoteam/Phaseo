"use client";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useQueryState } from "nuqs";
import { ArrowUpRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArtificialAnalysisLogo } from "@/components/ArtificialAnalysisLogo";
import { artificialAnalysisMetrics } from "@/lib/benchmarks/artificialAnalysis";
import type { BenchmarkCard } from "@/lib/fetchers/benchmarks/types";

export default function BenchmarksDisplay({ benchmarks }: { benchmarks: BenchmarkCard[] }) {
  const locale = useLocale();
  const t = useTranslations("Catalogue.benchmarks");
  const rankingT = useTranslations("Catalogue.rankings");
  const [search, setSearch] = useQueryState("search", { defaultValue: "" });
  const [sort, setSort] = useState("coverage");
  const [limit, setLimit] = useState(36);
  const filtered = useMemo(() => benchmarks.filter((b) => b.benchmark_name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => sort === "name" ? a.benchmark_name.localeCompare(b.benchmark_name, locale) : (b.total_models ?? 0) - (a.total_models ?? 0)), [benchmarks, search, sort, locale]);
  return <div className="space-y-8">
    <div><h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1><p className="mt-2 text-sm text-muted-foreground">{t("directoryDescription")}</p></div>
    <section className="overflow-hidden rounded-xl border bg-card" aria-label={t("featuredAnalysis")}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div className="flex items-center gap-3"><ArtificialAnalysisLogo /><div><h2 className="font-semibold">Artificial Analysis</h2><p className="text-xs text-muted-foreground">{t("featuredDescription")}</p></div></div>
        <a href="https://artificialanalysis.ai/models" target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:underline">{rankingT("sourceLabel")}: Artificial Analysis ↗</a>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4">
        {artificialAnalysisMetrics.map((metric) => {
          const benchmark = benchmarks.find((item) => item.benchmark_id === metric.id);
          return <Link key={metric.id} href={`/benchmarks/${metric.id}`} className="group space-y-3 border-b p-4 transition-colors hover:bg-muted/40 odd:border-r lg:border-b-0 lg:border-r lg:last:border-r-0 sm:p-5">
            <span className="flex items-center justify-between font-medium">{rankingT(`benchmarkMetrics.${metric.key}`)}<ArrowUpRight className="size-4 text-muted-foreground group-hover:text-foreground" /></span>
            <p className="min-h-10 text-sm text-muted-foreground">{t(`metricDescriptions.${metric.key}`)}</p>
            <p className="text-xs tabular-nums">{benchmark ? t("evaluatedModels", { count: new Intl.NumberFormat(locale).format(benchmark.total_models ?? 0) }) : t("viewResults")}</p>
          </Link>;
        })}
      </div>
    </section>
    <section className="space-y-4" aria-label={t("allBenchmarks")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t("allBenchmarks")} <span className="ml-1 text-sm font-normal text-muted-foreground">{new Intl.NumberFormat(locale).format(filtered.length)}</span></h2>
        <div className="flex w-full gap-2 sm:w-auto">
          <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label={t("searchPlaceholder")} placeholder={t("searchPlaceholder")} value={search} onChange={(e) => { setSearch(e.target.value); setLimit(36); }} className="pl-9 sm:w-64" /></div>
          <select aria-label={t("sortBenchmarks")} value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-md border bg-background px-3 text-sm"><option value="coverage">{t("mostModels")}</option><option value="name">{t("nameAlphabetically")}</option></select>
        </div>
      </div>
      <div className="grid gap-x-8 md:grid-cols-2 xl:grid-cols-3">
        {filtered.slice(0, limit).map((benchmark) => <Link key={benchmark.benchmark_id} href={`/benchmarks/${benchmark.benchmark_id}`} className="group flex min-h-20 items-center justify-between gap-4 border-b py-4">
          <div className="min-w-0"><h3 className="text-sm font-medium group-hover:underline">{benchmark.benchmark_name}</h3><p className="mt-1 text-xs text-muted-foreground">{t("modelCount", { count: new Intl.NumberFormat(locale).format(benchmark.total_models ?? 0) })}</p></div><ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>)}
      </div>
      {!filtered.length ? <p className="py-10 text-center text-sm text-muted-foreground">{t("noResults")}</p> : null}
      {filtered.length > limit ? <div className="pt-3 text-center"><Button variant="outline" onClick={() => setLimit((value) => value + 36)}>{t("showMoreBenchmarks")}</Button><p className="mt-2 text-xs text-muted-foreground">{t("showingCount", { shown: new Intl.NumberFormat(locale).format(limit), total: new Intl.NumberFormat(locale).format(filtered.length) })}</p></div> : null}
    </section>
  </div>;
}
