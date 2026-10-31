"use client";

import { useLocale, useTranslations } from "@/i18n/react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Logo } from "@/components/Logo";
import { effortOrder, type DashboardRow } from "@/lib/benchmarks/artificialAnalysisDashboard";

/** Compare exact configurations; never combine the best scores from different efforts. */
export function ArtificialAnalysisScoreMatrix({ rows, metrics, onSelect }: {
	rows: DashboardRow[];
	metrics: { key: string; label: string; value: (row: DashboardRow) => number | null }[];
	onSelect: (key: string) => void;
}) {
	const tx = useTranslations();
	const locale = useLocale();
	const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 3 });
	const bestIntelligence = new Map<string, number>();
	for (const row of rows) bestIntelligence.set(row.modelId, Math.max(bestIntelligence.get(row.modelId) ?? -Infinity, row.intelligence ?? -Infinity));
	const ordered = [...rows].sort((a, b) => (bestIntelligence.get(b.modelId)! - bestIntelligence.get(a.modelId)!) || a.modelName.localeCompare(b.modelName) || effortOrder.indexOf(a.effort) - effortOrder.indexOf(b.effort) || a.sourceName.localeCompare(b.sourceName));
	const maxima = metrics.map((metric) => Math.max(-Infinity, ...rows.flatMap((row) => { const value = metric.value(row); return value !== null && Number.isFinite(value) ? [value] : []; })));
	return <ScrollArea className="my-4 h-[min(65vh,40rem)] rounded-lg border" scrollBarOrientation="both">
		<table className="w-full border-separate border-spacing-0 text-sm">
			<caption className="sr-only">{tx("Catalogue.rankings.intelligenceValue.evaluatedConfigurations")}</caption>
			<thead className="sticky top-0 z-20 bg-background"><tr>
				<th className="sticky left-0 z-30 min-w-52 border-b bg-background px-4 py-3 text-left text-xs font-medium text-muted-foreground">{tx("Catalogue.rankings.intelligenceValue.modelConfiguration")}</th>
				{metrics.map((metric) => <th key={metric.key} className="min-w-28 border-b px-2 py-2 text-right font-medium"><button type="button" onClick={() => onSelect(metric.key)} className="w-full rounded px-2 py-1.5 text-right text-xs hover:bg-muted hover:underline focus-visible:outline-2 focus-visible:outline-ring">{metric.label}</button></th>)}
			</tr></thead>
			<tbody>{ordered.map((row) => <tr key={row.id} className="group">
				<th className="sticky left-0 z-10 border-b bg-background px-4 py-3 text-left font-normal group-hover:bg-muted"><span className="flex items-center gap-2"><Logo id={row.creatorId} alt="" width={18} height={18} className="shrink-0 object-contain" /><span className="max-w-44 truncate" title={row.sourceName}>{row.sourceName}</span></span></th>
				{metrics.map((metric, index) => { const value = metric.value(row); const available = value !== null && Number.isFinite(value); return <td key={metric.key} className={`border-b px-4 py-3 text-right tabular-nums group-hover:bg-muted/40 ${available && value === maxima[index] ? "bg-primary/5 font-semibold text-primary" : "text-muted-foreground"}`} title={available ? String(value) : undefined}>{available ? format.format(value) : "—"}</td>; })}
			</tr>)}</tbody>
		</table>
	</ScrollArea>;
}
