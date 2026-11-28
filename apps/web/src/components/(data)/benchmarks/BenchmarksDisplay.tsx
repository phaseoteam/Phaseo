import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "@/i18n/react";
import { ArrowUpRight } from "lucide-react";
import { ArtificialAnalysisLogo } from "@/components/ArtificialAnalysisLogo";
import { artificialAnalysisMetrics } from "@/lib/benchmarks/artificialAnalysis";
import type { BenchmarkCard, BenchmarkDirectoryEntry } from "@/lib/fetchers/benchmarks/types";
import { BenchmarksDirectory } from "./BenchmarksDirectory";

export default function BenchmarksDisplay({ benchmarks, directory = [] }: { benchmarks: BenchmarkCard[]; directory?: BenchmarkDirectoryEntry[] }) {
  const locale = useLocale();
  const t = useTranslations("Catalogue.benchmarks");
  const rankingT = useTranslations("Catalogue.rankings");
  const artificialAnalysis = benchmarks.find((benchmark) => benchmark.benchmark_id === "artificial-analysis");
  // Before the directory endpoint is live the plain benchmark list stands in, with counts only.
  const entries: BenchmarkDirectoryEntry[] = directory.length ? directory : benchmarks.filter((benchmark) => benchmark.benchmark_id !== "artificial-analysis" && (benchmark.total_models ?? 0) > 0).map((benchmark) => ({ id: benchmark.benchmark_id, name: benchmark.benchmark_name, higherIsBetter: true, models: benchmark.total_models ?? 0, results: benchmark.total_models ?? 0, independent: 0 }));
  return <div className="space-y-8">
    <div><h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1><p className="mt-2 text-sm text-muted-foreground">{t("directoryDescription")}</p></div>
    {artificialAnalysis ? <section className="overflow-hidden rounded-md border bg-card" aria-label={t("featuredAnalysis")}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div className="flex items-center gap-3"><ArtificialAnalysisLogo /><div><h2 className="font-semibold">Artificial Analysis</h2><p className="text-xs text-muted-foreground">{t("featuredDescription")}</p></div></div>
        <a href="https://artificialanalysis.ai/models" target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:underline">{rankingT("sourceLabel")}: Artificial Analysis ↗</a>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4">
        {artificialAnalysisMetrics.filter((metric) => artificialAnalysis.metrics?.some((item) => item.key === metric.key && item.total_models > 0)).map((metric) => {
          const benchmark = artificialAnalysis.metrics?.find((item) => item.key === metric.key);
          return <Link key={metric.key} href={`/benchmarks/artificial-analysis?metric=${metric.key}`} className="group space-y-3 border-b p-4 transition-colors hover:bg-muted/40 odd:border-r lg:border-b-0 lg:border-r lg:last:border-r-0 sm:p-5">
            <span className="flex items-center justify-between font-medium">{rankingT(`benchmarkMetrics.${metric.key}`)}<ArrowUpRight className="size-4 text-muted-foreground group-hover:text-foreground" /></span>
            <p className="min-h-10 text-sm text-muted-foreground">{t(`metricDescriptions.${metric.key}`)}</p>
            <p className="text-xs tabular-nums">{benchmark ? t("evaluatedModels", { count: new Intl.NumberFormat(locale).format(benchmark.total_models ?? 0) }) : t("viewResults")}</p>
          </Link>;
        })}
      </div>
    </section> : null}
    <BenchmarksDirectory entries={entries} />
  </div>;
}
