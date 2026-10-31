"use client";

import { useLocale, useTranslations } from "@/i18n/react";
import { Logo } from "@/components/Logo";
import type { EpochDashboardRow } from "@/lib/benchmarks/epochDashboard";
import { dashboardColour } from "./ArtificialAnalysisDashboardChart";
import { epochColour } from "./EpochDashboardChart";
import { epochCreatorId } from "./EpochInspectionCard";

/** Every row uses the same score axis; interval length never encodes a score. */
export function EpochRangeChart({ rows, selected, pinned, inspect, focus, pin }: {
	rows: EpochDashboardRow[]; selected: string | null; pinned: string | null;
	inspect: (id: string | null) => void; focus: (id: string) => void; pin: (id: string) => void;
}) {
	const t = useTranslations("Catalogue.benchmarks.epochExplorer"), locale = useLocale();
	const scored = rows.filter((row) => row.scores.overall !== null).sort((a, b) => b.scores.overall! - a.scores.overall! || a.name.localeCompare(b.name));
	if (!scored.length) return <p className="py-16 text-center text-sm text-muted-foreground">{t("noChartData")}</p>;
	const values = scored.flatMap((row) => [row.scores.overall!, ...(row.interval ? [row.interval.low, row.interval.high] : [])]);
	const low = Math.floor(Math.min(...values) / 5) * 5 - 2, high = Math.ceil(Math.max(...values) / 5) * 5 + 2;
	const position = (value: number) => `${(value - low) / (high - low) * 100}%`;
	const number = (value: number) => value.toLocaleString(locale, { maximumFractionDigits: 2 });
	return <div data-eci-ranges className="min-w-0" onPointerLeave={() => inspect(null)}>
		<div className="mb-3 grid grid-cols-[minmax(0,1fr)_7.5rem] gap-x-4 text-[11px] text-muted-foreground sm:grid-cols-[11rem_minmax(0,1fr)_8rem]">
			<span>{t("model")}</span><span className="hidden sm:block">{t("overall")}</span><span className="text-right">{t("confidence")}</span>
		</div>
		<div className="space-y-1">{scored.map((row) => {
			const colour = dashboardColour({ modelId: row.id, colour: epochColour(row.organisation) });
			const interval = row.interval ? `${number(row.interval.low)}–${number(row.interval.high)}` : t("intervalUnavailable");
			return <button key={row.id} type="button" data-eci-range={row.id} aria-pressed={pinned === row.id} aria-label={`${row.name}: ${number(row.scores.overall!)}, ${t("confidence")}: ${interval}`} onPointerEnter={() => inspect(row.id)} onPointerLeave={() => inspect(null)} onFocus={() => focus(row.id)} onBlur={() => inspect(null)} onClick={() => pin(row.id)} className={`grid w-full grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-x-4 gap-y-2 rounded-md px-1 py-3 text-left text-xs hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring sm:grid-cols-[11rem_minmax(0,1fr)_8rem] ${selected === row.id || pinned === row.id ? "bg-muted/50" : ""}`}>
				<span className="flex min-w-0 items-center gap-2"><Logo id={epochCreatorId(row.organisation)} alt="" width={15} height={15} className="shrink-0" /><span className="truncate" title={row.name}>{row.name}</span></span>
				<span aria-hidden="true" className="relative col-span-2 row-start-2 mx-2 h-5 sm:col-span-1 sm:col-start-2 sm:row-start-1">
					{[0, 25, 50, 75, 100].map((tick) => <span key={tick} className="absolute inset-y-[-12px] border-l border-dashed border-border" style={{ left: `${tick}%` }} />)}
					{row.interval ? <span data-eci-interval className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full" style={{ left: position(row.interval.low), width: `${(row.interval.high - row.interval.low) / (high - low) * 100}%`, background: colour, opacity: 0.45 }} /> : null}
					<span className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-background" style={{ left: position(row.scores.overall!), background: colour }} />
				</span>
				<span className="text-right tabular-nums"><span className="font-medium">{number(row.scores.overall!)}</span><span className="mt-1 block text-[10px] text-muted-foreground">{interval}</span></span>
			</button>;
		})}</div>
		<div aria-hidden="true" className="mt-4 grid grid-cols-1 sm:grid-cols-[11rem_minmax(0,1fr)_8rem] sm:gap-x-4"><div className="relative mx-3 h-6 text-[10px] tabular-nums text-muted-foreground sm:col-start-2">{[0, 25, 50, 75, 100].map((tick) => <span key={tick} className="absolute -translate-x-1/2" style={{ left: `${tick}%` }}>{number(low + (high - low) * tick / 100)}</span>)}</div></div>
		<p className="mt-3 text-xs text-muted-foreground">{t("overlapNote")}</p>
	</div>;
}
