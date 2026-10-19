"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { parseAsArrayOf, parseAsString, useQueryStates } from "nuqs";
import { Check, Download, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "@/i18n/navigation";
import { localizedBenchmarkConfiguration } from "@/i18n/benchmark-display";
import { dashboardBenchmarks, effortOrder, paretoPoints, type DashboardRow } from "@/lib/benchmarks/artificialAnalysisDashboard";
import { ArtificialAnalysisDashboardChart, dashboardColour } from "./ArtificialAnalysisDashboardChart";
import { ArtificialAnalysisScoreMatrix } from "./ArtificialAnalysisScoreMatrix";
import { BenchmarkDisclosure } from "./BenchmarkDisclosure";

const capabilities = ["financeAndAccounting", "strategyAndOps", "legal", "healthcareAndMedical", "engineering", "economics"] as const;
const sections = ["comparisons", "tokenUsage", "cost", "benchmarks", "capabilities"] as const;
export default function ArtificialAnalysisDashboard({ rows }: { rows: DashboardRow[] }) {
	const tx = useTranslations();
	const t = useTranslations("Catalogue.benchmarks.explorer");
	const locale = useLocale();
	const [search, setSearch] = useState("");
	const [highlight, setHighlight] = useState<string | null>(null);
	const [filters, setFilters] = useQueryStates({ aaModels: parseAsArrayOf(parseAsString), aaEffort: parseAsString.withDefault(""), aaEfforts: parseAsArrayOf(parseAsString), aaCreator: parseAsString.withDefault(""), aaLayout: parseAsString.withDefault("overview"), aaBench: parseAsString.withDefault("terminalBench40"), aaDomain: parseAsString.withDefault("financeAndAccounting"), aaSection: parseAsString.withDefault("comparisons"), aaCompare: parseAsString.withDefault("cost"), aaMeasure: parseAsString.withDefault("task") }, { shallow: true, scroll: false });
	const section = sections.includes(filters.aaSection as typeof sections[number]) ? filters.aaSection : "comparisons";
	const models = useMemo(() => {
		const models = new Map<string, DashboardRow>();
		for (const row of rows) if (!models.has(row.modelId) || (row.intelligence ?? -Infinity) > (models.get(row.modelId)!.intelligence ?? -Infinity)) models.set(row.modelId, row);
		return [...models.values()].sort((a, b) => (b.intelligence ?? -Infinity) - (a.intelligence ?? -Infinity) || a.modelName.localeCompare(b.modelName));
	}, [rows]);
	const selected = new Set(filters.aaModels ?? models.slice(0, 10).map((row) => row.modelId));
	const frontierModels = [...new Set(paretoPoints(rows.flatMap((row) => row.costPerTask !== null && row.intelligence !== null ? [{ x: row.costPerTask, y: row.intelligence, modelId: row.modelId }] : [])).map((point) => point.modelId))];
	const selectedEfforts = filters.aaEfforts ?? (filters.aaEffort ? [filters.aaEffort] : null);
	const efforts = [...new Set(rows.map((row) => row.effort))].sort((a, b) => effortOrder.indexOf(a) - effortOrder.indexOf(b));
	const creators = [...new Set(models.map((model) => model.creatorId))].sort();
	const visible = rows.filter((row) => selected.has(row.modelId) && (!selectedEfforts || selectedEfforts.includes(row.effort)) && (!filters.aaCreator || row.creatorId === filters.aaCreator));
	const availableBenchmarks = Object.keys(dashboardBenchmarks).filter((key) => rows.some((row) => typeof row.benchmarks[key] === "number"));
	const benchmark = availableBenchmarks.includes(filters.aaBench) ? filters.aaBench : availableBenchmarks[0];
	const domain = capabilities.includes(filters.aaDomain as typeof capabilities[number]) ? filters.aaDomain : capabilities[0];
	const matchingModels = models.filter((model) => (!filters.aaCreator || model.creatorId === filters.aaCreator) && model.modelName.toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale)));
	const number = (value: number | null) => value === null ? "—" : new Intl.NumberFormat(locale, { maximumSignificantDigits: 12 }).format(value);
	const exportData = () => {
		const columns = ["Model", "Configuration", "Intelligence", "Output tokens per task", "Total output tokens", "Cost per task (USD)", "Total cost (USD)", "Time per task (seconds)", ...availableBenchmarks.map((key) => dashboardBenchmarks[key]), ...capabilities];
		const data = visible.map((row) => [row.sourceName, row.effort, row.intelligence, row.tokensPerTask, row.totalTokens, row.costPerTask, row.totalCost, row.timePerTask, ...availableBenchmarks.map((key) => row.benchmarks[key] ?? null), ...capabilities.map((key) => row.capabilities[key] ?? null)]);
		const cell = (value: string | number | null) => typeof value === "number" ? String(value) : `"${(value && /^[=+@\t\r-]/.test(value) ? `'${value}` : value ?? "").replaceAll('"', '""')}"`;
		const csv = [columns, ...data].map((row) => row.map(cell).join(",")).join("\r\n");
		const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = "artificial-analysis.csv";
		anchor.click();
		URL.revokeObjectURL(url);
	};
	const picker = <>
		<div className="flex items-center justify-between px-3 py-3 text-sm font-semibold"><span>{tx("Common.nav.models")} <span className="ml-1 font-normal tabular-nums text-muted-foreground">{selected.size}</span></span><Button variant="ghost" size="icon-sm" aria-label={tx("Catalogue.models.filtersUi.resetFiltersAndSearch")} onClick={() => { setSearch(""); void setFilters({ aaModels: null, aaEffort: null, aaEfforts: null, aaCreator: null }); }}><RotateCcw className="size-3.5" /></Button></div>
		<div className="p-2"><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} aria-label={tx("Catalogue.rankings.searchModels")} placeholder={tx("Catalogue.benchmarks.filterModels")} className="pl-8" /></div></div>
		<div className="space-y-3 border-b px-3 pb-3">
			<div role="group" aria-label={tx("Common.ui.benchmarkChartCopy.modelConfiguration")}><p className="mb-2 text-xs font-medium text-muted-foreground">{tx("Common.ui.benchmarkChartCopy.modelConfiguration")}</p><div className="flex flex-wrap gap-1">{efforts.map((effort) => <button key={effort} type="button" aria-pressed={!selectedEfforts || selectedEfforts.includes(effort)} onClick={() => { const next = new Set(selectedEfforts ?? efforts); if (next.has(effort)) next.delete(effort); else next.add(effort); void setFilters({ aaEffort: null, aaEfforts: next.size === efforts.length ? null : [...next] }); }} className="rounded-md border border-transparent px-2 py-1 text-xs text-muted-foreground hover:bg-muted aria-pressed:border-border aria-pressed:bg-muted aria-pressed:text-foreground focus-visible:outline-2 focus-visible:outline-ring">{localizedBenchmarkConfiguration(effort, tx)}</button>)}</div></div>
			<Select value={filters.aaCreator || "all"} onValueChange={(value) => void setFilters({ aaCreator: value === "all" ? "" : value })}><SelectTrigger className="h-8 w-full text-xs" aria-label={tx("Catalogue.models.filtersUi.modelCreators")}><SelectValue>{filters.aaCreator || tx("Catalogue.models.filtersUi.modelCreators")}</SelectValue></SelectTrigger><SelectContent><SelectItem value="all">{tx("Catalogue.models.filtersUi.any")}</SelectItem>{creators.map((creator) => <SelectItem key={creator} value={creator}><span className="flex items-center gap-2"><Logo id={creator} alt="" width={16} height={16} />{creator}</span></SelectItem>)}</SelectContent></Select>
		</div>
		<div className="max-h-[min(50vh,30rem)] overflow-y-auto overscroll-contain p-1" role="group" aria-label={tx("Common.nav.models")}>
			{!matchingModels.length ? <p role="status" className="px-3 py-6 text-sm text-muted-foreground">{tx("Catalogue.rankings.noSearchMatches")}</p> : null}
			{matchingModels.map((model) => <button key={model.modelId} type="button" role="checkbox" aria-checked={selected.has(model.modelId)} onClick={() => { const next = new Set(selected); if (next.has(model.modelId)) next.delete(model.modelId); else next.add(model.modelId); void setFilters({ aaModels: [...next] }); }} onMouseEnter={() => setHighlight(selected.has(model.modelId) ? model.modelId : null)} onMouseLeave={() => setHighlight(null)} onFocus={() => setHighlight(model.modelId)} onBlur={() => setHighlight(null)} className={`flex min-h-10 w-full items-center gap-2 rounded px-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected.has(model.modelId) ? "font-medium" : "text-muted-foreground"}`}>
				<span className="relative size-5 shrink-0"><Logo id={model.creatorId} alt="" fill className="object-contain" /></span><span className="min-w-0 flex-1 truncate">{model.modelName}</span><span className="size-2 shrink-0 rounded-full" style={{ background: dashboardColour(model) }} />{selected.has(model.modelId) ? <Check className="size-3.5 shrink-0" /> : <span className="size-3.5 shrink-0" />}
			</button>)}
		</div>
		<div className="flex flex-wrap gap-1 border-t p-2"><Button variant="ghost" size="sm" disabled={!frontierModels.length} onClick={() => void setFilters({ aaModels: frontierModels })}>{t("pareto")}</Button><Button variant="ghost" size="sm" onClick={() => void setFilters({ aaModels: null })}>{tx("Common.ui.rankings.showTop", { count: 10 })}</Button><Button variant="ghost" size="sm" onClick={() => void setFilters({ aaModels: matchingModels.map((model) => model.modelId) })}>{tx("Common.ui.benchmarkChartCopy.showAllModels")}</Button><Button variant="ghost" size="sm" onClick={() => void setFilters({ aaModels: [] })}>{tx("Catalogue.models.filtersUi.clearAll")}</Button></div>
	</>;
	const chart = (title: string, value: (row: DashboardRow) => number | null, unit?: "usd" | "tokens", xValue?: (row: DashboardRow) => number | null, xLabel?: string, xUnit?: "usd" | "seconds") => <ArtificialAnalysisDashboardChart title={title} rows={visible} value={value} unit={unit} xValue={xValue} xLabel={xLabel} xUnit={xUnit} highlight={highlight} />;
	const measurePicker = <div className="flex flex-wrap gap-1">{["task", "total"].map((measure) => <Button key={measure} variant={filters.aaMeasure === measure ? "secondary" : "ghost"} size="sm" aria-pressed={filters.aaMeasure === measure} onClick={() => void setFilters({ aaMeasure: measure })}>{t(section === "cost" ? measure === "task" ? "costPerTask" : "totalCost" : measure === "task" ? "tokensPerTask" : "totalOutputTokens")}</Button>)}</div>;
	return <Tabs value={section} onValueChange={(value) => void setFilters({ aaSection: String(value) })} className="gap-0">
		<nav aria-label={tx("Catalogue.benchmarks.tocIndexComparisons")} className="sticky top-16 z-20 flex items-center gap-4 border-b bg-background/95 py-3 backdrop-blur">
			<div className="min-w-0 flex-1 overflow-x-auto"><TabsList variant="line" aria-label={tx("Catalogue.benchmarks.tocIndexComparisons")} className="h-9 gap-5">{sections.map((section) => <TabsTrigger key={section} value={section} className="px-0">{t(section)}</TabsTrigger>)}</TabsList></div>
			<Button variant="ghost" size="icon-sm" disabled={!visible.length} onClick={exportData} aria-label={`${tx("Common.ui.chatSettings.export")} CSV`}><Download className="size-4" /></Button>
			<Popover><PopoverTrigger asChild><Button variant="outline" size="sm" className="ml-auto gap-2 lg:hidden"><SlidersHorizontal className="size-4" />{tx("Common.nav.models")} ({selected.size})</Button></PopoverTrigger><PopoverContent align="end" className="max-h-(--available-height) w-[min(22rem,calc(100vw-2rem))] gap-0 overflow-y-auto p-0">{picker}</PopoverContent></Popover>
		</nav>
		<div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
			<div className="min-w-0">
				{!selected.size ? <p role="status" className="py-24 text-center text-muted-foreground">{tx("Common.ui.benchmarkChartCopy.selectModelsToCompare")}</p> : <>
					{section === "comparisons" ? <TabsContent value="comparisons" id="aa-comparisons"><div className="flex flex-wrap gap-1 pt-4">{["cost", "time"].map((view) => <Button key={view} variant={filters.aaCompare === view ? "secondary" : "ghost"} size="sm" aria-pressed={filters.aaCompare === view} onClick={() => void setFilters({ aaCompare: view })}>{t(view === "cost" ? "costPerTask" : "timePerTask")}</Button>)}</div>{filters.aaCompare === "time" ? chart(`${t("timePerTask")} × ${tx("Catalogue.rankings.benchmarkMetrics.intelligence")}`, (row) => row.intelligence, undefined, (row) => row.timePerTask, `${t("timePerTask")} (s)`, "seconds") : chart(`${t("costPerTask")} × ${tx("Catalogue.rankings.benchmarkMetrics.intelligence")}`, (row) => row.intelligence, undefined, (row) => row.costPerTask, `${t("costPerTask")} (USD)`, "usd")}</TabsContent> : null}
					{section === "tokenUsage" ? <TabsContent value="tokenUsage" id="aa-tokenUsage"><div className="pt-4">{measurePicker}</div>{filters.aaMeasure === "total" ? chart(t("totalOutputTokens"), (row) => row.totalTokens, "tokens") : chart(t("tokensPerTask"), (row) => row.tokensPerTask, "tokens")}</TabsContent> : null}
					{section === "cost" ? <TabsContent value="cost" id="aa-cost"><div className="pt-4">{measurePicker}</div>{filters.aaMeasure === "total" ? chart(t("totalCost"), (row) => row.totalCost, "usd") : chart(t("costPerTask"), (row) => row.costPerTask, "usd")}</TabsContent> : null}
					{section === "benchmarks" || section === "capabilities" ? <TabsContent value={section} id={`aa-${section}`} className="pt-4">
						<div className="flex flex-wrap items-center justify-between gap-3"><div className="flex gap-1"><Button variant={filters.aaLayout === "overview" ? "secondary" : "ghost"} size="sm" aria-pressed={filters.aaLayout === "overview"} onClick={() => void setFilters({ aaLayout: "overview" })}>{tx("Catalogue.compare.overview")}</Button><Button variant={filters.aaLayout !== "overview" ? "secondary" : "ghost"} size="sm" aria-pressed={filters.aaLayout !== "overview"} onClick={() => void setFilters({ aaLayout: "chart" })}>{tx("Catalogue.compare.viewCharts")}</Button></div>
							{section === "benchmarks" ? <Select value={benchmark} onValueChange={(value) => void setFilters({ aaBench: value, aaLayout: "chart" })}><SelectTrigger className="w-full sm:w-64" aria-label={t("benchmarks")}><SelectValue>{dashboardBenchmarks[benchmark]}</SelectValue></SelectTrigger><SelectContent>{availableBenchmarks.map((key) => <SelectItem key={key} value={key}>{dashboardBenchmarks[key]}</SelectItem>)}</SelectContent></Select> : <Select value={domain} onValueChange={(value) => void setFilters({ aaDomain: value, aaLayout: "chart" })}><SelectTrigger className="w-full sm:w-64" aria-label={t("capabilities")}><SelectValue>{t(domain as typeof capabilities[number])}</SelectValue></SelectTrigger><SelectContent>{capabilities.map((key) => <SelectItem key={key} value={key}>{t(key)}</SelectItem>)}</SelectContent></Select>}
						</div>
						{filters.aaLayout === "overview" ? <ArtificialAnalysisScoreMatrix rows={visible} metrics={section === "benchmarks" ? availableBenchmarks.map((key) => ({ key, label: dashboardBenchmarks[key], value: (row: DashboardRow) => row.benchmarks[key] ?? null })) : capabilities.map((key) => ({ key, label: t(key), value: (row: DashboardRow) => row.capabilities[key] ?? null }))} onSelect={(key) => void setFilters({ ...(section === "benchmarks" ? { aaBench: key } : { aaDomain: key }), aaLayout: "chart" })} /> : section === "benchmarks" ? chart(dashboardBenchmarks[benchmark], (row) => row.benchmarks[benchmark] ?? null) : chart(t(domain as typeof capabilities[number]), (row) => row.capabilities[domain] ?? null)}
					</TabsContent> : null}
					<BenchmarkDisclosure title={tx("Catalogue.rankings.intelligenceValue.evaluatedConfigurations")} count={String(visible.length)}><div className="max-h-96 overflow-auto"><table className="w-full text-left text-sm"><caption className="sr-only">{tx("Catalogue.rankings.intelligenceValue.evaluatedConfigurations")}</caption><thead className="sticky top-0 bg-background"><tr><th className="p-3">{tx("Catalogue.rankings.intelligenceValue.modelConfiguration")}</th>{[tx("Catalogue.rankings.benchmarkMetrics.intelligence"), t("tokensPerTask"), t("totalOutputTokens"), `${t("costPerTask")} (USD)`, `${t("totalCost")} (USD)`, `${t("timePerTask")} (s)`, dashboardBenchmarks[benchmark] ?? t("score"), t(domain as typeof capabilities[number])].map((label) => <th key={label} className="p-3 text-right font-medium">{label}</th>)}</tr></thead><tbody className="divide-y">{visible.map((row) => <tr key={row.id}><th className="min-w-56 p-3 font-normal"><Link href={`/models/${row.modelId}`} className="hover:underline">{row.sourceName}</Link></th>{[row.intelligence, row.tokensPerTask, row.totalTokens, row.costPerTask, row.totalCost, row.timePerTask, row.benchmarks[benchmark] ?? null, row.capabilities[domain] ?? null].map((value, index) => <td key={index} className="p-3 text-right tabular-nums">{number(value)}</td>)}</tr>)}</tbody></table></div></BenchmarkDisclosure>
				</>}
			</div>
			<aside aria-label={tx("Common.nav.models")} className="sticky top-32 hidden overflow-hidden border-x lg:block">{picker}</aside>
		</div>
	</Tabs>;
}
