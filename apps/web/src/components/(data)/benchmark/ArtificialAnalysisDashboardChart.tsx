import { useCallback, useMemo, useRef, useState, type ReactElement, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from "react";
import { useLocale, useTranslations } from "@/i18n/react";
import { CartesianGrid, ComposedChart, ResponsiveContainer, Scatter, XAxis, YAxis, useYAxisScale, useXAxisScale, usePlotArea } from "recharts";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { ScrollArea } from "@/components/ui/scroll-area";
import { localizedBenchmarkConfiguration } from "@/i18n/benchmark-display";
import { formatDashboardCost, dashboardVisibleValueLabels, dashboardTickPrecision, dashboardLabelPositions, dashboardLinearTicks, dashboardLogTicks, dashboardModelGroups, effortOrder, paretoPoints, type DashboardRow } from "@/lib/benchmarks/artificialAnalysisDashboard";

import { DashboardInspectionCard, DashboardInspectionGuides, useDashboardInspection } from "./ArtificialAnalysisDashboardInspection";

const effortAbbreviations: Record<string, string> = { default: "D", none: "N", minimal: "Min", low: "L", medium: "M", high: "H", xhigh: "X", max: "Mx" };

export function dashboardColour(row: Pick<DashboardRow, "modelId" | "colour">) {
	const colour = /^#[\da-f]{6}$/i.test(row.colour ?? "") ? row.colour! : "#6b7280";
	const channels = [1, 3, 5].map((offset) => Number.parseInt(colour.slice(offset, offset + 2), 16));
	const hash = [...row.modelId].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 0);
	const shade = 58 + hash % 28;
	return Math.max(...channels) < 96 && Math.max(...channels) - Math.min(...channels) < 12 ? `color-mix(in srgb, var(--foreground) ${shade + 12}%, var(--background))` : `color-mix(in srgb, ${colour} ${shade + 10}%, var(--foreground))`;
}

type DashboardPoint = { x: number; y: number; row: DashboardRow };
type DashboardSeries = { id: string; points: DashboardPoint[] };
const emptyShape = () => <g />;

/** Recharts animation wrappers remount children on prop changes, even with animation disabled.
 * Keep interactive shapes in a stable SVG layer so inspecting a point never discards focus. */
function DashboardShapes({ series, columns, activeModel, configuration, onInspect, onLeave, onPin, render }: {
 series: DashboardSeries[]; columns: boolean; activeModel: string | null; configuration: string | null;
 onInspect: (id: string) => void; onLeave: () => void; onPin: (id: string) => void;
 render: (props: { cx: number; cy: number; payload: DashboardPoint }, series: DashboardSeries) => ReactElement;
}) {
 const xScale = useXAxisScale(), yScale = useYAxisScale(), plot = usePlotArea();
 const projected = series.flatMap((item) => item.points.map((point) => ({ ...point, cx: xScale?.(point.x), cy: yScale?.(point.y) })));
 if (!xScale || !yScale || !plot) return null;
 const nearest = (event: ReactPointerEvent<SVGGElement> | ReactMouseEvent<SVGGElement>) => {
 if ((event.target as Element).closest("foreignObject")) return null;
 const svg = event.currentTarget.ownerSVGElement, matrix = svg?.getScreenCTM();
 if (!svg || !matrix) return null;
 const cursor = svg.createSVGPoint(); cursor.x = event.clientX; cursor.y = event.clientY;
 const position = cursor.matrixTransform(matrix.inverse());
 let closest: DashboardPoint | null = null, distance = 14 ** 2;
 for (const point of projected) {
 if (typeof point.cx !== "number" || typeof point.cy !== "number") continue;
 const candidate = (point.cx - position.x) ** 2 + (point.cy - position.y) ** 2;
 if (candidate < distance) { closest = point; distance = candidate; }
 }
 return closest;
 };
 return <g onPointerMove={!columns ? (event) => { if ((event.target as Element).closest("foreignObject")) return; const point = nearest(event); if (point) onInspect(point.row.id); else onLeave(); } : undefined} onPointerLeave={!columns ? onLeave : undefined} onClickCapture={!columns ? (event) => { const point = nearest(event); if (point) { event.stopPropagation(); onPin(point.row.id); } } : undefined}>
 {!columns ? <rect data-export-hide x={plot.x} y={plot.y} width={plot.width} height={plot.height} fill="transparent" /> : null}
 {series.map((item) => <g key={item.id} opacity={activeModel && activeModel !== item.id ? configuration ? 0.35 : 0.15 : 1}>
 {!columns && new Set(item.points.map((point) => point.row.effort)).size === item.points.length ? <path pointerEvents="none" d={item.points.map((point, index) => `${index ? "L" : "M"}${xScale(point.x)},${yScale(point.y)}`).join(" ")} fill="none" stroke={dashboardColour(item.points[0].row)} strokeWidth={activeModel === item.id ? 2.5 : 1.75} /> : null}
 {item.points.map((point) => {
 const cx = xScale(point.x), cy = yScale(point.y);
 return typeof cx === "number" && typeof cy === "number" ? <g key={point.row.id}>{render({ cx, cy, payload: point }, item)}</g> : null;
 })}</g>)}</g>;
}

