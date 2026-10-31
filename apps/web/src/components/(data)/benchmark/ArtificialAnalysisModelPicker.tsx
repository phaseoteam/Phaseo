"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "@/i18n/react";
import { RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/Logo";
import { localizedBenchmarkConfiguration } from "@/i18n/benchmark-display";
import { dashboardModelCategory, dashboardModelTier, toggleDashboardModels, type BenchmarkPickerModel } from "@/lib/benchmarks/artificialAnalysisModelPicker";
import { dashboardColour } from "./ArtificialAnalysisDashboardChart";

export function ArtificialAnalysisModelPicker({ models, selected, efforts, selectedEfforts, onModels, onEfforts, onReset, onHighlight, hideHeading = false, filters, search: controlledSearch, onSearch }: {
	hideHeading?: boolean; filters?: ReactNode; search?: string; onSearch?: (value: string) => void; models: BenchmarkPickerModel[]; selected: Set<string>; efforts: string[]; selectedEfforts: string[] | null;
	onModels: (ids: string[]) => void; onEfforts?: (efforts: string[] | null) => void; onReset: () => void; onHighlight: (id: string | null) => void;
}) {
	const tx = useTranslations();
	const t = useTranslations("Catalogue.benchmarks.explorer");
	const locale = useLocale();
	const [internalSearch, setInternalSearch] = useState("");
	const search = controlledSearch ?? internalSearch;
	const setSearch = (value: string) => { setInternalSearch(value); onSearch?.(value); };
	const [expanded, setExpanded] = useState(false);
	const input = useRef<HTMLInputElement>(null);
	useEffect(() => {
		const shortcut = (event: KeyboardEvent) => {
			if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || (event.target instanceof HTMLElement && (event.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)))) return;
			if (!input.current?.getClientRects().length) return;
			event.preventDefault(); input.current.focus();
		};
		window.addEventListener("keydown", shortcut);
		return () => window.removeEventListener("keydown", shortcut);
	}, []);
	const matching = models.filter((model) => model.modelName.toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale)));
	const row = (model: BenchmarkPickerModel) => <button key={model.modelId} type="button" aria-pressed={selected.has(model.modelId)} onClick={() => onModels(toggleDashboardModels(selected, [model.modelId]))} onMouseEnter={() => onHighlight(selected.has(model.modelId) ? model.modelId : null)} onMouseLeave={() => onHighlight(null)} onFocus={() => onHighlight(model.modelId)} onBlur={() => onHighlight(null)} className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-muted-foreground hover:bg-muted aria-pressed:font-medium aria-pressed:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
		<Logo id={model.creatorId} alt="" width={15} height={15} className="shrink-0 object-contain" /><span className="min-w-0 flex-1 truncate">{model.modelName}</span><span className={`size-1.5 shrink-0 rounded-full ${selected.has(model.modelId) ? "" : "opacity-15"}`} style={{ background: dashboardColour(model) }} />
	</button>;
	const group = (category: ReturnType<typeof dashboardModelCategory>) => {
		const items = matching.filter((model) => dashboardModelCategory(model) === category);
		if (!items.length) return null;
		const all = items.every((model) => selected.has(model.modelId));
		const contents = <div className="pb-3">{items.map(row)}</div>;
		const heading = <div className="mb-1 flex min-h-8 items-center justify-between gap-1 px-2"><span className="text-xs font-medium">{t(category)}</span><div className="flex items-center">{category === "frontier" ? (["small", "medium", "large"] as const).map((tier) => {
			const ids = items.filter((model) => dashboardModelTier(model) === tier).map((model) => model.modelId);
			return ids.length ? <button type="button" key={tier} aria-pressed={ids.every((id) => selected.has(id))} onClick={() => onModels(toggleDashboardModels(selected, ids))} className="rounded px-1.5 py-1.5 text-[10px] text-muted-foreground hover:bg-muted aria-pressed:text-foreground">{t(tier)}</button> : null;
		}) : <button type="button" aria-pressed={all} onClick={() => onModels(toggleDashboardModels(selected, items.map((model) => model.modelId)))} className="rounded px-1.5 py-1.5 text-[10px] text-muted-foreground hover:bg-muted aria-pressed:text-foreground">{t("all")}</button>}</div></div>;
		return <div key={category}>{heading}{contents}</div>;
	};
	return <div className="p-2">
		{!hideHeading ? <div className="flex items-center justify-between px-2 pb-2 text-sm font-semibold"><span>{tx("Common.nav.models")} <span className="ml-1 font-normal tabular-nums text-muted-foreground">{selected.size}</span></span><Button variant="ghost" size="icon-sm" aria-label={tx("Catalogue.models.filtersUi.resetFiltersAndSearch")} onClick={() => { setSearch(""); onReset(); }}><RotateCcw className="size-3.5" /></Button></div> : null}
		<div className="relative mb-4"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" /><Input ref={input} value={search} onChange={(event) => setSearch(event.target.value)} aria-label={tx("Catalogue.rankings.searchModels")} placeholder={tx("Catalogue.benchmarks.filterModels")} className="h-9 pl-8 pr-6 text-xs" /><kbd className="pointer-events-none absolute right-3 top-2 text-xs text-muted-foreground">/</kbd></div>
		{filters}
		{efforts.length > 0 ? <div role="group" aria-label={tx("Common.ui.benchmarkChartCopy.modelConfiguration")} className="mb-4 px-2"><p className="mb-1 text-xs font-medium">{t("reasoning")}</p><div className="flex flex-wrap gap-0.5">{efforts.map((effort) => <button key={effort} type="button" aria-pressed={!selectedEfforts || selectedEfforts.includes(effort)} onClick={() => {
			const next = new Set(selectedEfforts ?? efforts); if (next.has(effort)) next.delete(effort); else next.add(effort); onEfforts?.([...next]);
		}} className="rounded px-1.5 py-1.5 text-[11px] text-muted-foreground hover:bg-muted aria-pressed:bg-muted aria-pressed:text-foreground focus-visible:outline-2 focus-visible:outline-ring">{localizedBenchmarkConfiguration(effort, tx)}</button>)}</div></div> : null}
		{search ? <div>{matching.map(row)}{!matching.length ? <p role="status" className="px-2 py-6 text-xs text-muted-foreground">{tx("Catalogue.rankings.noSearchMatches")}</p> : null}</div> : <>
			{group("frontier")}{group("notable")}
			<button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="mb-2 w-full rounded px-2 py-2 text-left text-xs text-muted-foreground hover:bg-muted">{expanded ? t("hideOtherModels") : tx("Common.ui.benchmarkChartCopy.showAllModels")}</button>
			{expanded ? <>{group("other")}{(["openWeights", "older"] as const).map((category) => <details key={category} className="border-t"><summary className="cursor-pointer px-2 py-3 text-xs font-medium">{t(category)}</summary>{matching.filter((model) => dashboardModelCategory(model) === category).map(row)}</details>)}</> : null}
		</>}
	</div>;
}
