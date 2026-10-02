"use client";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { IntelligenceValueComparison } from "./IntelligenceValueComparison";
import { useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { Logo } from "@/components/Logo";
import { ArtificialAnalysisLogo } from "@/components/ArtificialAnalysisLogo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { artificialAnalysisMetricKey, artificialAnalysisMetrics, artificialAnalysisVersion, formatArtificialAnalysisScore } from "@/lib/benchmarks/artificialAnalysis";
import type { PublicBenchmarkRanking, PublicIntelligenceValue } from "@/lib/fetchers/frontend/fetchPublicCatalog";

const metrics = [...artificialAnalysisMetrics, { key: "value", id: "aa-intelligence-index-v4" }] as const;

export function BenchmarkRankingsSection({ benchmarks, intelligenceValue }: { benchmarks: PublicBenchmarkRanking[]; intelligenceValue?: PublicIntelligenceValue }) {
  const locale = useLocale();
  const t = useTranslations("Catalogue.rankings");
  const metricLabel = (key: (typeof metrics)[number]["key"]) => key === "value" ? t("intelligenceValue.metricTitle") : t(`benchmarkMetrics.${key}`);
  const [selectedMetric, setSelectedMetric] = useState<(typeof metrics)[number]["key"]>(metrics[0].key);
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(20);
  const benchmark = benchmarks.find((item) => artificialAnalysisMetricKey(item.benchmark_id) === selectedMetric);
  const selected = benchmark?.benchmark_id ?? intelligenceValue?.benchmark_id ?? "aa-intelligence-index-v4";
  const metric = metrics.find((item) => item.key === selectedMetric)!;
  const entries = selectedMetric === "value" ? intelligenceValue?.entries ?? [] : benchmark?.entries ?? [];
  const valueEntries = (intelligenceValue?.entries ?? []).filter((entry) => `${entry.model_name} ${entry.organisation_name ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  const filtered = entries.filter((entry) => `${entry.model_name} ${entry.organisation_name ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  const versions = [...new Set(entries.map((entry) => artificialAnalysisVersion(entry.other_info)).filter(Boolean))];
  const maximum = Math.max(1, ...entries.map((entry) => entry.score));
  return <section id="benchmarks" className="scroll-mt-32 space-y-5 border-t pt-12">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><ArtificialAnalysisLogo size={32} /><div><h2 className="text-2xl font-semibold">{t("benchmarkRankings")}</h2><p className="text-sm text-muted-foreground">{t("independentEvaluations")}</p></div></div>
      <a href="https://artificialanalysis.ai/models" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">{t("viewBenchmarkMethodology")} <ArrowUpRight className="size-4" /></a>
    </div>
    <div>
      <div className="flex gap-6 overflow-x-auto border-b" role="group" aria-label={t("benchmarkMetric")}>
        {metrics.map((item) => <button key={item.key} type="button" aria-pressed={selectedMetric === item.key} onClick={() => { setSelectedMetric(item.key); setLimit(20); }} className={`shrink-0 border-b-2 py-3 text-sm transition-colors hover:text-foreground ${selectedMetric === item.key ? "border-foreground font-semibold" : "border-transparent text-muted-foreground"}`}>{metricLabel(item.key)}</button>)}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b py-5">
        <div><h3 className="font-semibold">{metricLabel(metric.key)}</h3><p className="mt-1 text-xs text-muted-foreground">{t(selectedMetric === "value" ? "intelligenceValue.matchedConfigurations" : "matchedPhaseoModels", { count: new Intl.NumberFormat(locale).format(entries.length) })} · {selectedMetric === "value" ? t("intelligenceValue.valueExplanation") : selectedMetric === "cost" ? `${t("lowerCostIsBetter")} · USD` : t("higherIsBetter")}{versions.length ? ` · ${t("indexVersion", { versions: versions.join(" / v") })}` : ""}</p></div>
        <div className="relative w-full sm:w-64"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label={t("searchRankedModels")} placeholder={t("searchModels")} value={search} onChange={(e) => { setSearch(e.target.value); setLimit(20); }} className="pl-9" /></div>
      </div>
      {selectedMetric === "value" && valueEntries.length > 0 ? <IntelligenceValueComparison entries={valueEntries} total={entries.length} limit={limit} onShowMore={() => setLimit((value) => value + 20)} /> : null}
      {selectedMetric !== "value" ? <ol className="divide-y">
        {filtered.slice(0, limit).map((entry) => <li key={entry.model_id} className="relative grid min-h-20 grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-3 py-3 sm:grid-cols-[2rem_2rem_minmax(0,1fr)_auto]">
          <span className="text-sm tabular-nums text-muted-foreground">{entry.rank}</span>
          <span className="hidden size-8 items-center justify-center rounded-md border sm:flex"><Logo id={entry.organisation_id ?? entry.model_id} alt="" width={20} height={20} /></span>
          <div className="min-w-0"><Link href={`/models/${entry.model_id}`} className="block truncate text-sm font-medium hover:underline">{entry.model_name}</Link><p className="mt-1 truncate text-xs text-muted-foreground" title={entry.other_info ?? undefined}>{entry.other_info?.split(";")[0] ?? entry.organisation_name}</p></div>
          <div className="min-w-20 text-right"><span className="text-sm font-semibold tabular-nums">{formatArtificialAnalysisScore(selected, entry.score, locale)}</span><div className="mt-2 h-1 w-20 overflow-hidden rounded-full bg-muted sm:w-28" aria-hidden="true"><div className="h-full rounded-full bg-foreground/65" style={{ width: `${Math.max(0, (selectedMetric === "cost" ? 1 - entry.score / maximum : entry.score / maximum) * 100)}%` }} /></div></div>
        </li>)}
      </ol> : null}
      {!filtered.length ? <p className="px-5 py-10 text-center text-sm text-muted-foreground">{entries.length ? t("noSearchMatches") : t("noMetricResults")}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t py-4 text-xs text-muted-foreground">
        <Link href={`/benchmarks/${selected}`} className="inline-flex items-center gap-1 hover:text-foreground">{t("allEvaluationResults")} <ArrowUpRight className="size-3.5" /></Link>
        {selectedMetric !== "value" ? filtered.length > limit ? <Button variant="ghost" size="sm" onClick={() => setLimit((value) => value + 20)}>{t("usageShowMore")}</Button> : <span>{t("resultCount", { count: new Intl.NumberFormat(locale).format(filtered.length) })}</span> : null}
      </div>
    </div>
  </section>;
}