function DashboardColumn({ cx, cy, width, label, colour, opacity, onHover, onFocus, onBlur, onClick, selected, pinned, effort, formattedValue, showValue, groupSize }: { cx: number; cy: number; width: number; label: string; colour: string; opacity: number; onHover: () => void; onFocus: () => void; onBlur: () => void; onClick: () => void; selected: boolean; pinned: boolean; effort: string; formattedValue: string; showValue: boolean; groupSize: number }) {
	const scale = useYAxisScale();
 const plot = usePlotArea();
	const zero = scale?.(0);
	if (typeof zero !== "number") return null;
	return <g opacity={opacity} tabIndex={0} role="button" aria-label={label} aria-pressed={pinned} onMouseEnter={onHover} onMouseLeave={onBlur} onFocus={onFocus} onBlur={onBlur} onClick={onClick} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); const section = event.currentTarget.closest("section"); onClick(); requestAnimationFrame(() => section?.querySelector<HTMLButtonElement>('[role="status"] button')?.focus()); } }} className="cursor-pointer focus-visible:outline-2 focus-visible:outline-ring">{plot ? <rect data-export-hide x={cx - width / 2 - 1} y={plot.y} width={width + 2} height={plot.height} fill={selected ? "var(--muted)" : "transparent"} /> : null}<rect x={cx - width / 2} y={Math.min(cy, zero)} width={width} height={Math.max(1, Math.abs(zero - cy))} rx={3} fill={colour} /><text aria-hidden="true" x={cx} y={zero + 15} textAnchor="middle" fontSize={9} fill="var(--muted-foreground)">{effort}</text>{showValue ? <text data-aa-value-label aria-hidden="true" x={cx} y={cy < zero ? cy - 7 : cy > zero ? cy + 13 : cy - 7} textAnchor="middle" fontSize={groupSize > 5 ? 9 : 10} fontWeight={500} fill="var(--foreground)">{formattedValue}</text> : null}</g>;
}

