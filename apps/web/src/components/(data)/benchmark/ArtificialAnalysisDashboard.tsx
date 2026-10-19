"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { parseAsArrayOf, parseAsString, useQueryStates } from "nuqs";
import { Check, Search, SlidersHorizontal } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "@/i18n/navigation";
import { localizedBenchmarkConfiguration } from "@/i18n/benchmark-display";
import { dashboardBenchmarks, effortOrder, type DashboardRow } from "@/lib/benchmarks/artificialAnalysisDashboard";
import { ArtificialAnalysisDashboardChart, dashboardColour } from "./ArtificialAnalysisDashboardChart";
import { BenchmarkDisclosure } from "./BenchmarkDisclosure";

const capabilities = ["financeAndAccounting", "strategyAndOps", "legal", "healthcareAndMedical", "engineering", "economics"] as const;
const sections = ["comparisons", "tokenUsage", "cost", "benchmarks", "capabilities"] as const;
export default function ArtificialAnalysisDashboard({ rows }: { rows: DashboardRow[] }) {
	const tx = useTranslations();
	const t = useTranslations("Catalogue.benchmarks.explorer");
	const locale = useLocale();
	const [search, setSearch] = useState("");
	const [highlight, setHighlight] = useState<string | null>(null);
	const [filters, setFilters] = useQueryStates({ aaModels: parseAsArrayOf(parseAsString), aaEffort: parseAsString.withDefault(""), aaBench: parseAsString.withDefault("terminalBench40"), aaDomain: parseAsString.withDefault("financeAndAccounting") }, { shallow: true, scroll: false });
	const models = useMemo(() => {
		const models = new Map<string, DashboardRow>();
		for (const row of rows) if (!models.has(row.modelId) || (row.intelligence ?? -Infinity) > (models.get(row.modelId)!.intelligence ?? -Infinity)) models.set(row.modelId, row);
		return [...models.values()].sort((a, b) => (b.intelligence ?? -Infinity) - (a.intelligence ?? -Infinity) || a.modelName.localeCompare(b.modelName));
	}, [rows]);
	const selected = new Set(filters.aaModels ?? models.slice(0, 10).map((row) => row.modelId));
	const visible = rows.filter((row) => selected.has(row.modelId) && (!filters.aaEffort || row.effort === filters.aaEffort));
	const availableBenchmarks = Object.keys(dashboardBenchmarks).filter((key) => rows.some((row) => typeof row.benchmarks[key] === "number"));
	const benchmark = availableBenchmarks.includes(filters.aaBench) ? filters.aaBench : availableBenchmarks[0];
	const domain = capabilities.includes(filters.aaDomain as typeof capabilities[number]) ? filters.aaDomain : capabilities[0];
	const number = (value: number | null) => value === null ? "—" : new Intl.NumberFormat(locale, { maximumSignificantDigits: 12 }).format(value);
	const picker = <>
		<div className="flex items-center justify-between border-b px-3 py-3 text-sm font-medium"><span>{tx("Common.nav.models")}</span><span className="tabular-nums text-muted-foreground">{selected.size} / {models.length}</span></div>
		<div className="p-2"><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} aria-label={tx("Catalogue.rankings.searchModels")} placeholder={tx("Catalogue.benchmarks.filterModels")} className="pl-8" /></div></div>
		<div className="px-2 pb-2"><Select value={filters.aaEffort || "all"} onValueChange={(value) => void setFilters({ aaEffort: value === "all" ? "" : value })}><SelectTrigger className="w-full" aria-label={tx("Common.ui.benchmarkChartCopy.modelConfiguration")}><SelectValue>{filters.aaEffort ? localizedBenchmarkConfiguration(filters.aaEffort, tx) : tx("Catalogue.benchmarks.allConfigurations")}</SelectValue></SelectTrigger><SelectContent><SelectItem value="all">{tx("Catalogue.benchmarks.allConfigurations")}</SelectItem>{[...new Set(rows.map((row) => row.effort))].sort((a, b) => effortOrder.indexOf(a) - effortOrder.indexOf(b)).map((effort) => <SelectItem key={effort} value={effort}>{localizedBenchmarkConfiguration(effort, tx)}</SelectItem>)}</SelectContent></Select></div>
		<div className="max-h-[min(50vh,30rem)] overflow-y-auto overscroll-contain p-1" role="group" aria-label={tx("Common.nav.models")}>
			{models.filter((model) => model.modelName.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).map((model) => <button key={model.modelId} type="button" role="checkbox" aria-checked={selected.has(model.modelId)} onClick={() => { const next = new Set(selected); if (next.has(model.modelId)) next.delete(model.modelId); else next.add(model.modelId); void setFilters({ aaModels: [...next] }); }} onMouseEnter={() => setHighlight(selected.has(model.modelId) ? model.modelId : null)} onMouseLeave={() => setHighlight(null)} onFocus={() => setHighlight(model.modelId)} onBlur={() => setHighlight(null)} className="flex min-h-10 w-full items-center gap-2 rounded px-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
				<span className="relative size-5 shrink-0"><Logo id={model.creatorId} alt="" fill className="object-contain" /></span><span className="min-w-0 flex-1 truncate">{model.modelName}</span><span className="size-2 shrink-0 rounded-full" style={{ background: dashboardColour(model) }} />{selected.has(model.modelId) ? <Check className="size-3.5 shrink-0" /> : <span className="size-3.5 shrink-0" />}
			</button>)}
		</div>
		<div className="grid gap-1 border-t p-2"><Button variant="ghost" size="sm" onClick={() => void setFilters({ aaModels: null })}>{tx("Common.ui.rankings.showTop", { count: 10 })}</Button><Button variant="ghost" size="sm" onClick={() => void setFilters({ aaModels: models.map((model) => model.modelId) })}>{tx("Common.ui.benchmarkChartCopy.showAllModels")}</Button></div>
	</>;
	const chart = (title: string, value: (row: DashboardRow) => number | null, unit?: "usd" | "tokens", xValue?: (row: DashboardRow) => number | null, xLabel?: string, xUnit?: "usd" | "seconds") => <ArtificialAnalysisDashboardChart title={title} rows={visible} value={value} unit={unit} xValue={xValue} xLabel={xLabel} xUnit={xUnit} highlight={highlight} />;
	return <div>
		<nav aria-label={tx("Catalogue.benchmarks.tocIndexComparisons")} className="sticky top-16 z-20 flex items-center gap-4 border-b bg-background/95 py-3 backdrop-blur">
			<div className="flex min-w-0 flex-1 gap-5 overflow-x-auto">{sections.map((section) => <a key={section} href={`#aa-${section}`} className="shrink-0 text-sm font-medium text-muted-foreground hover:text-foreground">{t(section)}</a>)}</div>
			<Popover><PopoverTrigger asChild><Button variant="outline" size="sm" className="ml-auto gap-2 lg:hidden"><SlidersHorizontal className="size-4" />{tx("Common.nav.models")} ({selected.size})</Button></PopoverTrigger><PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">{picker}</PopoverContent></Popover>
		</nav>
		<div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
			<div className="min-w-0">
				{!selected.size ? <p role="status" className="py-24 text-center text-muted-foreground">{tx("Common.ui.benchmarkChartCopy.selectModelsToCompare")}</p> : <>
					<div id="aa-comparisons" className="scroll-mt-32">{chart(`${t("costPerTask")} × ${tx("Catalogue.rankings.benchmarkMetrics.intelligence")}`, (row) => row.intelligence, undefined, (row) => row.costPerTask, `${t("costPerTask")} (USD)`, "usd")}{chart(`${t("timePerTask")} × ${tx("Catalogue.rankings.benchmarkMetrics.intelligence")}`, (row) => row.intelligence, undefined, (row) => row.timePerTask, `${t("timePerTask")} (s)`, "seconds")}</div>
					<div id="aa-tokenUsage" className="scroll-mt-32"><h2 className="pt-10 text-xl font-semibold tracking-tight">{t("tokenUsage")}</h2>{chart(t("tokensPerTask"), (row) => row.tokensPerTask, "tokens")}{chart(t("totalOutputTokens"), (row) => row.totalTokens, "tokens")}</div>
					<div id="aa-cost" className="scroll-mt-32"><h2 className="pt-10 text-xl font-semibold tracking-tight">{t("cost")}</h2>{chart(t("costPerTask"), (row) => row.costPerTask, "usd")}{chart(t("totalCost"), (row) => row.totalCost, "usd")}</div>
					<div id="aa-benchmarks" className="scroll-mt-32"><h2 className="py-6 text-xl font-semibold tracking-tight">{t("benchmarks")}</h2>{availableBenchmarks.length ? <><Select value={benchmark} onValueChange={(value) => void setFilters({ aaBench: value })}><SelectTrigger className="w-full sm:w-72" aria-label={t("benchmarks")}><SelectValue>{dashboardBenchmarks[benchmark]}</SelectValue></SelectTrigger><SelectContent>{availableBenchmarks.map((key) => <SelectItem key={key} value={key}>{dashboardBenchmarks[key]}</SelectItem>)}</SelectContent></Select>{chart(dashboardBenchmarks[benchmark], (row) => row.benchmarks[benchmark] ?? null)}</> : null}</div>
					<div id="aa-capabilities" className="scroll-mt-32"><h2 className="py-6 text-xl font-semibold tracking-tight">{t("capabilities")}</h2><Select value={domain} onValueChange={(value) => void setFilters({ aaDomain: value })}><SelectTrigger className="w-full sm:w-72" aria-label={t("capabilities")}><SelectValue>{t(domain as typeof capabilities[number])}</SelectValue></SelectTrigger><SelectContent>{capabilities.map((key) => <SelectItem key={key} value={key}>{t(key)}</SelectItem>)}</SelectContent></Select>{chart(t(domain as typeof capabilities[number]), (row) => row.capabilities[domain] ?? null)}</div>
					<BenchmarkDisclosure title={tx("Catalogue.rankings.intelligenceValue.evaluatedConfigurations")} count={String(visible.length)}><div className="max-h-96 overflow-auto"><table className="w-full text-left text-sm"><caption className="sr-only">{tx("Catalogue.rankings.intelligenceValue.evaluatedConfigurations")}</caption><thead className="sticky top-0 bg-background"><tr><th className="p-3">{tx("Catalogue.rankings.intelligenceValue.modelConfiguration")}</th>{[tx("Catalogue.rankings.benchmarkMetrics.intelligence"), t("tokensPerTask"), t("totalOutputTokens"), `${t("costPerTask")} (USD)`, `${t("totalCost")} (USD)`, `${t("timePerTask")} (s)`, dashboardBenchmarks[benchmark] ?? t("score"), t(domain as typeof capabilities[number])].map((label) => <th key={label} className="p-3 text-right font-medium">{label}</th>)}</tr></thead><tbody className="divide-y">{visible.map((row) => <tr key={row.id}><th className="min-w-56 p-3 font-normal"><Link href={`/models/${row.modelId}`} className="hover:underline">{row.sourceName}</Link></th>{[row.intelligence, row.tokensPerTask, row.totalTokens, row.costPerTask, row.totalCost, row.timePerTask, row.benchmarks[benchmark] ?? null, row.capabilities[domain] ?? null].map((value, index) => <td key={index} className="p-3 text-right tabular-nums">{number(value)}</td>)}</tr>)}</tbody></table></div></BenchmarkDisclosure>
				</>}
			</div>
			<aside aria-label={tx("Common.nav.models")} className="sticky top-32 mt-6 hidden overflow-hidden rounded-lg border lg:block">{picker}</aside>
		</div>
	</div>;
}
