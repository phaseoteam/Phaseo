"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CartesianGrid, ComposedChart, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { localizedBenchmarkConfiguration } from "@/i18n/benchmark-display";
import { dashboardLogTicks, effortOrder, paretoPoints, type DashboardRow } from "@/lib/benchmarks/artificialAnalysisDashboard";

export function dashboardColour(row: DashboardRow) {
	const colour = /^#[\da-f]{6}$/i.test(row.colour ?? "") ? row.colour! : "#6b7280";
	const channels = [1, 3, 5].map((offset) => Number.parseInt(colour.slice(offset, offset + 2), 16));
	return Math.max(...channels) < 96 && Math.max(...channels) - Math.min(...channels) < 12 ? "var(--foreground)" : colour;
}

export function ArtificialAnalysisDashboardChart({ title, rows, value, xValue, xLabel, xUnit, unit = "score", highlight }: {
	title: string; rows: DashboardRow[]; value: (row: DashboardRow) => number | null; xValue?: (row: DashboardRow) => number | null;
	xLabel?: string; xUnit?: "usd" | "seconds"; unit?: "score" | "tokens" | "usd"; highlight: string | null;
}) {
	const tx = useTranslations();
	const locale = useLocale();
	const [log, setLog] = useState(true);
	const [frontier, setFrontier] = useState(false);
	const efforts = [...new Set(rows.map((row) => row.effort))].sort((a, b) => {
		const rank = (effort: string) => effortOrder.includes(effort) ? effortOrder.indexOf(effort) : effortOrder.length;
		return rank(a) - rank(b) || a.localeCompare(b);
	});
	const all = rows.flatMap((row) => {
		const y = value(row), x = xValue ? xValue(row) : efforts.indexOf(row.effort);
		return y === null || x === null || !Number.isFinite(x) || !Number.isFinite(y) ? [] : [{ x, y, row }];
	});
	const points = all.filter((point) => !xValue || !log || point.x > 0);
	const ticks = xValue && log ? dashboardLogTicks(points.map((point) => point.x)) : undefined;
	const series = [...new Set(points.map((point) => point.row.modelId))].map((id) => ({ id, points: points.filter((point) => point.row.modelId === id).sort((a, b) => a.x - b.x) }));
	const number = (n: number, compact = false) => new Intl.NumberFormat(locale, { ...(unit === "usd" ? { style: "currency" as const, currency: "USD", currencyDisplay: "narrowSymbol" as const } : {}), ...(compact ? { notation: "compact" as const, maximumFractionDigits: 2 } : { maximumSignificantDigits: 12 }) }).format(n);
	const xNumber = (n: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2, ...(xUnit === "usd" ? { style: "currency" as const, currency: "USD", currencyDisplay: "narrowSymbol" as const } : xUnit === "seconds" ? { style: "unit" as const, unit: "second", unitDisplay: "narrow" as const } : {}) }).format(n);
	const axis = { fontSize: 11, fill: "var(--muted-foreground)" };
	return <section className="min-w-0 scroll-mt-32 border-b py-6" aria-label={title}>
		<div className="mb-5 flex flex-wrap items-center justify-between gap-3">
			<h3 className="text-base font-semibold tracking-tight">{title}</h3>
			{xValue ? <div className="flex flex-wrap gap-1">
				<Button size="sm" variant={frontier ? "secondary" : "ghost"} aria-pressed={frontier} onClick={() => setFrontier(!frontier)}>{tx("Catalogue.benchmarks.explorer.pareto")}</Button>
				{[false, true].map((isLog) => <Button key={String(isLog)} size="sm" variant={log === isLog ? "secondary" : "ghost"} aria-pressed={log === isLog} onClick={() => setLog(isLog)}>{tx(`Catalogue.compare.${isLog ? "logScale" : "linearScale"}`)}</Button>)}
			</div> : null}
		</div>
		{!points.length ? <div className="flex min-h-72 items-center justify-center text-sm text-muted-foreground" role="status">{all.length && log ? <Button variant="outline" onClick={() => setLog(false)}>{tx("Catalogue.compare.linearScale")}</Button> : tx("Common.ui.benchmarkChartCopy.noResultsAvailableForThisMetric")}</div> : <div className="h-80 sm:h-[420px]" role="img" aria-label={title}>
			<ResponsiveContainer width="100%" height="100%">
				<ComposedChart margin={{ top: 8, right: 16, left: 4, bottom: 32 }}>
					<CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
					<XAxis type="number" dataKey="x" scale={xValue && log ? "log" : "auto"} domain={xValue ? ticks ? [ticks[0], ticks.at(-1)!] : ["auto", "auto"] : [-0.5, Math.max(0.5, efforts.length - 0.5)]} ticks={xValue ? ticks : efforts.map((_, i) => i)} tick={axis} tickLine={false} axisLine={{ stroke: "var(--border)" }} tickFormatter={(n: number) => xValue ? xNumber(n) : localizedBenchmarkConfiguration(efforts[n], tx)} label={{ value: xLabel ?? tx("Common.ui.benchmarkChartCopy.modelConfiguration"), position: "bottom", offset: 12, ...axis }} />
					<YAxis type="number" dataKey="y" domain={["auto", "auto"]} tick={axis} width={60} tickLine={false} axisLine={false} tickFormatter={(n: number) => number(n, true)} />
					<Tooltip shared={false} cursor={{ stroke: "var(--border)" }} content={({ active, payload }) => {
						const point = payload?.[0]?.payload as typeof points[number] | undefined;
						return active && point?.row ? <div className="max-w-80 rounded-lg border bg-popover p-3 text-xs text-popover-foreground shadow-md"><p className="font-medium">{point.row.sourceName}</p><p className="mt-2 tabular-nums">{xValue ? tx("Catalogue.rankings.benchmarkMetrics.intelligence") : title}: {number(point.y)}</p>{xValue ? <p className="mt-1 tabular-nums">{xLabel}: {new Intl.NumberFormat(locale, { maximumSignificantDigits: 12 }).format(point.x)}</p> : null}</div> : null;
					}} />
					{series.map((series) => <Scatter key={series.id} name={series.points[0].row.modelName} data={series.points} fill={dashboardColour(series.points[0].row)} stroke="var(--background)" strokeWidth={1} opacity={highlight && highlight !== series.id ? 0.15 : 1} line={new Set(series.points.map((point) => point.row.effort)).size === series.points.length ? { stroke: dashboardColour(series.points[0].row), strokeWidth: highlight === series.id ? 2.5 : 1.5 } : false} lineType="joint" lineJointType="linear" isAnimationActive={false} />)}
					{xValue && frontier ? <Scatter name={tx("Catalogue.benchmarks.explorer.pareto")} data={paretoPoints(points)} shape={() => <g />} line={{ stroke: "var(--foreground)", strokeDasharray: "5 4", strokeWidth: 1.5 }} lineType="joint" isAnimationActive={false} /> : null}
				</ComposedChart>
			</ResponsiveContainer>
		</div>}
	</section>;
}