function ArtificialAnalysisRangeRows({ groups, number, activeModel }: { groups: ReturnType<typeof dashboardModelGroups>; number: (value: number, compact?: boolean) => string; activeModel: string | null }) {
 const tx = useTranslations();
 const minimum = Math.min(0, ...groups.flatMap((group) => group.configurations.map((item) => item.value)));
 const maximum = Math.max(1, ...groups.flatMap((group) => group.configurations.map((item) => item.value)));
 const position = (value: number) => 3 + (value - minimum) / (maximum - minimum) * 94;
 return <div className="md:hidden">{groups.map((group) => {
 const first = group.configurations[0].row;
 const min = Math.min(...group.configurations.map((item) => item.value));
 return <details key={group.id} className="group border-b py-3" style={{ opacity: activeModel && activeModel !== first.modelId ? 0.3 : 1 }}><summary className="list-none cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-ring"><div className="flex items-center justify-between gap-3 text-xs"><span className="flex min-w-0 items-center gap-2 font-medium"><Logo id={first.creatorId} alt="" width={14} height={14} /><span className="truncate">{group.id === first.modelId ? first.modelName : first.sourceName}</span></span><span className="shrink-0 tabular-nums text-muted-foreground">{number(min, true)}{min !== group.maximum ? ` – ${number(group.maximum, true)}` : ""}<span className="ml-2 inline-block transition-transform group-open:rotate-180" aria-hidden="true">⌄</span></span></div><div className="relative mt-2 h-6" aria-hidden="true"><span className="absolute inset-x-0 top-3 h-px bg-border" />{group.configurations.map((item) => <span key={item.row.id} className="absolute top-2 size-2.5 -translate-x-1/2 rounded-full ring-2 ring-background" style={{ left: `${position(item.value)}%`, background: dashboardColour(item.row) }} />)}</div></summary><dl className="mt-2 space-y-1 rounded-md bg-muted/40 p-2">{group.configurations.map((item) => <div key={item.row.id} className="flex min-h-10 items-center justify-between gap-4 px-2 text-xs"><dt className="min-w-0">{item.row.sourceSlug ? <a href={`https://artificialanalysis.ai/models/${item.row.sourceSlug}`} target="_blank" rel="noreferrer" className="underline decoration-muted-foreground/40 underline-offset-4">{localizedBenchmarkConfiguration(item.row.effort, tx)}</a> : localizedBenchmarkConfiguration(item.row.effort, tx)}{group.configurations.filter((other) => other.row.effort === item.row.effort).length > 1 ? <span className="block text-muted-foreground">{item.row.sourceName}</span> : null}</dt><dd className="shrink-0 font-medium tabular-nums">{number(item.value)}</dd></div>)}</dl></details>;
 })}</div>;
}

