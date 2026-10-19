"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CartesianGrid, ComposedChart, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis, useYAxisScale } from "recharts";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { localizedBenchmarkConfiguration } from "@/i18n/benchmark-display";
import { dashboardLabelPositions, dashboardLinearTicks, dashboardLogTicks, effortOrder, paretoPoints, type DashboardRow } from "@/lib/benchmarks/artificialAnalysisDashboard";

export function dashboardColour(row: DashboardRow) {
	const colour = /^#[\da-f]{6}$/i.test(row.colour ?? "") ? row.colour! : "#6b7280";
	const channels = [1, 3, 5].map((offset) => Number.parseInt(colour.slice(offset, offset + 2), 16));
	return Math.max(...channels) < 96 && Math.max(...channels) - Math.min(...channels) < 12 ? "var(--foreground)" : colour;
}

function DashboardColumn({ cx, cy, width, label, colour, opacity, onFocus, onBlur }: { cx: number; cy: number; width: number; label: string; colour: string; opacity: number; onFocus: () => void; onBlur: () => void }) {
	const scale = useYAxisScale();
	const zero = scale?.(0);
	if (typeof zero !== "number") return null;
	return <rect tabIndex={0} role="img" aria-label={label} onFocus={onFocus} onBlur={onBlur} className="focus-visible:outline-2 focus-visible:outline-ring" x={cx - width / 2} y={Math.min(cy, zero)} width={width} height={Math.max(1, Math.abs(zero - cy))} rx={2} fill={colour} opacity={opacity}><title>{label}</title></rect>;
}

