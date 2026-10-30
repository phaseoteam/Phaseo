"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown, ListChecks, ListX } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { PublicIntelligenceValueEntry } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { useTranslations } from "next-intl";
import { localizedBenchmarkConfiguration } from "@/i18n/benchmark-display";
import { IntelligenceValueBars } from "./IntelligenceValueBars";
import { IntelligenceValueTable } from "./IntelligenceValueTable";
import { artificialAnalysisValueKey, artificialAnalysisValueLabel } from "@/lib/benchmarks/artificialAnalysis";

function ValueChartLoading() {
	const tValue = useTranslations("Catalogue.rankings.intelligenceValue");
	return <div className="flex h-96 items-center justify-center text-sm text-muted-foreground" role="status">{tValue("loadingChart")}</div>;
}

const Scatter = dynamic(() => import("./IntelligenceValueScatter"), { ssr: false, loading: ValueChartLoading });

export function IntelligenceValueComparison({ entries, total, limit, onShowMore }: { entries: PublicIntelligenceValueEntry[]; total: number; limit: number; onShowMore: () => void }) {
		const t = useTranslations();
	const tValue = useTranslations("Catalogue.rankings.intelligenceValue");
	const configurationLabel = (entry: PublicIntelligenceValueEntry) => artificialAnalysisValueLabel(entry, (variant) => localizedBenchmarkConfiguration(variant, t));

	const [view, setView] = useState<"bars" | "scatter">("bars");
	const [selected, setSelected] = useState<Set<string> | null>(null);
	const [query, setQuery] = useState("");
	const [pickerOpen, setPickerOpen] = useState(false);
	const visible = entries.filter((entry) => selected === null || selected.has(artificialAnalysisValueKey(entry)));
	const options = entries.filter((entry) => `${entry.model_name} ${entry.organisation_name ?? ""} ${configurationLabel(entry)}`.toLowerCase().includes(query.toLowerCase()));
	return <>
		<div className="flex flex-wrap items-center justify-between gap-3 pt-4">
			<div role="group" aria-label={tValue("chartDisplay")} className="flex gap-2">
				<Button variant={view === "bars" ? "secondary" : "ghost"} size="sm" aria-pressed={view === "bars"} onClick={() => setView("bars")}>{tValue("usdPerPoint")}</Button>
				<Button variant={view === "scatter" ? "secondary" : "ghost"} size="sm" aria-pressed={view === "scatter"} onClick={() => setView("scatter")}>{tValue("scoreVsCost")}</Button>
			</div>
			<Popover open={pickerOpen} onOpenChange={setPickerOpen}><PopoverTrigger asChild><Button variant="outline" size="sm" className="w-full justify-between sm:w-64"><span>{tValue("configurationCount", { visible: visible.length, total: entries.length })}</span><ChevronsUpDown className="size-3.5 text-muted-foreground" /></Button></PopoverTrigger>
				<PopoverContent initialFocus={false} align="end" className="w-[min(28rem,calc(100vw-2rem))] gap-0 p-0">
					<div className="p-2"><Input aria-label={tValue("searchConfigurations")} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tValue("searchPlaceholder")} className="h-8" /></div>
					<div className="max-h-80 overflow-y-auto overscroll-contain p-1" role="group" aria-label={tValue("evaluatedConfigurations")}>
						{!options.length ? <p className="py-6 text-center text-sm text-muted-foreground">{tValue("noConfiguration")}</p> : null}
						{options.map((entry) => <button type="button" role="checkbox" aria-checked={selected === null || selected.has(artificialAnalysisValueKey(entry))} key={artificialAnalysisValueKey(entry)} onClick={() => setSelected((current) => { const next = new Set(current ?? entries.map(artificialAnalysisValueKey)); const key = artificialAnalysisValueKey(entry); if (next.has(key)) next.delete(key); else next.add(key); return next; })} className="flex min-h-8 w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none">
							<span className="relative size-5 shrink-0 overflow-hidden rounded bg-muted"><Logo id={entry.organisation_id ?? entry.model_id} alt="" fill className="object-contain p-0.5" /></span>
							<span className="min-w-0 flex-1 truncate">{entry.model_name} <span className="text-muted-foreground">({configurationLabel(entry)})</span></span>
							<Check aria-hidden="true" className={`size-4 shrink-0 ${selected === null || selected.has(artificialAnalysisValueKey(entry)) ? "" : "invisible"}`} />
						</button>)}
					</div>
					<div className="grid grid-cols-2 gap-1.5 border-t bg-popover p-2"><Button variant="ghost" size="sm" className="h-8 justify-between bg-muted/40 px-2.5 text-xs" onClick={() => setSelected(new Set())}>{t("Catalogue.updates.models.clear")}<ListX className="size-3.5" /></Button><Button variant="ghost" size="sm" className="h-8 justify-between bg-muted/40 px-2.5 text-xs" onClick={() => setSelected(null)}>{t("Common.ui.privacyEligibility.selectAll")}<ListChecks className="size-3.5" /></Button></div>
				</PopoverContent>
			</Popover>
		</div>
		{visible.length ? <>
			{view === "bars" ? <IntelligenceValueBars entries={visible} total={total} /> : <Scatter entries={visible} />}
			<IntelligenceValueTable entries={visible.slice(0, limit)} />
			{visible.length > limit ? <div className="flex justify-end py-3"><Button variant="ghost" size="sm" onClick={onShowMore}>{t("Catalogue.rankings.usageShowMore")}</Button></div> : null}
		</> : <p className="py-10 text-center text-sm text-muted-foreground">{tValue("selectModels")}</p>}
	</>;
}