export function ArtificialAnalysisDashboardChart({ title, rows, value: metricValue, xValue: horizontalValue, xLabel: horizontalLabel, xUnit: horizontalUnit, unit: metricUnit = "score", highlight, labels = true, groupModels = true, descending = false, scatterToggle = false, scatter = false, onScatter }: {
	title: string; rows: DashboardRow[]; value: (row: DashboardRow) => number | null; xValue?: (row: DashboardRow) => number | null;
	xLabel?: string; xUnit?: "usd" | "seconds" | "tokens"; unit?: "score" | "tokens" | "usd"; highlight: string | null; labels?: boolean; groupModels?: boolean; descending?: boolean; scatterToggle?: boolean; scatter?: boolean; onScatter?: (scatter: boolean) => void;
}) {
	const tx = useTranslations();
	const locale = useLocale();
	const mobile = useIsMobile();
	const [log, setLog] = useState(true);
	const [frontier, setFrontier] = useState(false);
	const regionRef = useRef<HTMLElement>(null);
 const inspection = useDashboardInspection(regionRef);
	const tokenScatter = scatterToggle && scatter;
	const xValue = useMemo(() => tokenScatter ? metricValue : horizontalValue, [tokenScatter, metricValue, horizontalValue]);
	const value = useCallback((row: DashboardRow) => tokenScatter ? row.intelligence : metricValue(row), [tokenScatter, metricValue]);
	const xLabel = tokenScatter ? title : horizontalLabel;
	const xUnit = tokenScatter ? "tokens" : horizontalUnit;
	const unit = tokenScatter ? "score" : metricUnit;
	const columns = !Boolean(xValue);
	const configuration = inspection.selection?.kind === "configuration" ? inspection.selection.id : null;
 const selectedRow = rows.find((row) => row.id === configuration);
 const comparisonRow = inspection.pinned?.kind === "configuration" && inspection.pinned.id !== configuration ? rows.find((row) => row.id === inspection.pinned?.id) : undefined;
 const hovered = inspection.selection?.kind === "model" ? inspection.selection.id : null;
 const pinned = inspection.pinned?.kind === "model" ? inspection.pinned.id : null;
 const candidate = hovered ?? selectedRow?.modelId ?? highlight;
	const activeModel = rows.some((row) => row.modelId === candidate) ? candidate : null;
	const [size, setSize] = useState({ width: 0, height: 500 });
	const { efforts, groups, modelIds, all, points, ticks, series } = useMemo(() => {
 const efforts = [...new Set(rows.map((row) => row.effort))].sort((a, b) => {
		const rank = (effort: string) => effortOrder.includes(effort) ? effortOrder.indexOf(effort) : effortOrder.length;
		return rank(a) - rank(b) || a.localeCompare(b);
	});
	const modelGroups = dashboardModelGroups(rows, value, !descending);
	const groups = groupModels ? modelGroups : modelGroups.flatMap((group) => group.configurations.map((configuration) => ({ id: configuration.row.id, configurations: [configuration], maximum: configuration.value }))).sort((a, b) => (descending ? b.maximum - a.maximum : a.maximum - b.maximum));

	const modelIds = groups.map((group) => group.id);
	const all = rows.flatMap((row) => {
		const groupIndex = modelIds.indexOf(groupModels ? row.modelId : row.id);
		const configurations = groups[groupIndex]?.configurations ?? [];
		const index = configurations.findIndex((configuration) => configuration.row.id === row.id);
		const y = value(row), x = xValue ? xValue(row) : columns ? groupIndex + ((index + 0.5) / configurations.length - 0.5) * 0.8 : efforts.indexOf(row.effort);
		return y === null || x === null || !Number.isFinite(x) || !Number.isFinite(y) ? [] : [{ x, y, row }];
	});
	const points = all.filter((point) => !xValue || !log || point.x > 0);
	const ticks = xValue && log ? dashboardLogTicks(points.map((point) => point.x)) : undefined;
	const series = [...new Set(points.map((point) => point.row.modelId))].map((id) => ({ id, points: points.filter((point) => point.row.modelId === id).sort((a, b) => a.x - b.x) }));
 return { efforts, groups, modelIds, all, points, ticks, series };
 }, [rows, value, descending, groupModels, xValue, columns, log]);
	const directLabels = labels && !columns && size.width >= 640 && series.length <= 14;
	const yTicks = dashboardLinearTicks([...points.map((point) => point.y), ...(columns ? [0] : [])]);
	const domain: [number, number] = [yTicks[0], yTicks.at(-1)!];
	const labelPositions = dashboardLabelPositions(series.map((item) => ({ id: item.id, y: 24 + (domain[1] - item.points.at(-1)!.y) / (domain[1] - domain[0]) * Math.max(1, size.height - 100) })), 24, size.height - 80);
	const number = (n: number, compact = false, precision = 3) => unit === "usd" ? formatDashboardCost(n, locale, compact, compact ? precision : 5) : new Intl.NumberFormat(locale, { ...(compact ? { ...(Math.abs(n) >= 1000 ? { notation: "compact" as const } : {}), maximumSignificantDigits: precision } : { maximumSignificantDigits: 5 }) }).format(n);
	const tickPrecision = dashboardTickPrecision(yTicks, (value, digits) => number(value, true, digits));
	const xNumber = (n: number) => xUnit === "usd" ? formatDashboardCost(n, locale, true, 3) : xUnit === "seconds" ? new Intl.NumberFormat(locale, { maximumSignificantDigits: 2, style: "unit", unit: n >= 3600 ? "hour" : n >= 60 ? "minute" : "second", unitDisplay: "narrow" }).format(n / (n >= 3600 ? 3600 : n >= 60 ? 60 : 1)) : new Intl.NumberFormat(locale, { maximumSignificantDigits: 3, ...(xUnit === "tokens" ? { notation: "compact" as const } : {}) }).format(n);
 const lower = domain[0], upper = domain[1];
 const costLabels = useMemo(() => {
 if (!columns || unit !== "usd") return null;
 return dashboardVisibleValueLabels(points.map((point) => {
 const group = groups[modelIds.indexOf(groupModels ? point.row.modelId : point.row.id)];
 const maximum = group?.configurations.find((item) => item.value === group.maximum);
 return { id: point.row.id, x: 58 + (point.x + 0.5) / Math.max(1, groups.length) * (size.width - 74), y: 24 + (upper - point.y) / (upper - lower) * Math.max(1, size.height - 146) + (point.y < 0 ? 13 : -7), label: formatDashboardCost(point.y, locale, true, 3), priority: maximum?.row.id === point.row.id };
 }), 58, size.width - 4);
 }, [columns, unit, points, groups, modelIds, groupModels, size.width, size.height, lower, upper, locale]);
	const axis = { fontSize: 11, fill: "var(--muted-foreground)" };
	return <section ref={regionRef} className="min-w-0" aria-label={title} onKeyDown={(event) => { if (event.key === "Escape") { inspection.clear(); event.stopPropagation(); } }}>
		<div className="mb-3 flex flex-wrap items-center justify-between gap-3">
			<h3 className="text-base font-semibold tracking-tight">{title}</h3>
			<div data-export-hide className="flex flex-wrap items-center gap-1">
				{scatterToggle ? <><Button size="sm" className="min-h-10 md:min-h-7" variant={!scatter ? "secondary" : "ghost"} aria-pressed={!scatter} onClick={() => onScatter?.(false)}>{tx("Catalogue.benchmarks.explorer.bars")}</Button><Button size="sm" className="min-h-10 md:min-h-7" variant={scatter ? "secondary" : "ghost"} aria-pressed={scatter} onClick={() => onScatter?.(true)}>{tx("Catalogue.benchmarks.explorer.scatter")}</Button></> : null}
				{xValue ? <><Button size="sm" className="min-h-10 md:min-h-7" variant={frontier ? "secondary" : "ghost"} aria-pressed={frontier} onClick={() => setFrontier(!frontier)}>{tx("Catalogue.benchmarks.explorer.pareto")}</Button>{[false, true].map((isLog) => <Button key={String(isLog)} size="sm" variant={log === isLog ? "secondary" : "ghost"} aria-pressed={log === isLog} onClick={() => setLog(isLog)}>{tx(`Catalogue.compare.${isLog ? "logScale" : "linearScale"}`)}</Button>)}</> : null}
			</div>
		</div>
		{!points.length ? <div className="flex min-h-72 items-center justify-center text-sm text-muted-foreground" role="status">{all.length && log ? <Button variant="outline" onClick={() => setLog(false)}>{tx("Catalogue.compare.linearScale")}</Button> : tx("Common.ui.benchmarkChartCopy.noResultsAvailableForThisMetric")}</div> : <div className="relative">{selectedRow && points.some((point) => point.row.id === selectedRow.id) && !(columns && mobile) ? <div data-export-hide className={`pointer-events-none absolute inset-0 z-30 flex flex-col ${columns ? "items-start pl-16 pt-8" : "items-end justify-end pb-16 pr-4"}`}><div className={`pointer-events-auto sticky max-w-[calc(100%-1rem)] ${columns ? "top-20" : "bottom-20"}`}><DashboardInspectionCard row={selectedRow} comparison={comparisonRow} comparisonMetric={comparisonRow ? columns ? metricValue(comparisonRow) : comparisonRow.intelligence : null} title={columns ? title : tx("Catalogue.rankings.benchmarkMetrics.intelligence")} metric={columns ? metricValue(selectedRow) : selectedRow.intelligence} unit={columns ? metricUnit : "score"} pinned={inspection.pinned?.id === selectedRow.id} keep={inspection.keep} leave={inspection.leave} close={inspection.clear} /></div></div> : null}{columns && mobile ? <ArtificialAnalysisRangeRows groups={groups} number={(value, compact) => unit === "tokens" && compact ? new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 0 }).format(value) : number(value, compact)}  activeModel={activeModel} /> : null}{!columns || !mobile ? <ScrollArea scrollBarOrientation="horizontal" className={columns ? "hidden w-full md:block" : "w-full"} viewportClassName="pb-3"><div className="h-[max(300px,calc(100svh-29rem))] md:h-[max(340px,calc(100svh-18rem))]" style={{ minWidth: columns ? Math.max(480, groups.length * 84 + 74) : undefined }} role="group" aria-label={title}>
			<ResponsiveContainer width="100%" height="100%" onResize={(width, height) => setSize({ width, height })}>
					<ComposedChart margin={{ top: 24, right: directLabels ? 184 : 16, left: 0, bottom: 32 }}>
					<CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 5" />
					<XAxis type="number" dataKey="x" scale={xValue && log ? "log" : "auto"} domain={xValue ? ticks ? [ticks[0], ticks.at(-1)!] : ["auto", "auto"] : [-0.5, Math.max(0.5, (columns ? modelIds : efforts).length - 0.5)]} ticks={xValue ? ticks : (columns ? modelIds : efforts).map((_, i) => i)} tick={columns ? (props: unknown) => {
						const { x, y, payload } = props as { x: number; y: number; payload: { value: number } };
						const group = groups[payload.value];
						if (!group) return <g />;
						const row = group.configurations[0].row;
						const width = Math.max(60, (size.width - 74) / Math.max(1, groups.length));
						return <foreignObject x={x - width / 2} y={y + 21} width={width} height={66}><div className="flex flex-col items-center gap-1 px-1 text-center"><Logo id={row.creatorId} alt="" width={17} height={17} className="object-contain" /><button type="button" aria-pressed={pinned === row.modelId} onMouseEnter={() => inspection.hover({ kind: "model", id: row.modelId })} onMouseLeave={inspection.leave} onFocus={() => inspection.inspect({ kind: "model", id: row.modelId })} onBlur={inspection.leave} onClick={() => inspection.pin({ kind: "model", id: row.modelId })} className="line-clamp-2 rounded text-[10px] font-medium leading-tight hover:underline focus-visible:outline-2 focus-visible:outline-ring">{row.modelName}</button></div></foreignObject>;
					} : axis} tickLine={false} axisLine={{ stroke: "var(--border)" }} tickFormatter={(n: number) => xValue ? xNumber(n) : columns ? rows.find((row) => row.modelId === modelIds[n])?.modelName ?? "" : localizedBenchmarkConfiguration(efforts[n], tx)} height={columns ? 90 : 30} interval={columns ? 0 : "preserveStartEnd"} label={columns ? undefined : { value: xLabel ?? tx("Common.ui.benchmarkChartCopy.modelConfiguration"), position: "bottom", offset: 12, ...axis }} />
					<YAxis type="number" dataKey="y" domain={domain} ticks={yTicks} tick={axis} width={58} tickLine={false} axisLine={false} tickFormatter={(n: number) => number(n, true, tickPrecision)} label={xValue ? { value: tx("Catalogue.rankings.benchmarkMetrics.intelligence"), position: "insideTopLeft", dy: -22, ...axis } : undefined} />
					{series.map((series) => <Scatter key={series.id} data={series.points} shape={emptyShape} activeShape={false} isAnimationActive={false} />)}
 <DashboardShapes series={series} columns={columns} activeModel={activeModel} configuration={configuration} onInspect={(id) => inspection.hover({ kind: "configuration", id })} onLeave={inspection.leave} onPin={(id) => inspection.pin({ kind: "configuration", id })} render={(props, series) => {
						const { cx, cy, payload } = props as { cx: number; cy: number; payload: typeof points[number] };
						const last = payload.row.id === series.points.at(-1)!.row.id;
						const labelY = labelPositions.get(series.id) ?? cy;
						if (columns) {
							const configurations = groups.find((group) => group.configurations.some((item) => item.row.id === payload.row.id))!.configurations;
							const index = configurations.findIndex((configuration) => configuration.row.id === payload.row.id);
							const width = Math.max(1, Math.min(32, (size.width - 74) / Math.max(1, modelIds.length) * 0.8 / configurations.length - 2));
							const abbreviation = effortAbbreviations[payload.row.effort] ?? payload.row.effort.slice(0, 3);
							return <DashboardColumn cx={cx} cy={cy} width={width} label={`${payload.row.sourceName}: ${number(payload.y)}`} onHover={() => inspection.hover({ kind: "configuration", id: payload.row.id })} onFocus={() => inspection.inspect({ kind: "configuration", id: payload.row.id })} onBlur={inspection.leave} onClick={() => inspection.pin({ kind: "configuration", id: payload.row.id })} selected={configuration === payload.row.id} pinned={inspection.pinned?.id === payload.row.id} colour={dashboardColour(payload.row)} opacity={configuration ? configuration === payload.row.id ? 1 : 0.35 : 0.4 + 0.6 * (index + 1) / configurations.length} effort={abbreviation} formattedValue={unit === "tokens" ? new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 0 }).format(payload.y) : number(payload.y, true)} showValue={labels && (costLabels ? costLabels.has(payload.row.id) : width >= 7)} groupSize={configurations.length} />;
						}
						return <g><circle tabIndex={0} role="button" aria-pressed={inspection.pinned?.id === payload.row.id} aria-label={`${payload.row.sourceName}: ${number(payload.y)}${xValue ? `; ${xLabel}: ${new Intl.NumberFormat(locale, { maximumSignificantDigits: 12 }).format(payload.x)}` : ""}`} pointerEvents="none" onFocus={() => inspection.inspect({ kind: "configuration", id: payload.row.id })} onBlur={inspection.leave} onClick={() => inspection.pin({ kind: "configuration", id: payload.row.id })} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); inspection.pin({ kind: "configuration", id: payload.row.id }); requestAnimationFrame(() => regionRef.current?.querySelector<HTMLButtonElement>('[role="status"] button')?.focus()); } }} className="focus-visible:outline-2 focus-visible:outline-ring" cx={cx} cy={cy} r={12} fillOpacity={0} fill={dashboardColour(payload.row)} stroke="transparent" strokeWidth={1.5} /><circle opacity={configuration && configuration !== payload.row.id && activeModel === series.id ? 0.4 : 1} aria-hidden="true" pointerEvents="none" cx={cx} cy={cy} r={configuration === payload.row.id ? 6 : activeModel === series.id ? 4.5 : 3.5} fill={dashboardColour(payload.row)} />{directLabels && last ? <g><path aria-hidden="true" d={`M${cx + 6},${cy} L${size.width - 178},${labelY}`} stroke={dashboardColour(payload.row)} strokeWidth={0.7} opacity={0.3} fill="none" /><foreignObject x={size.width - 174} y={labelY - 12} width={174} height={24}><button type="button" aria-pressed={pinned === series.id} onClick={() => inspection.pin({ kind: "model", id: series.id })} onMouseEnter={() => inspection.hover({ kind: "model", id: series.id })} onMouseLeave={inspection.leave} onFocus={() => inspection.inspect({ kind: "model", id: series.id })} onBlur={inspection.leave} className="flex h-6 w-full items-center gap-1.5 rounded px-1 text-left text-xs font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring" style={{ color: dashboardColour(payload.row) }}><Logo id={payload.row.creatorId} alt="" width={15} height={15} className="shrink-0 object-contain" /><span className="truncate">{payload.row.modelName}</span></button></foreignObject></g> : null}</g>;
					}} />
					<DashboardInspectionGuides point={points.find((point) => point.row.id === configuration)} columns={columns} colour={selectedRow ? dashboardColour(selectedRow) : "var(--foreground)"} number={(n) => number(n, true)} xNumber={xNumber} />{xValue && frontier ? <Scatter name={tx("Catalogue.benchmarks.explorer.pareto")} data={paretoPoints(points)} shape={() => <g />} line={{ stroke: "var(--foreground)", strokeDasharray: "5 4", strokeWidth: 1.5 }} lineType="joint" isAnimationActive={false} /> : null}
				</ComposedChart>
			</ResponsiveContainer>
		</div></ScrollArea> : null}</div>}
		{columns && points.length ? <div className="mt-2 hidden flex-wrap justify-center md:flex gap-x-4 gap-y-2 text-xs text-muted-foreground">{efforts.map((effort) => <span key={effort} className="inline-flex items-center gap-1.5"><span className="font-medium text-foreground">{effortAbbreviations[effort] ?? effort.slice(0, 3)}</span>{localizedBenchmarkConfiguration(effort, tx)}</span>)}</div> : null}
		{points.length && !columns && !directLabels && series.length <= 14 ? <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">{series.map((series) => <button type="button" key={series.id} aria-pressed={pinned === series.id} onClick={() => inspection.pin({ kind: "model", id: series.id })}  onMouseEnter={() => inspection.hover({ kind: "model", id: series.id })} onMouseLeave={inspection.leave} onFocus={() => inspection.inspect({ kind: "model", id: series.id })} onBlur={inspection.leave} className="flex min-h-8 items-center gap-2 rounded text-left hover:bg-muted" style={{ color: dashboardColour(series.points[0].row) }}><Logo id={series.points[0].row.creatorId} alt="" width={14} height={14} />{series.points[0].row.modelName}</button>)}</div> : null}
	</section>;
}