export function ArtificialAnalysisDashboardChart({ title, rows, value, xValue, xLabel, xUnit, unit = "score", highlight }: {
	title: string; rows: DashboardRow[]; value: (row: DashboardRow) => number | null; xValue?: (row: DashboardRow) => number | null;
	xLabel?: string; xUnit?: "usd" | "seconds"; unit?: "score" | "tokens" | "usd"; highlight: string | null;
}) {
	const tx = useTranslations();
	const locale = useLocale();
	const [log, setLog] = useState(true);
	const [frontier, setFrontier] = useState(false);
	const [hovered, setHovered] = useState<string | null>(null);
	const [grouped, setGrouped] = useState(true);
	const columns = !xValue && grouped;
	const activeModel = highlight ?? hovered;
	const [size, setSize] = useState({ width: 0, height: 500 });
	const efforts = [...new Set(rows.map((row) => row.effort))].sort((a, b) => {
		const rank = (effort: string) => effortOrder.includes(effort) ? effortOrder.indexOf(effort) : effortOrder.length;
		return rank(a) - rank(b) || a.localeCompare(b);
	});
	const modelIds = [...new Set(rows.map((row) => row.modelId))];
	const all = rows.flatMap((row) => {
		const y = value(row), x = xValue ? xValue(row) : columns ? modelIds.indexOf(row.modelId) + (efforts.indexOf(row.effort) - (efforts.length - 1) / 2) * 0.65 / efforts.length : efforts.indexOf(row.effort);
		return y === null || x === null || !Number.isFinite(x) || !Number.isFinite(y) ? [] : [{ x, y, row }];
	});
	const points = all.filter((point) => !xValue || !log || point.x > 0);
	const ticks = xValue && log ? dashboardLogTicks(points.map((point) => point.x)) : undefined;
	const series = [...new Set(points.map((point) => point.row.modelId))].map((id) => ({ id, points: points.filter((point) => point.row.modelId === id).sort((a, b) => a.x - b.x) }));
	const directLabels = !columns && size.width >= 640 && series.length <= 14;
	const yTicks = dashboardLinearTicks([...points.map((point) => point.y), ...(columns ? [0] : [])]);
	const domain: [number, number] = [yTicks[0], yTicks.at(-1)!];
	const labelPositions = dashboardLabelPositions(series.map((item) => ({ id: item.id, y: 24 + (domain[1] - item.points.at(-1)!.y) / (domain[1] - domain[0]) * Math.max(1, size.height - 100) })), 24, size.height - 80);
	const number = (n: number, compact = false) => new Intl.NumberFormat(locale, { ...(unit === "usd" ? { style: "currency" as const, currency: "USD", currencyDisplay: "narrowSymbol" as const } : {}), ...(compact ? { ...(Math.abs(n) >= 1000 ? { notation: "compact" as const } : {}), maximumSignificantDigits: 3 } : { maximumSignificantDigits: 12 }) }).format(n);
	const xNumber = (n: number) => new Intl.NumberFormat(locale, { maximumSignificantDigits: 3, ...(xUnit === "usd" ? { style: "currency" as const, currency: "USD", currencyDisplay: "narrowSymbol" as const } : xUnit === "seconds" ? { style: "unit" as const, unit: "second", unitDisplay: "narrow" as const } : {}) }).format(n);
	const axis = { fontSize: 11, fill: "var(--muted-foreground)" };
	return <section className="min-w-0 scroll-mt-32 py-3" aria-label={title}>
		<div className="mb-3 flex flex-wrap items-center justify-between gap-3">
			<h3 className="text-base font-semibold tracking-tight">{title}</h3>
			{xValue ? <div className="flex flex-wrap gap-1">
				<Button size="sm" variant={frontier ? "secondary" : "ghost"} aria-pressed={frontier} onClick={() => setFrontier(!frontier)}>{tx("Catalogue.benchmarks.explorer.pareto")}</Button>
				{[false, true].map((isLog) => <Button key={String(isLog)} size="sm" variant={log === isLog ? "secondary" : "ghost"} aria-pressed={log === isLog} onClick={() => setLog(isLog)}>{tx(`Catalogue.compare.${isLog ? "logScale" : "linearScale"}`)}</Button>)}
			</div> : <div className="flex gap-1"><Button size="sm" variant={grouped ? "secondary" : "ghost"} aria-pressed={grouped} onClick={() => setGrouped(true)}>{tx("Common.nav.models")}</Button><Button size="sm" variant={!grouped ? "secondary" : "ghost"} aria-pressed={!grouped} onClick={() => setGrouped(false)}>{tx("Common.ui.benchmarkChartCopy.modelConfiguration")}</Button></div>}
		</div>
		{!points.length ? <div className="flex min-h-72 items-center justify-center text-sm text-muted-foreground" role="status">{all.length && log ? <Button variant="outline" onClick={() => setLog(false)}>{tx("Catalogue.compare.linearScale")}</Button> : tx("Common.ui.benchmarkChartCopy.noResultsAvailableForThisMetric")}</div> : <div className="h-[clamp(340px,calc(100svh-23rem),720px)] min-h-85" role="img" aria-label={title}>
			<ResponsiveContainer width="100%" height="100%" onResize={(width, height) => setSize({ width, height })}>
					<ComposedChart margin={{ top: 24, right: directLabels ? 184 : 16, left: 0, bottom: 32 }}>
					<CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 5" />
					<XAxis type="number" dataKey="x" scale={xValue && log ? "log" : "auto"} domain={xValue ? ticks ? [ticks[0], ticks.at(-1)!] : ["auto", "auto"] : [-0.5, Math.max(0.5, (columns ? modelIds : efforts).length - 0.5)]} ticks={xValue ? ticks : (columns ? modelIds : efforts).map((_, i) => i)} tick={axis} tickLine={false} axisLine={{ stroke: "var(--border)" }} tickFormatter={(n: number) => xValue ? xNumber(n) : columns ? rows.find((row) => row.modelId === modelIds[n])?.modelName ?? "" : localizedBenchmarkConfiguration(efforts[n], tx)} angle={columns ? -25 : 0} textAnchor={columns ? "end" : "middle"} height={columns ? 85 : 30} interval="preserveStartEnd" label={{ value: xLabel ?? tx(columns ? "Common.nav.models" : "Common.ui.benchmarkChartCopy.modelConfiguration"), position: "bottom", offset: 12, ...axis }} />
					<YAxis type="number" dataKey="y" domain={domain} ticks={yTicks} tick={axis} width={58} tickLine={false} axisLine={false} tickFormatter={(n: number) => number(n, true)} label={xValue ? { value: tx("Catalogue.rankings.benchmarkMetrics.intelligence"), position: "insideTopLeft", dy: -22, ...axis } : undefined} />
					<Tooltip shared={false} cursor={{ stroke: "var(--border)" }} content={({ active, payload }) => {
						const point = payload?.[0]?.payload as typeof points[number] | undefined;
						return active && point?.row ? <div className="max-w-80 rounded-lg border bg-popover p-3 text-xs text-popover-foreground shadow-md"><p className="font-medium">{point.row.sourceName}</p><p className="mt-2 tabular-nums">{xValue ? tx("Catalogue.rankings.benchmarkMetrics.intelligence") : title}: {number(point.y)}</p>{xValue ? <p className="mt-1 tabular-nums">{xLabel}: {new Intl.NumberFormat(locale, { maximumSignificantDigits: 12 }).format(point.x)}</p> : null}</div> : null;
					}} />
					{series.map((series) => <Scatter key={series.id} name={series.points[0].row.modelName} data={series.points} fill={dashboardColour(series.points[0].row)} stroke="var(--background)" strokeWidth={1} opacity={activeModel && activeModel !== series.id ? 0.15 : 1} onMouseEnter={() => setHovered(series.id)} onMouseLeave={() => setHovered(null)} line={!columns && new Set(series.points.map((point) => point.row.effort)).size === series.points.length ? { stroke: dashboardColour(series.points[0].row), strokeWidth: activeModel === series.id ? 2.5 : 1.75 } : false} lineType="joint" lineJointType="linear" isAnimationActive={false} shape={(props: unknown) => {
						const { cx, cy, payload } = props as { cx: number; cy: number; payload: typeof points[number] };
						const last = payload.row.id === series.points.at(-1)!.row.id;
						const labelY = labelPositions.get(series.id) ?? cy;
						if (columns) {
							const width = Math.max(1, Math.min(20, (size.width - 90) / Math.max(1, modelIds.length) * 0.65 / efforts.length - 1));
							return <DashboardColumn cx={cx} cy={cy} width={width} label={`${payload.row.sourceName}: ${number(payload.y)}`} onFocus={() => setHovered(series.id)} onBlur={() => setHovered(null)} colour={dashboardColour(payload.row)} opacity={(activeModel && activeModel !== series.id ? 0.15 : 1) * (0.4 + 0.6 * (efforts.indexOf(payload.row.effort) + 1) / efforts.length)} />;
						}
						return <g opacity={activeModel && activeModel !== series.id ? 0.15 : 1}><circle tabIndex={0} role="img" aria-label={`${payload.row.sourceName}: ${number(payload.y)}${xValue ? `; ${xLabel}: ${new Intl.NumberFormat(locale, { maximumSignificantDigits: 12 }).format(payload.x)}` : ""}`} onFocus={() => setHovered(series.id)} onBlur={() => setHovered(null)} className="focus-visible:outline-2 focus-visible:outline-ring" cx={cx} cy={cy} r={activeModel === series.id ? 5 : 3.5} fill={dashboardColour(payload.row)} stroke="var(--background)" strokeWidth={1.5}><title>{payload.row.sourceName}: {number(payload.y)}</title></circle>{directLabels && last ? <g><path aria-hidden="true" d={`M${cx + 6},${cy} L${size.width - 178},${labelY}`} stroke={dashboardColour(payload.row)} strokeWidth={0.7} opacity={0.3} fill="none" /><foreignObject x={size.width - 174} y={labelY - 12} width={174} height={24}><button type="button" aria-pressed={hovered === series.id} onClick={() => setHovered(hovered === series.id ? null : series.id)} onFocus={() => setHovered(series.id)} onBlur={() => setHovered(null)} className="flex h-6 w-full items-center gap-1.5 rounded px-1 text-left text-xs font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring" style={{ color: dashboardColour(payload.row) }}><Logo id={payload.row.creatorId} alt="" width={15} height={15} className="shrink-0 object-contain" /><span className="truncate">{payload.row.modelName}</span></button></foreignObject></g> : null}</g>;
					}} />)}
					{xValue && frontier ? <Scatter name={tx("Catalogue.benchmarks.explorer.pareto")} data={paretoPoints(points)} shape={() => <g />} line={{ stroke: "var(--foreground)", strokeDasharray: "5 4", strokeWidth: 1.5 }} lineType="joint" isAnimationActive={false} /> : null}
				</ComposedChart>
			</ResponsiveContainer>
		</div>}
		{points.length && !directLabels && series.length <= 14 ? <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">{series.map((series) => <span key={series.id} className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: dashboardColour(series.points[0].row) }} />{series.points[0].row.modelName}</span>)}</div> : null}
	</section>;
}
