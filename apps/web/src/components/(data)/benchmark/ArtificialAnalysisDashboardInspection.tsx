"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ReferenceLine, usePlotArea, useXAxisScale, useYAxisScale } from "recharts";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { localizedBenchmarkConfiguration } from "@/i18n/benchmark-display";
import type { DashboardRow } from "@/lib/benchmarks/artificialAnalysisDashboard";

type Selection = { kind: "model" | "configuration"; id: string };

/** A temporary inspection returns to the pinned selection when the pointer leaves. */
export function useDashboardInspection(regionRef: RefObject<HTMLElement | null>) {
 const [temporary, setTemporary] = useState<Selection | null>(null);
 const [pinned, setPinned] = useState<Selection | null>(null);
 const suppressHover = useRef(false);
 const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
 const keep = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
 const inspect = (selection: Selection) => { keep(); setTemporary((previous) => previous?.kind === selection.kind && previous.id === selection.id ? previous : selection); };
 const hover = (selection: Selection) => { if (!suppressHover.current) inspect(selection); };
 const leave = () => { if (timer.current) return; timer.current = setTimeout(() => { timer.current = null; setTemporary(null); }, 180); };
 const pin = (selection: Selection) => { keep(); setTemporary(null); setPinned((previous) => previous?.kind === selection.kind && previous.id === selection.id ? null : selection); };
 const clear = () => { suppressHover.current = true; keep(); setTemporary(null); setPinned(null); };
 useEffect(() => {
 const outside = (event: PointerEvent) => { if (regionRef.current && !regionRef.current.contains(event.target as Node)) { if (timer.current) clearTimeout(timer.current); setTemporary(null); setPinned(null); } };
 const moved = () => { suppressHover.current = false; };
 document.addEventListener("pointermove", moved);
 document.addEventListener("pointerdown", outside);
 return () => { document.removeEventListener("pointermove", moved); document.removeEventListener("pointerdown", outside); if (timer.current) clearTimeout(timer.current); };
 }, [regionRef]);
 return { selection: temporary ?? pinned, pinned, inspect, hover, leave, keep, pin, clear };
}

