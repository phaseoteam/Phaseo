"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { parseAsArrayOf, parseAsString, useQueryStates } from "nuqs";
import { ArrowDown, ArrowUp, ArrowUpRight, Download, RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type EpochDashboardData, type EpochMetric } from "@/lib/benchmarks/epochDashboard";
import { EpochDashboardChart, epochColour } from "./EpochDashboardChart";

const metrics = ["overall", "coding", "maths"] as const;
export function EpochDashboard({ data }: { data: EpochDashboardData }) {
	const t = useTranslations("Catalogue.benchmarks.epochExplorer"), tc = useTranslations("Catalogue.benchmarks.current"), locale = useLocale();
	const [filters, setFilters] = useQueryStates({ eciMetric: parseAsString.withDefault("overall"), eciView: parseAsString.withDefault("timeline"), eciOrg: parseAsString.withDefault("all"), eciAccess: parseAsString.withDefault("all"), eciSince: parseAsString.withDefault("2024"), eciModels: parseAsArrayOf(parseAsString), eciSearch: parseAsString.withDefault("") }, { shallow: true, scroll: false });
	const metric: EpochMetric = data.domainsAvailable && metrics.includes(filters.eciMetric as EpochMetric) ? filters.eciMetric as EpochMetric : "overall";
	const mode = filters.eciView === "domain" && metric !== "overall" ? "domain" : "timeline";
	const [frontier, setFrontier] = useState(true), [intervals, setIntervals] = useState(false);
	const [hover, setHover] = useState<string | null>(null), [pinned, setPinned] = useState<string | null>(null);
	const [sort, setSort] = useState<"score" | "date" | "name">("score"), [ascending, setAscending] = useState(false), [page, setPage] = useState(0);
	const number = (value: number | null) => value === null ? "—" : value.toLocaleString(locale, { maximumFractionDigits: 2 });
	const date = (value: string | null) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value)) : "—";
	const organisations = [...new Set(data.rows.map((r) => r.organisation).filter(Boolean))].sort();
	const candidates = useMemo(() => data.rows.filter((r) => (filters.eciOrg === "all" || r.organisation === filters.eciOrg) && (filters.eciAccess === "all" || r.access === filters.eciAccess) && (!filters.eciSearch || `${r.name} ${r.organisation}`.toLowerCase().includes(filters.eciSearch.toLowerCase())) && (filters.eciSince === "all" || (r.date && r.date >= `${filters.eciSince}-01-01`))), [data.rows, filters.eciOrg, filters.eciAccess, filters.eciSearch, filters.eciSince]);
	const selected = new Set(filters.eciModels ?? data.rows.map((r) => r.id));
	const rows = candidates.filter((r) => selected.has(r.id));
	const inspected = rows.find((r) => r.id === hover) ?? rows.find((r) => r.id === pinned) ?? null;
	const reference = rows.find((r) => r.id === pinned) ?? null;
	const ranking = [...rows].sort((a, b) => {
		const av = a.scores[metric], bv = b.scores[metric];
		if (sort === "score" && (av === null || bv === null)) return av === null ? bv === null ? 0 : 1 : -1;
		const result = sort === "name" ? a.name.localeCompare(b.name) : sort === "date" ? (a.date ?? "").localeCompare(b.date ?? "") : av! - bv!;
		return (ascending ? result : -result) || a.name.localeCompare(b.name);
	});
	const lastPage = Math.max(0, Math.ceil(ranking.length / 25) - 1), currentPage = Math.min(page, lastPage);
	const ranked = [...rows].filter((r) => r.scores[metric] !== null).sort((a, b) => b.scores[metric]! - a.scores[metric]!);
	const ranks = new Map(ranked.map((r) => [r.id, ranked.findIndex((item) => item.scores[metric] === r.scores[metric]) + 1]));
	const setFilter = (value: Parameters<typeof setFilters>[0]) => { setHover(null); setPage(0); void setFilters(value); };
	const toggle = (id: string) => { const next = new Set(selected); if (next.has(id)) next.delete(id); else next.add(id); setFilter({ eciModels: [...next] }); };
	const pin = (id: string) => { setHover(null); setPinned((previous) => previous === id ? null : id); };
	const sortBy = (key: typeof sort) => { setAscending(sort === key ? !ascending : key === "name"); setSort(key); setPage(0); };
	const csv = () => {
		const content = [[t("model"), t("organisation"), t("releaseDate"), ...metrics.map((m) => t(m)), t("access")], ...ranking.map((r) => [r.name, r.organisation, r.date ?? "", ...metrics.map((m) => r.scores[m] ?? ""), t(r.access)])].map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\r\n");
		const url = URL.createObjectURL(new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" })), a = document.createElement("a"); a.href = url; a.download = "phaseo-epoch-eci.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
	};
	const selectControl = (value: string, onChange: (value: string) => void, label: string, options: Array<[string, string]>) => <Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label} className="h-9 w-full min-w-0 sm:w-auto sm:min-w-36"><SelectValue>{options.find(([id]) => id === value)?.[1] ?? label}</SelectValue></SelectTrigger><SelectContent>{options.map(([id, text]) => <SelectItem key={id} value={id}>{text}</SelectItem>)}</SelectContent></Select>;
	const modelControls = <>
				<div className="space-y-3 p-4">
					<div className="hidden items-center justify-between lg:flex"><h2 className="text-sm font-semibold">{t("models")}</h2><span className="text-xs tabular-nums text-muted-foreground">{rows.length}/{candidates.length}</span></div>
					<div className="relative"><Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" /><Input value={filters.eciSearch} onChange={(e) => setFilter({ eciSearch: e.target.value })} placeholder={t("search")} aria-label={t("search")} className="h-9 pl-9" /></div>
					{selectControl(filters.eciOrg, (eciOrg) => setFilter({ eciOrg }), t("organisation"), [["all", t("allOrganisations")], ...organisations.map((o): [string, string] => [o, o])])}
					{selectControl(filters.eciAccess, (eciAccess) => setFilter({ eciAccess }), t("access"), [["all", t("allAccess")], ["open", t("open")], ["closed", t("closed")], ["unknown", t("unknown")]])}
					<div className="flex justify-between"><Button size="sm" variant="ghost" className="h-7 px-0 text-xs" onClick={() => setFilter({ eciModels: [...new Set([...selected, ...candidates.map((r) => r.id)])] })}>{t("selectAll")}</Button><Button size="sm" variant="ghost" className="h-7 px-0 text-xs" onClick={() => setFilter({ eciModels: [...selected].filter((id) => !candidates.some((r) => r.id === id)) })}>{t("clear")}</Button></div>
				</div>
				<ScrollArea className="h-[min(520px,calc(100dvh-320px))] border-t"><div className="space-y-0.5 p-2">{candidates.length ? candidates.map((r) => <label key={r.id} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-2 text-xs hover:bg-accent"><Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} aria-label={r.name} className="mt-0.5" /><span className="mt-1 size-2 shrink-0 rounded-full" style={{ backgroundColor: epochColour(r.organisation) }} /><span className="min-w-0"><span className="block font-medium">{r.name}</span><span className="text-[11px] text-muted-foreground">{r.organisation || t("unknown")}</span></span></label>) : <p className="p-4 text-xs text-muted-foreground">{t("noResults")}</p>}</div></ScrollArea>
	</>;
	return <div className="min-w-0 border-t" onKeyDown={(e) => { if (e.key === "Escape") { setHover(null); setPinned(null); } }}>
		<div className="flex flex-wrap items-center justify-between gap-4 border-b px-4 py-3 lg:px-6">
			<div className="flex rounded-lg bg-muted p-1" aria-label={t("index")} role="group">{metrics.map((m) => <Button key={m} size="sm" variant={metric === m ? "secondary" : "ghost"} disabled={m !== "overall" && !data.domainsAvailable} aria-pressed={metric === m} onClick={() => setFilter({ eciMetric: m, eciView: m === "overall" ? "timeline" : "domain" })}>{t(m)}</Button>)}</div>
			<div className="flex gap-2"><Sheet><SheetTrigger asChild><Button size="sm" variant="outline" className="lg:hidden"><SlidersHorizontal className="size-3.5" />{t("models")} ({rows.length})</Button></SheetTrigger><SheetContent side="left" className="w-full max-w-sm gap-0 p-0"><SheetTitle className="px-4 pt-5 text-base">{t("models")}</SheetTitle>{modelControls}</SheetContent></Sheet><Button size="sm" variant="ghost" onClick={() => { setPinned(null); setFilter({ eciMetric: null, eciView: null, eciOrg: null, eciAccess: null, eciSince: null, eciModels: null, eciSearch: null }); }}><RotateCcw className="size-3.5" />{t("reset")}</Button><Button size="sm" variant="outline" onClick={csv}><Download className="size-3.5" />{t("export")}</Button></div>
		</div>
		<div className="flex min-w-0 flex-col lg:flex-row">
			<aside className="hidden w-64 shrink-0 border-r bg-card/30 lg:block">{modelControls}</aside>
			<div className="min-w-0 flex-1">
				<section id="progress" className="scroll-mt-20 p-4 lg:p-6">
					<div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><p className="mb-1 text-xs font-medium text-muted-foreground">{t("index")}</p><h2 className="text-xl font-semibold tracking-tight">{mode === "domain" ? t("domainComparison", { domain: t(metric) }) : t("timeline")}</h2></div><div className="flex flex-wrap gap-2">{metric !== "overall" ? selectControl(mode, (eciView) => setFilter({ eciView }), t("view"), [["timeline", t("timeline")], ["domain", t("vsGeneral")]]) : null}{selectControl(filters.eciSince, (eciSince) => setFilter({ eciSince }), t("dateRange"), [["2024", t("since2024")], ["2025", t("since2025")], ["2026", t("since2026")], ["all", t("allTime")]])}</div></div>
					<div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground"><span className="tabular-nums">{t("scoredModels", { count: ranked.length })}</span>{metric === "overall" ? <><label className="flex items-center gap-2"><Checkbox checked={frontier} onCheckedChange={(v) => setFrontier(v === true)} />{t("frontier")}</label><label className="flex items-center gap-2"><Checkbox checked={intervals} onCheckedChange={(v) => setIntervals(v === true)} />{t("confidence")}</label></> : <span>{t("domainNote")}</span>}</div>
					<div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_240px]">
						<EpochDashboardChart rows={rows} metric={metric} mode={mode} frontier={frontier} intervals={intervals} inspect={(id) => { if (id !== null || pinned !== null) setHover(id); }} pin={pin} selected={inspected?.id ?? null} pinned={reference?.id ?? null} />
						<div className="min-w-0 rounded-xl border bg-card p-4 xl:mt-5 xl:self-start" aria-live="polite">
							{inspected ? <><div className="flex items-start justify-between gap-2"><div><p className="text-xs text-muted-foreground">{inspected.organisation || t("unknown")}</p><h3 className="mt-1 text-sm font-semibold">{inspected.name}</h3></div><Button size="icon" variant="ghost" className="size-6 shrink-0" aria-label={t("close")} onClick={() => { setHover(null); setPinned(null); }}><X className="size-3.5" /></Button></div><p className="mt-2 text-xs text-muted-foreground">{date(inspected.date)} · {t(inspected.access)}</p><dl className="mt-5 space-y-3">{metrics.map((m) => <div key={m} className="flex items-baseline justify-between gap-2 text-xs"><dt className="text-muted-foreground">{t(m)}</dt><dd className="whitespace-nowrap font-semibold tabular-nums">{number(inspected.scores[m])}</dd></div>)}</dl>{metric === "overall" && inspected.interval ? <p className="mt-3 text-xs text-muted-foreground">{t("confidence")}: {number(inspected.interval.low)}–{number(inspected.interval.high)}</p> : null}{metric !== "overall" ? <p className="mt-3 text-xs text-muted-foreground">{t("benchmarkCount", { count: inspected.counts[metric] })}</p> : null}{reference && reference.id !== inspected.id && reference.scores[metric] !== null && inspected.scores[metric] !== null ? <div className="mt-4 border-t pt-3"><p className="text-xs text-muted-foreground">{t("comparedWith", { model: reference.name })}</p><p className="mt-1 text-lg font-semibold tabular-nums">{inspected.scores[metric]! - reference.scores[metric]! > 0 ? "+" : ""}{number(inspected.scores[metric]! - reference.scores[metric]!)} <span className="text-xs font-normal text-muted-foreground">{t("points")}</span></p></div> : null}<Button size="sm" variant="outline" className="mt-4 w-full" onClick={() => pin(inspected.id)}>{reference?.id === inspected.id ? t("unpin") : t("pin")}</Button>{inspected.modelId ? <Link href={`/models/${inspected.modelId}`} className="mt-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">{t("modelPage")}<ArrowUpRight className="size-3" /></Link> : null}</> : <div className="flex min-h-44 flex-col items-center justify-center gap-3 text-center"><Search className="size-5 text-muted-foreground" /><p className="max-w-48 text-xs leading-relaxed text-muted-foreground">{t("inspectHint")}</p></div>}
						</div>
					</div>
				</section>
				<section id="model-results" className="scroll-mt-20 border-t p-4 lg:p-6"><div className="mb-4 flex items-center justify-between"><h2 className="text-base font-semibold">{t("rankings")}</h2><span className="text-xs text-muted-foreground">{t("scoredModels", { count: ranked.length })}</span></div>
					<div className="min-w-0"><table className="w-full table-fixed text-left text-xs"><thead className="border-b text-muted-foreground"><tr><th className="w-9 pb-3 font-normal">#</th><th className="pb-3 font-normal"><button className="inline-flex items-center gap-1" onClick={() => sortBy("name")}>{t("model")}{sort === "name" ? ascending ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : null}</button></th><th className="hidden w-28 pb-3 text-right font-normal sm:table-cell"><button onClick={() => sortBy("date")}>{t("releaseDate")}</button></th><th className="w-24 pb-3 text-right font-normal"><button className="inline-flex items-center gap-1" onClick={() => sortBy("score")}>{t(metric)}{sort === "score" ? ascending ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : null}</button></th></tr></thead><tbody>{ranking.slice(currentPage * 25, currentPage * 25 + 25).map((r) => <tr key={r.id} className={`border-b last:border-0 ${reference?.id === r.id ? "bg-accent" : ""}`}><td className="py-3 tabular-nums text-muted-foreground">{ranks.get(r.id) ?? "—"}</td><td className="py-3 pr-2"><button className="flex w-full items-center gap-2 text-left hover:underline" onClick={() => pin(r.id)} aria-pressed={reference?.id === r.id}><span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: epochColour(r.organisation) }} /><span className="min-w-0 break-words"><span className="font-medium">{r.name}</span><span className="mt-0.5 block text-[11px] text-muted-foreground">{r.organisation || t("unknown")} · {t(r.access)}</span></span></button></td><td className="hidden py-3 text-right text-muted-foreground sm:table-cell">{date(r.date)}</td><td className="py-3 text-right font-semibold tabular-nums">{number(r.scores[metric])}</td></tr>)}</tbody></table>{!ranking.length ? <p className="py-12 text-center text-sm text-muted-foreground">{t("noResults")}</p> : null}</div>
					{lastPage > 0 ? <div className="mt-4 flex items-center justify-between"><Button size="sm" variant="outline" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>{t("previous")}</Button><span className="text-xs tabular-nums text-muted-foreground">{currentPage + 1}/{lastPage + 1}</span><Button size="sm" variant="outline" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>{t("next")}</Button></div> : null}
				</section>
				<footer className="space-y-3 border-t px-4 py-5 text-xs leading-relaxed text-muted-foreground lg:px-6"><p><a href="https://epoch.ai/eci" target="_blank" rel="noreferrer" className="underline underline-offset-4">{t("source")}</a>{data.sourceDate ? ` · ${tc("lastSynced")}: ${date(data.sourceDate)}` : ""} · {t("attribution")}</p>{data.source === "catalogue" ? <p role="status">{t("fallback")}</p> : null}<details><summary className="cursor-pointer font-medium">{t("methodology")}</summary><p className="mt-2 max-w-3xl">{t("methodologyNote")}</p><a href="https://epoch.ai/data/eci-documentation/domain-specific-eci" target="_blank" rel="noreferrer" className="mt-2 inline-block underline underline-offset-4">{t("methodologyLink")}</a></details></footer>
			</div>
		</div>
	</div>;
}
