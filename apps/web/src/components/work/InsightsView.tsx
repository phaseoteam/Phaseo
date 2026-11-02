"use client";

import { useMemo, type ReactNode } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { formatUsd } from "@/lib/work/format";
import { closeTimeParts, countFor, createdBySourceRows, createdClosedRows, runCostUsd } from "@/lib/work/insights";
import { WORK_ITEM_SOURCES, WORK_ITEM_STATES, type WorkInsights } from "@/lib/work/types";
import { useWorkCopy } from "./WorkBits";
import { seriesTheme } from "./workChart";

export function InsightsView({ insights, days, ranges }: { insights: WorkInsights; days: number; ranges: number[] }) {
	const t = useTranslations("Work.insights");
	const copy = useWorkCopy();
	const format = useFormatter();
	const shortDay = (value: string) => format.dateTime(new Date(`${String(value).slice(0, 10)}T12:00:00Z`), { month: "short", day: "numeric", timeZone: "UTC" });
	const longDay = (value: string) => format.dateTime(new Date(`${String(value).slice(0, 10)}T12:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });

	const createdClosed = useMemo(() => createdClosedRows(insights), [insights]);
	const bySource = useMemo(() => createdBySourceRows(insights), [insights]);
	const p50 = closeTimeParts(insights.closeHoursP50);
	const p90 = closeTimeParts(insights.closeHoursP90);
	const duration = (parts: ReturnType<typeof closeTimeParts>) => (parts ? t(parts.unit === "hours" ? "hours" : "days", { value: parts.value }) : "—");

	const createdClosedConfig = {
		created: { label: t("created"), theme: seriesTheme(0) },
		closed: { label: t("closed"), theme: seriesTheme(1) },
	} satisfies ChartConfig;
	// Sources keep their slot in WORK_ITEM_SOURCES order, so a colour always means the same source.
	const sourceConfig = Object.fromEntries(bySource.sources.map((source) => [source, { label: copy.source(source), theme: seriesTheme(WORK_ITEM_SOURCES.indexOf(source)) }])) satisfies ChartConfig;

	const byState = WORK_ITEM_STATES.filter((state) => state !== "done" && state !== "cancelled").map((state) => ({ name: copy.state(state), items: countFor(insights.openByState, state, "state") }));
	const byPriority = [1, 2, 3, 4, 0].map((priority) => ({ name: copy.priority(priority), items: countFor(insights.openByPriority, priority, "priority") }));
	const openConfig = { items: { label: t("openItems"), theme: seriesTheme(0) } } satisfies ChartConfig;

	return (
		<div className="space-y-8">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="space-y-1">
					<h2 className="text-base font-semibold">{t("title")}</h2>
					<p className="text-sm text-muted-foreground">{t("description", { start: longDay(insights.from), end: longDay(insights.to) })}</p>
				</div>
				<nav aria-label={t("range")} className="flex gap-1">
					{ranges.map((range) => (
						<Link key={range} href={range === 30 ? "/work/insights" : `/work/insights?days=${range}`} aria-current={range === days ? "page" : undefined}
							className={cn("rounded-md px-2.5 py-1 text-sm transition-colors", range === days ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}>
							{t("lastDays", { count: range })}
						</Link>
					))}
				</nav>
			</div>

			<dl className="grid grid-cols-2 gap-x-8 gap-y-4 border-y py-4 sm:grid-cols-4">
				<Stat label={t("pastSla")} value={format.number(Number(insights.openPastSla ?? 0))} tone={Number(insights.openPastSla) > 0 ? "warn" : undefined} />
				<Stat label={t("stalled")} value={format.number(Number(insights.openStalled ?? 0))} />
				<Stat label={t("closeP50")} value={duration(p50)} />
				<Stat label={t("closeP90")} value={duration(p90)} />
			</dl>

			<ChartSection id="work-insights-flow" title={t("createdVsClosed")} description={t("createdVsClosedHint")}
				table={<DataTable headers={[t("day"), t("created"), t("closed")]} rows={createdClosed.map((row) => [longDay(row.day), row.created, row.closed])} />}>
				<ChartContainer config={createdClosedConfig} className="aspect-auto h-64 w-full">
					<LineChart data={createdClosed} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
						<CartesianGrid vertical={false} />
						<XAxis dataKey="day" tickLine={false} axisLine={false} minTickGap={28} tickFormatter={shortDay} />
						<YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
						<ChartTooltip content={<ChartTooltipContent indicator="line" labelFormatter={(label) => longDay(String(label))} />} />
						<ChartLegend content={<ChartLegendContent />} />
						<Line dataKey="created" type="monotone" stroke="var(--color-created)" strokeWidth={2} dot={false} isAnimationActive={false} />
						<Line dataKey="closed" type="monotone" stroke="var(--color-closed)" strokeWidth={2} dot={false} isAnimationActive={false} />
					</LineChart>
				</ChartContainer>
			</ChartSection>

			<ChartSection id="work-insights-sources" title={t("bySource")} description={t("bySourceHint")}
				table={<DataTable headers={[t("day"), ...bySource.sources.map((source) => copy.source(source))]} rows={bySource.rows.map((row) => [longDay(row.day), ...bySource.sources.map((source) => row[source] ?? 0)])} />}>
				{bySource.sources.length ? (
					<ChartContainer config={sourceConfig} className="aspect-auto h-64 w-full">
						<BarChart data={bySource.rows} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
							<CartesianGrid vertical={false} />
							<XAxis dataKey="day" tickLine={false} axisLine={false} minTickGap={28} tickFormatter={shortDay} />
							<YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
							<ChartTooltip content={<ChartTooltipContent labelFormatter={(label) => longDay(String(label))} />} />
							<ChartLegend content={<ChartLegendContent />} />
							{bySource.sources.map((source, index) => (
								<Bar key={source} dataKey={source} stackId="sources" fill={`var(--color-${source})`} stroke="var(--background)" strokeWidth={1}
									radius={index === bySource.sources.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false} />
							))}
						</BarChart>
					</ChartContainer>
				) : <p className="py-8 text-center text-sm text-muted-foreground">{t("noneCreated")}</p>}
			</ChartSection>

			<div className="grid gap-8 lg:grid-cols-2">
				<ChartSection id="work-insights-state" title={t("openByState")}>
					<HorizontalBars data={byState} config={openConfig} />
				</ChartSection>
				<ChartSection id="work-insights-priority" title={t("openByPriority")}>
					<HorizontalBars data={byPriority} config={openConfig} />
				</ChartSection>
			</div>

			<section aria-labelledby="work-insights-runs" className="space-y-2">
				<h3 id="work-insights-runs" className="text-sm font-medium">{t("agentRuns")}</h3>
				{insights.runs?.length ? (
					<div className="overflow-x-auto rounded-md border">
						<table className="w-full text-sm">
							<thead className="border-b text-left text-xs text-muted-foreground">
								<tr>
									<th className="px-3 py-2 font-normal">{t("agent")}</th>
									<th className="px-3 py-2 text-right font-normal">{t("runs")}</th>
									<th className="px-3 py-2 text-right font-normal">{t("succeeded")}</th>
									<th className="px-3 py-2 text-right font-normal">{t("successRate")}</th>
									<th className="px-3 py-2 text-right font-normal">{t("cost")}</th>
									<th className="px-3 py-2 text-right font-normal">{t("costPerRun")}</th>
								</tr>
							</thead>
							<tbody className="divide-y">
								{insights.runs.map((run) => {
									const runs = Number(run.runs) || 0;
									const cost = runCostUsd(run);
									return (
										<tr key={run.agent}>
											<td className="px-3 py-2">{copy.agent(run.agent)}</td>
											<td className="px-3 py-2 text-right tabular-nums">{format.number(runs)}</td>
											<td className="px-3 py-2 text-right tabular-nums">{format.number(Number(run.succeeded) || 0)}</td>
											<td className="px-3 py-2 text-right tabular-nums">{runs ? format.number((Number(run.succeeded) || 0) / runs, { style: "percent", maximumFractionDigits: 0 }) : "—"}</td>
											<td className="px-3 py-2 text-right tabular-nums">{formatUsd(cost)}</td>
											<td className="px-3 py-2 text-right tabular-nums">{runs ? formatUsd(cost / runs) : "—"}</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				) : <p className="text-sm text-muted-foreground">{t("noRuns")}</p>}
			</section>
		</div>
	);
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
	return (
		<div>
			<dt className="text-xs text-muted-foreground">{label}</dt>
			<dd className={cn("text-2xl font-semibold tabular-nums", tone === "warn" && "text-amber-700 dark:text-amber-300")}>{value}</dd>
		</div>
	);
}

function ChartSection({ id, title, description, table, children }: { id: string; title: string; description?: string; table?: ReactNode; children: ReactNode }) {
	const t = useTranslations("Work.insights");
	return (
		<section aria-labelledby={id} className="space-y-2">
			<div>
				<h3 id={id} className="text-sm font-medium">{title}</h3>
				{description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
			</div>
			{children}
			{table ? (
				<details className="text-xs">
					<summary className="cursor-pointer text-muted-foreground hover:text-foreground">{t("showTable")}</summary>
					<div className="mt-2 max-h-72 overflow-auto rounded-md border">{table}</div>
				</details>
			) : null}
		</section>
	);
}

function DataTable({ headers, rows }: { headers: string[]; rows: Array<Array<string | number>> }) {
	return (
		<table className="w-full text-xs">
			<thead className="sticky top-0 border-b bg-background text-left text-muted-foreground">
				<tr>{headers.map((header, index) => <th key={header} className={cn("px-3 py-1.5 font-normal", index > 0 && "text-right")}>{header}</th>)}</tr>
			</thead>
			<tbody className="divide-y">
				{rows.map((row) => <tr key={String(row[0])}>{row.map((cell, index) => <td key={index} className={cn("px-3 py-1.5", index > 0 && "text-right tabular-nums")}>{cell}</td>)}</tr>)}
			</tbody>
		</table>
	);
}

function HorizontalBars({ data, config }: { data: Array<{ name: string; items: number }>; config: ChartConfig }) {
	return (
		<ChartContainer config={config} className="aspect-auto w-full" style={{ height: `${Math.max(120, data.length * 32 + 24)}px` }}>
			<BarChart data={data} layout="vertical" margin={{ left: 0, right: 24, top: 0, bottom: 0 }}>
				<CartesianGrid horizontal={false} />
				<XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
				<YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={96} />
				<ChartTooltip cursor={false} content={<ChartTooltipContent hideIndicator />} />
				<Bar dataKey="items" fill="var(--color-items)" radius={[0, 4, 4, 0]} barSize={16} label={{ position: "right", className: "fill-foreground text-xs" }} isAnimationActive={false} />
			</BarChart>
		</ChartContainer>
	);
}
