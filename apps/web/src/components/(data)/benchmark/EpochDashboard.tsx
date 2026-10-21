"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { parseAsArrayOf, parseAsString, useQueryStates } from "nuqs";
import { ArrowDown, ArrowUp, Download, ImageDown, RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type EpochDashboardData, type EpochMetric } from "@/lib/benchmarks/epochDashboard";
import { dashboardDefaultModels, type BenchmarkPickerModel } from "@/lib/benchmarks/artificialAnalysisModelPicker";
import { EpochDashboardChart, epochColour } from "./EpochDashboardChart";
import { ArtificialAnalysisModelPicker } from "./ArtificialAnalysisModelPicker";
import { useDashboardInspection } from "./ArtificialAnalysisDashboardInspection";
import { EpochInspectionCard, epochCreatorId } from "./EpochInspectionCard";
import { BenchmarkDisclosure } from "./BenchmarkDisclosure";

const metrics = ["overall", "coding", "maths"] as const;
export function EpochDashboard({ data }: { data: EpochDashboardData }) {
	const t = useTranslations("Catalogue.benchmarks.epochExplorer"), tc = useTranslations("Catalogue.benchmarks.current"), ta = useTranslations("Catalogue.benchmarks.explorer"), locale = useLocale();
	const [filters, setFilters] = useQueryStates({ eciMetric: parseAsString.withDefault("overall"), eciView: parseAsString.withDefault("domain"), eciOrg: parseAsString.withDefault("all"), eciAccess: parseAsString.withDefault("all"), eciSince: parseAsString.withDefault("2024"), eciModels: parseAsArrayOf(parseAsString), eciSearch: parseAsString.withDefault(""), eciLabels: parseAsString.withDefault("true") }, { shallow: true, scroll: false });
	const metric: EpochMetric = data.domainsAvailable && metrics.includes(filters.eciMetric as EpochMetric) ? filters.eciMetric as EpochMetric : "overall";
	const [activeChart, setActiveChart] = useState<EpochMetric>(metric);
	const [frontier, setFrontier] = useState(true), [intervals, setIntervals] = useState(false), [highlight, setHighlight] = useState<string | null>(null);
	const [exporting, setExporting] = useState(false), [exportError, setExportError] = useState(false);
	const viewport = useRef<HTMLDivElement>(null), region = useRef<HTMLDivElement>(null), displayed = useRef<EpochMetric | null>(null);
	const inspection = useDashboardInspection(region);
	const [sort, setSort] = useState<"score" | "date" | "name">("score"), [ascending, setAscending] = useState(false), [page, setPage] = useState(0);
	const number = (value: number | null) => value === null ? "—" : value.toLocaleString(locale, { maximumFractionDigits: 2 });
	const date = (value: string | null) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value)) : "—";
	const organisations = [...new Set(data.rows.map((r) => r.organisation).filter(Boolean))].sort();
	const candidates = useMemo(() => data.rows.filter((r) => (filters.eciOrg === "all" || r.organisation === filters.eciOrg) && (filters.eciAccess === "all" || r.access === filters.eciAccess) && (filters.eciSince === "all" || (r.date && r.date >= `${filters.eciSince}-01-01`))), [data.rows, filters.eciOrg, filters.eciAccess, filters.eciSince]);
	const pickerModels = useMemo<BenchmarkPickerModel[]>(() => candidates.map((row) => ({ modelId: row.id, modelName: row.name, creatorId: epochCreatorId(row.organisation), colour: epochColour(row.organisation), isOpenWeights: row.access === "open" })), [candidates]);
	const defaultModels = useMemo(() => dashboardDefaultModels(data.rows.map((row) => ({ modelId: row.id, modelName: row.name, creatorId: epochCreatorId(row.organisation), colour: epochColour(row.organisation), isOpenWeights: row.access === "open" }))), [data.rows]);
	const selected = new Set(filters.eciModels ?? defaultModels);
	const rows = candidates.filter((r) => selected.has(r.id) && (!filters.eciSearch || `${r.name} ${r.organisation}`.toLocaleLowerCase(locale).includes(filters.eciSearch.toLocaleLowerCase(locale))));
	const inspected = rows.find((r) => r.id === inspection.selection?.id) ?? null;
	const reference = rows.find((r) => r.id === inspection.pinned?.id) ?? null;
	const pin = (id: string) => inspection.pin({ kind: "configuration", id });
	const ranking = [...rows].sort((a, b) => {
		const av = a.scores[metric], bv = b.scores[metric];
		if (sort === "score" && (av === null || bv === null)) return av === null ? bv === null ? 0 : 1 : -1;
		const result = sort === "name" ? a.name.localeCompare(b.name) : sort === "date" ? (a.date ?? "").localeCompare(b.date ?? "") : av! - bv!;
		return (ascending ? result : -result) || a.name.localeCompare(b.name);
	});
	const lastPage = Math.max(0, Math.ceil(ranking.length / 25) - 1), currentPage = Math.min(page, lastPage);
	const ranked = [...rows].filter((r) => r.scores[metric] !== null).sort((a, b) => b.scores[metric]! - a.scores[metric]!);
	const ranks = new Map(ranked.map((r) => [r.id, ranked.findIndex((item) => item.scores[metric] === r.scores[metric]) + 1]));
	const setFilter = (value: Parameters<typeof setFilters>[0]) => { inspection.clear(); setPage(0); void setFilters(value); };
	const reset = () => setFilter({ eciOrg: null, eciAccess: null, eciSince: null, eciModels: null, eciSearch: null });
	const sortBy = (key: typeof sort) => { setAscending(sort === key ? !ascending : key === "name"); setSort(key); setPage(0); };
	const scrollTo = (id: EpochMetric, behavior: ScrollBehavior = "smooth") => {
		displayed.current = id; setActiveChart(id);
		const container = viewport.current, target = container?.querySelector<HTMLElement>(`[data-eci-chart="${id}"]`);
		if (container && target) container.scrollTo({ top: target.offsetTop - container.offsetTop, behavior });
	};
	const navigate = (id: EpochMetric) => { inspection.clear(); scrollTo(id, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth"); void setFilters({ eciMetric: id, ...(id !== "overall" ? { eciView: "domain" } : {}) }); };
	useEffect(() => { if (displayed.current !== metric) scrollTo(metric, "instant"); }, [metric]);
	useEffect(() => {
		const container = viewport.current;
		if (!container) return;
		let timer: ReturnType<typeof setTimeout>;
		const onScroll = () => { clearTimeout(timer); timer = setTimeout(() => {
			const top = container.getBoundingClientRect().top;
			const closest = [...container.querySelectorAll<HTMLElement>("[data-eci-chart]")].reduce<HTMLElement | null>((best, item) => !best || Math.abs(item.getBoundingClientRect().top - top) < Math.abs(best.getBoundingClientRect().top - top) ? item : best, null);
			if (closest) { const id = closest.dataset.eciChart as EpochMetric; displayed.current = id; setActiveChart(id); void setFilters({ eciMetric: id }); }
		}, 140); };
		container.addEventListener("scroll", onScroll, { passive: true });
		return () => { clearTimeout(timer); container.removeEventListener("scroll", onScroll); };
	}, [setFilters]);
	useEffect(() => { const onResize = () => scrollTo(displayed.current ?? metric, "instant"); window.addEventListener("resize", onResize); return () => window.removeEventListener("resize", onResize); }, [metric]);
	const csv = () => {
		const cell = (value: string | number | null) => typeof value === "number" ? String(value) : `"${(value && /^[=+@\t\r-]/.test(value) ? `'${value}` : value ?? "").replaceAll('"', '""')}"`;
		const content = [[t("model"), t("organisation"), t("releaseDate"), ...metrics.map((m) => t(m)), t("access")], ...ranking.map((r) => [r.name, r.organisation, r.date, ...metrics.map((m) => r.scores[m]), t(r.access)])].map((r) => r.map(cell).join(",")).join("\r\n");
		const url = URL.createObjectURL(new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" })), a = document.createElement("a"); a.href = url; a.download = "phaseo-epoch-eci.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
	};
	const png = async () => {
		const node = viewport.current?.querySelector<HTMLElement>(`[data-eci-chart="${activeChart}"]`);
		if (!node) return;
		setExporting(true); setExportError(false);
		try { const { exportArtificialAnalysisChart } = await import("@/lib/benchmarks/exportArtificialAnalysisChart"); const url = await exportArtificialAnalysisChart(node); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `phaseo-eci-${activeChart}.png`; anchor.click(); } catch { setExportError(true); } finally { setExporting(false); }
	};
	const selectControl = (value: string, onChange: (value: string) => void, label: string, options: Array<[string, string]>) => <Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label} className="h-8 w-full text-xs"><SelectValue>{options.find(([id]) => id === value)?.[1] ?? label}</SelectValue></SelectTrigger><SelectContent>{options.map(([id, text]) => <SelectItem key={id} value={id}>{text}</SelectItem>)}</SelectContent></Select>;
	const pickerFilters = <div className="mb-4 space-y-2 px-2">{selectControl(filters.eciOrg, (eciOrg) => setFilter({ eciOrg }), t("organisation"), [["all", t("allOrganisations")], ...organisations.map((o): [string, string] => [o, o])])}{selectControl(filters.eciAccess, (eciAccess) => setFilter({ eciAccess }), t("access"), [["all", t("allAccess")], ["open", t("open")], ["closed", t("closed")], ["unknown", t("unknown")]])}<div className="flex justify-between"><Button size="sm" variant="ghost" className="h-7 px-0 text-[10px]" onClick={() => setFilter({ eciModels: candidates.map((r) => r.id) })}>{t("selectAll")}</Button><Button size="sm" variant="ghost" className="h-7 px-0 text-[10px]" onClick={() => setFilter({ eciModels: [] })}>{t("clear")}</Button></div></div>;
	const picker = (mobile = false) => <ArtificialAnalysisModelPicker hideHeading={mobile} models={pickerModels} selected={selected} efforts={[]} selectedEfforts={null} onModels={(eciModels) => setFilter({ eciModels })} onReset={reset} onHighlight={setHighlight} filters={pickerFilters} search={filters.eciSearch} onSearch={(eciSearch) => setFilter({ eciSearch })} />;
	const settings = <div className="space-y-4 p-3 text-xs"><p className="font-medium">{ta("scatterCharts")}</p><Button size="sm" variant={filters.eciLabels === "true" ? "secondary" : "ghost"} aria-pressed={filters.eciLabels === "true"} onClick={() => void setFilters({ eciLabels: filters.eciLabels === "true" ? "false" : "true" })}>{ta("labels")}</Button>{selectControl(filters.eciSince, (eciSince) => setFilter({ eciSince }), t("dateRange"), [["2024", t("since2024")], ["2025", t("since2025")], ["2026", t("since2026")], ["all", t("allTime")]])}<Button size="sm" variant="ghost" onClick={csv}><Download className="size-3.5" />{t("export")}</Button></div>;
	return <div ref={region} onKeyDown={(event) => { if (event.key === "Escape") inspection.clear(); }}>
		<div className="flex h-[calc(100svh-7.5rem)] min-h-[32rem] flex-col border-b bg-background" data-eci-workspace>
			<div className="flex shrink-0 items-center gap-2 border-y px-4 lg:px-6">
				<ScrollArea className="min-w-0 flex-1" scrollBarOrientation="horizontal" scrollBarClassName="hidden" viewportClassName="relative py-1"><nav aria-label={t("index")} className="flex w-max gap-1">{metrics.map((id) => <button key={id} type="button" disabled={id !== "overall" && !data.domainsAvailable} aria-current={activeChart === id ? "location" : undefined} onClick={() => navigate(id)} className="relative min-h-10 whitespace-nowrap px-3 text-xs font-medium text-muted-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full aria-[current=location]:text-foreground aria-[current=location]:after:bg-primary hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40">{id === "overall" ? t("timeline") : t(id)}</button>)}</nav></ScrollArea>
				<Button variant="ghost" size="icon-sm" disabled={exporting || !rows.length} onClick={() => void png()} aria-label={ta("downloadPng")}><ImageDown className="size-4" /></Button>
				<Popover><PopoverTrigger asChild><Button variant="ghost" size="icon-sm" className="hidden lg:flex" aria-label={ta("chartSettings")}><SlidersHorizontal className="size-4" /></Button></PopoverTrigger><PopoverContent align="end" className="w-64 p-0">{settings}</PopoverContent></Popover>
				<Sheet><SheetTrigger asChild><Button variant="outline" size="sm" className="lg:hidden"><SlidersHorizontal className="size-4" />{t("models")} {selected.size}</Button></SheetTrigger><SheetContent showCloseButton={false} className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-none"><div className="flex h-14 shrink-0 items-center justify-between border-b px-4"><SheetTitle>{t("models")} <span className="font-normal text-muted-foreground">{selected.size}</span></SheetTitle><div className="ml-auto flex items-center gap-2"><Button variant="ghost" size="icon-sm" aria-label={t("reset")} onClick={reset}><RotateCcw className="size-3.5" /></Button><SheetClose asChild><Button variant="ghost" size="sm">{ta("done")}</Button></SheetClose></div></div><ScrollArea className="min-h-0 flex-1">{picker(true)}<div className="border-t">{settings}</div></ScrollArea></SheetContent></Sheet>
			</div>
			{exportError ? <p role="alert" className="px-6 py-2 text-xs text-destructive">{ta("exportFailed")}</p> : null}
			<div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_15.5rem]">
				<ScrollArea className="min-h-0 min-w-0" viewportRef={viewport} viewportClassName="relative h-full overscroll-contain" viewportProps={{ tabIndex: 0, "aria-label": t("index") }}>
					{metrics.filter((m) => m === "overall" || data.domainsAvailable).map((m) => {
						const mode = m === "overall" || filters.eciView === "timeline" ? "timeline" : "domain";
						return <section key={m} data-eci-chart={m} id={m === "overall" ? "progress" : `eci-${m}`} className="min-h-[calc(100svh-13rem)] border-b px-4 py-5 last:border-b-0 lg:px-6">
							<div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold tracking-tight">{m === "overall" ? t("timeline") : t("domainComparison", { domain: t(m) })}</h2><div data-export-hide className="flex flex-wrap items-center gap-1">{m === "overall" ? <><Button size="sm" variant={frontier ? "secondary" : "ghost"} aria-pressed={frontier} onClick={() => setFrontier(!frontier)}>{t("frontier")}</Button><Button size="sm" variant={intervals ? "secondary" : "ghost"} aria-pressed={intervals} onClick={() => setIntervals(!intervals)}>{t("confidence")}</Button></> : <><Button size="sm" variant={mode === "domain" ? "secondary" : "ghost"} aria-pressed={mode === "domain"} onClick={() => void setFilters({ eciView: "domain" })}>{t("vsGeneral")}</Button><Button size="sm" variant={mode === "timeline" ? "secondary" : "ghost"} aria-pressed={mode === "timeline"} onClick={() => void setFilters({ eciView: "timeline" })}>{t("timeline")}</Button></>}</div></div>
							<div className="relative"><EpochDashboardChart rows={rows} metric={m} mode={mode} frontier={frontier} intervals={intervals} inspect={(id) => id ? inspection.hover({ kind: "configuration", id }) : inspection.leave()} focus={(id) => inspection.inspect({ kind: "configuration", id })} pin={pin} selected={inspected?.id ?? highlight} pinned={reference?.id ?? null} labels={filters.eciLabels === "true"} />{activeChart === m && inspected && inspected.scores[m] !== null ? <div data-export-hide className="pointer-events-none absolute inset-0 z-30 flex flex-col items-end justify-end pb-16 pr-4"><div className="pointer-events-auto sticky bottom-20 max-w-[calc(100%-1rem)]"><EpochInspectionCard row={inspected} comparison={reference && reference.id !== inspected.id ? reference : undefined} metric={m} pinned={reference?.id === inspected.id} keep={inspection.keep} leave={inspection.leave} close={inspection.clear} /></div></div> : null}</div>
							{m !== "overall" ? <p className="mt-2 text-xs text-muted-foreground">{t("domainNote")}</p> : null}
						</section>;
					})}
				</ScrollArea>
				<aside aria-label={t("models")} className="hidden min-h-0 border-l lg:flex"><ScrollArea className="min-h-0 w-full">{picker()}</ScrollArea></aside>
			</div>
			<div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t px-4 py-2 text-[11px] text-muted-foreground lg:px-6"><a href="https://epoch.ai/eci" target="_blank" rel="noreferrer" className="underline underline-offset-4">{t("source")}</a><span>{t("attribution")}</span>{data.sourceDate ? <span>{tc("lastSynced")}: {date(data.sourceDate)}</span> : null}</div>
		</div>
		<div className="px-4 lg:px-6"><BenchmarkDisclosure title={t("rankings")} count={String(rows.length)}>
				<section id="model-results" className="scroll-mt-20 border-t p-4 lg:p-6"><div className="mb-4 flex items-center justify-between"><h2 className="text-base font-semibold">{t("rankings")}</h2><span className="text-xs text-muted-foreground">{t("scoredModels", { count: ranked.length })}</span></div>
					<div className="min-w-0"><table className="w-full table-fixed text-left text-xs"><thead className="border-b text-muted-foreground"><tr><th className="w-9 pb-3 font-normal">#</th><th className="pb-3 font-normal"><button className="inline-flex items-center gap-1" onClick={() => sortBy("name")}>{t("model")}{sort === "name" ? ascending ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : null}</button></th><th className="hidden w-28 pb-3 text-right font-normal sm:table-cell"><button onClick={() => sortBy("date")}>{t("releaseDate")}</button></th><th className="w-24 pb-3 text-right font-normal"><button className="inline-flex items-center gap-1" onClick={() => sortBy("score")}>{t(metric)}{sort === "score" ? ascending ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : null}</button></th></tr></thead><tbody>{ranking.slice(currentPage * 25, currentPage * 25 + 25).map((r) => <tr key={r.id} className={`border-b last:border-0 ${reference?.id === r.id ? "bg-accent" : ""}`}><td className="py-3 tabular-nums text-muted-foreground">{ranks.get(r.id) ?? "—"}</td><td className="py-3 pr-2"><button className="flex w-full items-center gap-2 text-left hover:underline" onClick={() => pin(r.id)} aria-pressed={reference?.id === r.id}><span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: epochColour(r.organisation) }} /><span className="min-w-0 break-words"><span className="font-medium">{r.name}</span><span className="mt-0.5 block text-[11px] text-muted-foreground">{r.organisation || t("unknown")} · {t(r.access)}</span></span></button></td><td className="hidden py-3 text-right text-muted-foreground sm:table-cell">{date(r.date)}</td><td className="py-3 text-right font-semibold tabular-nums">{number(r.scores[metric])}</td></tr>)}</tbody></table>{!ranking.length ? <p className="py-12 text-center text-sm text-muted-foreground">{t("noResults")}</p> : null}</div>
					{lastPage > 0 ? <div className="mt-4 flex items-center justify-between"><Button size="sm" variant="outline" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>{t("previous")}</Button><span className="text-xs tabular-nums text-muted-foreground">{currentPage + 1}/{lastPage + 1}</span><Button size="sm" variant="outline" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>{t("next")}</Button></div> : null}
				</section>
		</BenchmarkDisclosure><BenchmarkDisclosure title={t("methodology")}><p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{t("methodologyNote")}</p><a href="https://epoch.ai/data/eci-documentation/domain-specific-eci" target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs underline underline-offset-4">{t("methodologyLink")}</a></BenchmarkDisclosure>{data.source === "catalogue" ? <p role="status" className="pb-4 text-xs text-muted-foreground">{t("fallback")}</p> : null}</div>
	</div>;
}