export function DashboardInspectionCard({ row, comparison, comparisonMetric, title, metric, unit, pinned, keep, leave, close }: {
 row: DashboardRow; comparison?: DashboardRow; comparisonMetric?: number | null; title: string; metric: number | null; unit: string; pinned: boolean;
 keep: () => void; leave: () => void; close: () => void;
}) {
 const tx = useTranslations(), locale = useLocale();
 const metrics: [string, number | null, string, number | null][] = [
 [tx("Catalogue.rankings.benchmarkMetrics.intelligence"), row.intelligence, "score", comparison?.intelligence ?? null],
 [title, metric, unit, comparisonMetric ?? null],
 [tx("Catalogue.benchmarks.explorer.tokensPerTask"), row.tokensPerTask, "tokens", comparison?.tokensPerTask ?? null],
 [tx("Catalogue.benchmarks.explorer.costPerTask"), row.costPerTask, "usd", comparison?.costPerTask ?? null],
 [tx("Catalogue.benchmarks.explorer.timePerTask"), row.timePerTask, "seconds", comparison?.timePerTask ?? null],
 ];
 const format = (value: number | null, kind: string) => value === null || !Number.isFinite(value) ? "—" : new Intl.NumberFormat(locale, { maximumSignificantDigits: 4, ...(kind === "usd" ? { style: "currency", currency: "USD" } : kind === "tokens" ? { notation: "compact" } : {}) }).format(value) + (kind === "seconds" ? " s" : "");
 return <div data-export-hide data-pinned={pinned || undefined} role="status" onMouseEnter={keep} onMouseLeave={leave} onFocus={keep} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) leave(); }} className={`${comparison ? "w-[22rem]" : "w-64"} max-w-full rounded-lg border bg-popover p-3 text-xs text-popover-foreground shadow-md`}>
 <div className="flex items-start gap-2"><Logo id={row.creatorId} alt="" width={18} height={18} /><div className="min-w-0 flex-1"><p className="font-semibold">{row.modelName}</p><p className="mt-1 text-muted-foreground">{localizedBenchmarkConfiguration(row.effort, tx)}{pinned ? ` · ${tx("Catalogue.benchmarks.explorer.pinned")}` : ""}</p></div><Button variant="ghost" size="icon" className="-mr-1 -mt-1 size-7" aria-label={tx("Common.accessibility.close")} onClick={close}>×</Button></div>
 {comparison ? <div className="my-3"><p className="mb-2 truncate text-muted-foreground">{comparison.sourceName}</p><table className="w-full text-right tabular-nums"><thead className="text-[10px] font-normal text-muted-foreground"><tr><th scope="col" className="sr-only">{tx("Catalogue.benchmarks.explorer.score")}</th><th scope="col" className="pb-2">{tx("Catalogue.benchmarks.explorer.selected")}</th><th scope="col" className="pb-2 pl-2">{tx("Catalogue.benchmarks.explorer.hovered")}</th><th scope="col" className="pb-2 pl-2">{tx("Catalogue.benchmarks.explorer.multiplier")}</th></tr></thead><tbody>{metrics.filter(([label], index) => metrics.findIndex((item) => item[0] === label) === index).filter(([, value,, reference]) => value !== null || reference !== null).map(([label, value, kind, reference]) => <tr key={label}><th scope="row" className="py-1 pr-2 text-left text-[11px] font-normal text-muted-foreground">{label}</th><td>{format(reference, kind)}</td><td className="pl-2 font-medium">{format(value, kind)}</td><td className="pl-2 text-muted-foreground">{value !== null && reference !== null && reference !== 0 && Number.isFinite(value / reference) ? new Intl.NumberFormat(locale, { maximumSignificantDigits: 3 }).format(value / reference) + "×" : "—"}</td></tr>)}</tbody></table></div> : <dl className="my-3 space-y-2">{metrics.filter(([label], index) => metrics.findIndex((item) => item[0] === label) === index).map(([label, value, kind]) => value !== null && Number.isFinite(value) ? <div key={label} className="flex justify-between gap-4"><dt className="text-muted-foreground">{label}</dt><dd className="shrink-0 font-medium tabular-nums" title={String(value)}>{format(value, kind)}</dd></div> : null)}</dl>}
 {row.sourceSlug ? <a href={`https://artificialanalysis.ai/models/${row.sourceSlug}`} target="_blank" rel="noreferrer" className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">Artificial Analysis ↗</a> : null}
 </div>;
}

export function DashboardInspectionGuides({ point, columns, colour, number, xNumber }: { point?: { x: number; y: number }; columns: boolean; colour: string; number: (value: number) => string; xNumber: (value: number) => string }) {
 const plot = usePlotArea(), xScale = useXAxisScale(), yScale = useYAxisScale();
 if (!point || !plot || !xScale || !yScale) return null;
 const x = xScale(point.x), y = yScale(point.y);
 if (typeof x !== "number" || typeof y !== "number") return null;
 return <ReferenceLine y={point.y} zIndex={1000} stroke="none" ifOverflow="visible" shape={<g data-export-hide pointerEvents="none" aria-hidden="true"><path d={`M${plot.x},${y} H${plot.x + plot.width}${columns ? "" : ` M${x},${plot.y} V${plot.y + plot.height}`}`} stroke={colour} strokeDasharray="3 4" opacity={0.6} /><rect x={Math.max(0, plot.x - 54)} y={y - 10} width={50} height={20} rx={3} fill="var(--popover)" stroke={colour} /><text x={plot.x - 8} y={y + 4} textAnchor="end" fontSize={10} fill="var(--foreground)">{number(point.y)}</text>{!columns ? <g><rect x={x - 29} y={plot.y + plot.height + 3} width={58} height={20} rx={3} fill="var(--popover)" stroke={colour} /><text x={x} y={plot.y + plot.height + 17} textAnchor="middle" fontSize={10} fill="var(--foreground)">{xNumber(point.x)}</text></g> : null}</g>} />;
}
