"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { parseAsArrayOf, parseAsString, useQueryStates } from "nuqs";
import { Download, ImageDown, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTitle, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import { Link } from "@/i18n/navigation";
import { dashboardBenchmarks, effortOrder, type DashboardRow } from "@/lib/benchmarks/artificialAnalysisDashboard";
import { dashboardDefaultModels } from "@/lib/benchmarks/artificialAnalysisModelPicker";
import { ArtificialAnalysisDashboardChart } from "./ArtificialAnalysisDashboardChart";
import { ArtificialAnalysisModelPicker } from "./ArtificialAnalysisModelPicker";
import { ArtificialAnalysisScoreMatrix } from "./ArtificialAnalysisScoreMatrix";
import { BenchmarkDisclosure } from "./BenchmarkDisclosure";

const capabilities = ["financeAndAccounting", "strategyAndOps", "legal", "healthcareAndMedical", "engineering", "economics"] as const;
const chartIds = ["cost-intelligence", "time-intelligence", "tokens-task", "total-tokens", "cost-task", "total-cost", "benchmarks", "capabilities"] as const;
type ChartId = typeof chartIds[number];
export default function ArtificialAnalysisDashboard({ rows, footer }: { rows: DashboardRow[]; footer?: ReactNode }) {
	const tx = useTranslations();
	const t = useTranslations("Catalogue.benchmarks.explorer");
	const locale = useLocale();
	const [highlight, setHighlight] = useState<string | null>(null);
	const [exporting, setExporting] = useState(false);
	const [exportError, setExportError] = useState(false);
	const viewport = useRef<HTMLDivElement>(null);
	const navigationViewport = useRef<HTMLDivElement>(null);
	const initialized = useRef(false);
	const [filters, setFilters] = useQueryStates({ aaModels: parseAsArrayOf(parseAsString), aaEffort: parseAsString.withDefault(""), aaEfforts: parseAsArrayOf(parseAsString), aaCreator: parseAsString.withDefault(""), aaLayout: parseAsString.withDefault("overview"), aaBench: parseAsString.withDefault("terminalBench40"), aaDomain: parseAsString.withDefault("financeAndAccounting"), aaSection: parseAsString.withDefault("comparisons"), aaCompare: parseAsString.withDefault("cost"), aaMeasure: parseAsString.withDefault("task"), aaChart: parseAsString.withDefault(""), aaLabels: parseAsString.withDefault("true"), aaGrouped: parseAsString.withDefault("true"), aaSort: parseAsString.withDefault("asc"), aaScatter: parseAsString.withDefault("") }, { shallow: true, scroll: false });
	const legacyChart = filters.aaSection === "tokenUsage" ? filters.aaMeasure === "total" ? "total-tokens" : "tokens-task" : filters.aaSection === "cost" ? filters.aaMeasure === "total" ? "total-cost" : "cost-task" : filters.aaSection === "benchmarks" || filters.aaSection === "capabilities" ? filters.aaSection : filters.aaCompare === "time" ? "time-intelligence" : "cost-intelligence";
	const active = chartIds.includes(filters.aaChart as ChartId) ? filters.aaChart as ChartId : legacyChart;
	const [activeChart, setActiveChart] = useState<ChartId>(active);
	const models = useMemo(() => {
		const models = new Map<string, DashboardRow>();
		for (const row of rows) if (!models.has(row.modelId) || (row.intelligence ?? -Infinity) > (models.get(row.modelId)!.intelligence ?? -Infinity)) models.set(row.modelId, row);
		return [...models.values()].sort((a, b) => (b.intelligence ?? -Infinity) - (a.intelligence ?? -Infinity) || a.modelName.localeCompare(b.modelName));
	}, [rows]);
	const selected = new Set(filters.aaModels ?? dashboardDefaultModels(models));
	const selectedEfforts = filters.aaEfforts ?? (filters.aaEffort ? [filters.aaEffort] : null);
	const availableEfforts = rows.filter((row) => selected.has(row.modelId)).map((row) => row.effort);
	const efforts = [...new Set(availableEfforts)].sort((a, b) => effortOrder.indexOf(a) - effortOrder.indexOf(b));
	const visible = rows.filter((row) => selected.has(row.modelId) && (!selectedEfforts || selectedEfforts.includes(row.effort)) && (!filters.aaCreator || row.creatorId === filters.aaCreator));
	const availableBenchmarks = Object.keys(dashboardBenchmarks).filter((key) => rows.some((row) => typeof row.benchmarks[key] === "number"));
	const benchmark = availableBenchmarks.includes(filters.aaBench) ? filters.aaBench : availableBenchmarks[0];
	const domain = capabilities.includes(filters.aaDomain as typeof capabilities[number]) ? filters.aaDomain : capabilities[0];
	const number = (value: number | null) => value === null ? "—" : new Intl.NumberFormat(locale, { maximumSignificantDigits: 12 }).format(value);
	const titles: Record<ChartId, string> = { "cost-intelligence": t("costVsIntelligence"), "time-intelligence": t("timeVsIntelligence"), "tokens-task": t("tokensPerTask"), "total-tokens": t("totalOutputTokens"), "cost-task": t("costPerTask"), "total-cost": t("totalCost"), benchmarks: t("benchmarks"), capabilities: t("capabilities") };
	const scrollTo = (id: ChartId, behavior: ScrollBehavior = "smooth") => {
		const container = viewport.current;
		const target = container?.querySelector<HTMLElement>(`[data-aa-chart="${id}"]`);
		if (!container || !target) return;
		container.scrollTo({ top: target.offsetTop - container.offsetTop, behavior });
		setActiveChart(id);
	};
	useEffect(() => {
		if (!initialized.current || active !== activeChart) scrollTo(active, "instant");
		initialized.current = true;
	}, [active, activeChart]);
	useEffect(() => {
		const container = viewport.current;
		if (!container) return;
		let timer: ReturnType<typeof setTimeout>;
		const onScroll = () => {
			clearTimeout(timer);
			timer = setTimeout(() => {
				const top = container.getBoundingClientRect().top;
				const closest = [...container.querySelectorAll<HTMLElement>("[data-aa-chart]")].reduce<HTMLElement | null>((best, element) => !best || Math.abs(element.getBoundingClientRect().top - top) < Math.abs(best.getBoundingClientRect().top - top) ? element : best, null);
				if (closest) {
					const id = closest.dataset.aaChart as ChartId;
					setActiveChart(id);
					void setFilters({ aaChart: id });
				}
			}, 140);
		};
		container.addEventListener("scroll", onScroll, { passive: true });
		return () => { clearTimeout(timer); container.removeEventListener("scroll", onScroll); };
	}, [setFilters]);
	useEffect(() => {
		const nav = navigationViewport.current;
		const button = nav?.querySelector<HTMLElement>('[aria-current="location"]');
		if (nav && button) { const left = button.offsetLeft; if (left < nav.scrollLeft || left + button.offsetWidth > nav.scrollLeft + nav.clientWidth) nav.scrollTo({ left: Math.max(0, left - 12), behavior: "smooth" }); }
	}, [activeChart]);
	const navigate = (id: ChartId) => { scrollTo(id, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth"); };
	const exportData = () => {
		const columns = ["Model", "Configuration", "Intelligence", "Output tokens per task", "Total output tokens", "Cost per task (USD)", "Total cost (USD)", "Time per task (seconds)", ...availableBenchmarks.map((key) => dashboardBenchmarks[key]), ...capabilities];
		const data = visible.map((row) => [row.sourceName, row.effort, row.intelligence, row.tokensPerTask, row.totalTokens, row.costPerTask, row.totalCost, row.timePerTask, ...availableBenchmarks.map((key) => row.benchmarks[key] ?? null), ...capabilities.map((key) => row.capabilities[key] ?? null)]);
		const cell = (value: string | number | null) => typeof value === "number" ? String(value) : `"${(value && /^[=+@\t\r-]/.test(value) ? `'${value}` : value ?? "").replaceAll('"', '""')}"`;
		const url = URL.createObjectURL(new Blob([[columns, ...data].map((row) => row.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
		const anchor = document.createElement("a"); anchor.href = url; anchor.download = "artificial-analysis.csv"; anchor.click(); URL.revokeObjectURL(url);
	};
	const exportPng = async () => {
		const node = viewport.current?.querySelector<HTMLElement>(`[data-aa-chart="${activeChart}"]`);
		if (!node) return;
		setExporting(true); setExportError(false);
		try {
			const { toPng } = await import("html-to-image");
			const url = await toPng(node, { pixelRatio: 2, backgroundColor: getComputedStyle(document.body).backgroundColor, filter: (element) => !(element instanceof HTMLElement && (element.getAttribute("role") === "tooltip" || element.hasAttribute("data-export-hide"))) });
			const anchor = document.createElement("a"); anchor.href = url; anchor.download = `phaseo-aa-${activeChart}.png`; anchor.click();
		} catch { setExportError(true); } finally { setExporting(false); }
	};
	const picker = <ArtificialAnalysisModelPicker models={models} selected={selected} efforts={efforts} selectedEfforts={selectedEfforts} onModels={(ids) => void setFilters({ aaModels: ids })} onEfforts={(efforts) => void setFilters({ aaEffort: null, aaEfforts: efforts })} onReset={() => void setFilters({ aaModels: null, aaEffort: null, aaEfforts: null, aaCreator: null })} onHighlight={setHighlight} />;
	const settings = <div className="space-y-4 p-3 text-xs"><div><p className="mb-2 font-medium">{t("scatterCharts")}</p><Button size="sm" variant={filters.aaLabels === "true" ? "secondary" : "ghost"} aria-pressed={filters.aaLabels === "true"} onClick={() => void setFilters({ aaLabels: filters.aaLabels === "true" ? "false" : "true" })}>{t("labels")}</Button></div><div><p className="mb-2 font-medium">{t("barCharts")}</p><div className="flex flex-wrap gap-1"><Button size="sm" variant={filters.aaGrouped === "true" ? "secondary" : "ghost"} aria-pressed={filters.aaGrouped === "true"} onClick={() => void setFilters({ aaGrouped: filters.aaGrouped === "true" ? "false" : "true" })}>{t("groupByModel")}</Button><Button size="sm" variant="ghost" onClick={() => void setFilters({ aaSort: filters.aaSort === "asc" ? "desc" : "asc" })}>{t(filters.aaSort === "asc" ? "highestLast" : "highestFirst")}</Button></div></div><Button size="sm" variant="ghost" onClick={exportData}><Download className="size-3.5" />CSV</Button></div>;
	const chart = (title: string, value: (row: DashboardRow) => number | null, unit?: "usd" | "tokens", xValue?: (row: DashboardRow) => number | null, xLabel?: string, xUnit?: "usd" | "seconds" | "tokens", scatterToggle = false) => <ArtificialAnalysisDashboardChart title={title} rows={visible} value={value} unit={unit} xValue={xValue} xLabel={xLabel} xUnit={xUnit} highlight={highlight} labels={filters.aaLabels === "true"} groupModels={filters.aaGrouped === "true"} descending={filters.aaSort === "desc"} scatterToggle={scatterToggle} scatter={filters.aaScatter === "tokens-task"} onScatter={(scatter) => void setFilters({ aaScatter: scatter ? "tokens-task" : "" })} />;
	return <>
		<div className="flex h-[calc(100svh-7.5rem)] min-h-[32rem] flex-col border-b bg-background" data-aa-workspace>
			<div className="flex shrink-0 items-center gap-2 border-y px-4 lg:px-6">
				<ScrollArea className="min-w-0 flex-1" scrollBarOrientation="horizontal" viewportRef={navigationViewport} viewportClassName="relative py-1"><nav aria-label={tx("Catalogue.benchmarks.tocIndexComparisons")} className="flex w-max gap-1">{chartIds.map((id) => <button key={id} type="button" aria-current={activeChart === id ? "location" : undefined} onClick={() => navigate(id)} className="relative min-h-10 whitespace-nowrap px-3 text-xs font-medium text-muted-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full aria-[current=location]:text-foreground aria-[current=location]:after:bg-primary hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">{titles[id]}</button>)}</nav></ScrollArea>
				<Button variant="ghost" size="icon-sm" disabled={exporting || !visible.length} onClick={() => void exportPng()} aria-label={t("downloadPng")}><ImageDown className="size-4" /></Button>
				<Popover><PopoverTrigger asChild><Button variant="ghost" size="icon-sm" className="hidden lg:flex" aria-label={t("chartSettings")}><SlidersHorizontal className="size-4" /></Button></PopoverTrigger><PopoverContent align="end" className="w-64 p-0">{settings}</PopoverContent></Popover>
				<Sheet><SheetTrigger asChild><Button variant="outline" size="sm" className="lg:hidden"><SlidersHorizontal className="size-4" />{tx("Common.nav.models")} {selected.size}</Button></SheetTrigger><SheetContent showCloseButton={false} className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-none"><div className="flex h-14 shrink-0 items-center justify-between border-b px-4"><SheetTitle>{tx("Common.nav.models")}</SheetTitle><SheetClose asChild><Button variant="ghost" size="sm">{t("done")}</Button></SheetClose></div><ScrollArea className="min-h-0 flex-1">{picker}<div className="border-t">{settings}</div></ScrollArea></SheetContent></Sheet>
			</div>
			{exportError ? <p role="alert" className="px-6 py-2 text-xs text-destructive">{t("exportFailed")}</p> : null}
			<div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_15.5rem]">
				<ScrollArea className="min-h-0 min-w-0" viewportRef={viewport} viewportClassName="relative h-full overscroll-contain" viewportProps={{ tabIndex: 0, "aria-label": tx("Catalogue.benchmarks.tocIndexComparisons") }}>
					{chartIds.map((id) => <div key={id} data-aa-chart={id} id={id === "tokens-task" ? "aa-tokenUsage" : `aa-${id}`} className="min-h-[calc(100svh-13rem)] border-b px-4 py-5 last:border-b-0 lg:px-6">
						{id === "cost-intelligence" ? chart(titles[id], (row) => row.intelligence, undefined, (row) => row.costPerTask, `${t("costPerTask")} (USD)`, "usd") : id === "time-intelligence" ? chart(titles[id], (row) => row.intelligence, undefined, (row) => row.timePerTask, `${t("timePerTask")} (s)`, "seconds") : id === "tokens-task" ? chart(titles[id], (row) => row.tokensPerTask, "tokens", undefined, undefined, undefined, true) : id === "total-tokens" ? chart(titles[id], (row) => row.totalTokens, "tokens") : id === "cost-task" ? chart(titles[id], (row) => row.costPerTask, "usd") : id === "total-cost" ? chart(titles[id], (row) => row.totalCost, "usd") : <>
							<div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold">{titles[id]}</h2><div className="flex gap-1"><Button variant={filters.aaLayout === "overview" ? "secondary" : "ghost"} size="sm" onClick={() => void setFilters({ aaLayout: "overview" })}>{tx("Catalogue.compare.overview")}</Button><Button variant={filters.aaLayout === "chart" ? "secondary" : "ghost"} size="sm" onClick={() => void setFilters({ aaLayout: "chart" })}>{tx("Catalogue.compare.viewCharts")}</Button></div>
								{id === "benchmarks" ? <Select value={benchmark} onValueChange={(value) => void setFilters({ aaBench: value, aaLayout: "chart" })}><SelectTrigger className="w-full sm:w-64" aria-label={t("benchmarks")}><SelectValue>{dashboardBenchmarks[benchmark]}</SelectValue></SelectTrigger><SelectContent>{availableBenchmarks.map((key) => <SelectItem key={key} value={key}>{dashboardBenchmarks[key]}</SelectItem>)}</SelectContent></Select> : <Select value={domain} onValueChange={(value) => void setFilters({ aaDomain: value, aaLayout: "chart" })}><SelectTrigger className="w-full sm:w-64" aria-label={t("capabilities")}><SelectValue>{t(domain as typeof capabilities[number])}</SelectValue></SelectTrigger><SelectContent>{capabilities.map((key) => <SelectItem key={key} value={key}>{t(key)}</SelectItem>)}</SelectContent></Select>}
							</div>
							{filters.aaLayout === "overview" ? <ArtificialAnalysisScoreMatrix rows={visible} metrics={id === "benchmarks" ? availableBenchmarks.map((key) => ({ key, label: dashboardBenchmarks[key], value: (row: DashboardRow) => row.benchmarks[key] ?? null })) : capabilities.map((key) => ({ key, label: t(key), value: (row: DashboardRow) => row.capabilities[key] ?? null }))} onSelect={(key) => void setFilters({ ...(id === "benchmarks" ? { aaBench: key } : { aaDomain: key }), aaLayout: "chart" })} /> : id === "benchmarks" ? chart(dashboardBenchmarks[benchmark], (row) => row.benchmarks[benchmark] ?? null) : chart(t(domain as typeof capabilities[number]), (row) => row.capabilities[domain] ?? null)}
						</>}
					</div>)}
				</ScrollArea>
				<aside aria-label={tx("Common.nav.models")} className="hidden min-h-0 border-l lg:flex"><ScrollArea className="min-h-0 w-full">{picker}</ScrollArea></aside>
			</div>
			{footer ? <div className="shrink-0 border-t px-4 lg:px-6 [&>div]:py-2">{footer}</div> : null}
		</div>
		<div className="px-4 lg:px-6"><BenchmarkDisclosure title={tx("Catalogue.rankings.intelligenceValue.evaluatedConfigurations")} count={String(visible.length)}><ScrollArea className="h-96" scrollBarOrientation="both"><table className="w-full text-left text-sm"><caption className="sr-only">{tx("Catalogue.rankings.intelligenceValue.evaluatedConfigurations")}</caption><thead className="sticky top-0 bg-background"><tr><th className="p-3">{tx("Catalogue.rankings.intelligenceValue.modelConfiguration")}</th>{[tx("Catalogue.rankings.benchmarkMetrics.intelligence"), t("tokensPerTask"), t("totalOutputTokens"), `${t("costPerTask")} (USD)`, `${t("totalCost")} (USD)`, `${t("timePerTask")} (s)`].map((label) => <th key={label} className="p-3 text-right font-medium">{label}</th>)}</tr></thead><tbody className="divide-y">{visible.map((row) => <tr key={row.id}><th className="min-w-56 p-3 font-normal"><Link href={`/models/${row.modelId}`} className="hover:underline">{row.sourceName}</Link></th>{[row.intelligence, row.tokensPerTask, row.totalTokens, row.costPerTask, row.totalCost, row.timePerTask].map((value, index) => <td key={index} className="p-3 text-right tabular-nums">{number(value)}</td>)}</tr>)}</tbody></table></ScrollArea></BenchmarkDisclosure></div>
	</>;
}
