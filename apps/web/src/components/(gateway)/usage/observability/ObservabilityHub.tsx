"use client";

import React from "react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	Area,
	AreaChart,
	Line,
	LineChart,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import {
	Blocks,
	ChevronDown,
	ChevronUp,
	Database,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	ChartContainer,
	ChartTooltipContent,
	type ChartConfig,
} from "@/components/ui/chart";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { GuardrailEnforcementMetricsResult } from "@/lib/gateway/usage/guardrailEnforcementMetrics";
import type { UsageRangePreset } from "@/lib/gateway/usage/timeRange";
import UsageLogsToolbar from "@/components/(gateway)/usage/UsageLogsToolbar";
import type {
	ObservabilityBreakdownItem,
	ObservabilityData,
	ObservabilityExploreRow,
	ObservabilityKpi,
	ObservabilityRankedItem,
	ObservabilitySeriesPoint,
	ObservabilityTab,
} from "./types";

const CHART_COLORS = ["#2563eb", "#059669", "#d97706", "#7c3aed", "#dc2626"];

function formatNumber(value: number): string {
	return new Intl.NumberFormat("en", {
		notation: value >= 100000 ? "compact" : "standard",
		maximumFractionDigits: value >= 100000 ? 1 : 0,
	}).format(value);
}

function formatCurrency(value: number): string {
	return new Intl.NumberFormat("en", {
		style: "currency",
		currency: "USD",
		maximumFractionDigits: value >= 100 ? 0 : 2,
	}).format(value);
}

function formatPercent(value: number): string {
	return `${(value * 100).toFixed(1)}%`;
}

function formatKpiValue(kpi: ObservabilityKpi, value = kpi.value): string {
	if (kpi.format === "currency") return formatCurrency(value);
	if (kpi.format === "percent") return formatPercent(value);
	return formatNumber(value);
}

function formatDelta(value: number | null): string {
	if (value === null) return "No previous data";
	return `${Math.abs(value).toFixed(1)}% vs previous`;
}

function Sparkline({
	data,
	height = 42,
	formatValue = formatNumber,
	onHoverPoint,
}: {
	data: ObservabilitySeriesPoint[];
	height?: number;
	formatValue?: (value: number) => string;
	onHoverPoint?: (point: ObservabilitySeriesPoint | null) => void;
}) {
	const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);
	const width = 92;
	const values = data.map((point) => point.value);
	const min = Math.min(...values, 0);
	const max = Math.max(...values, 1);
	const range = max - min || 1;
	const coordinates = data.map((point, index) => {
		const x = data.length <= 1 ? width : (index / (data.length - 1)) * width;
		const y = height - ((point.value - min) / range) * (height - 6) - 3;
		return { point, x, y };
	});
	const points = coordinates
		.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`)
		.join(" ");
	const latest = data[data.length - 1];
	const hovered =
		hoveredIndex === null ? null : coordinates[hoveredIndex] ?? null;
	const titlePoint = hovered?.point ?? latest;
	const handlePointerMove = React.useCallback(
		(event: React.PointerEvent<SVGSVGElement>) => {
			if (data.length === 0) return;
			const rect = event.currentTarget.getBoundingClientRect();
			const relativeX =
				rect.width > 0
					? ((event.clientX - rect.left) / rect.width) * width
					: width;
			const index =
				data.length <= 1
					? 0
					: Math.max(
							0,
							Math.min(
								data.length - 1,
								Math.round((relativeX / width) * (data.length - 1)),
							),
						);
			setHoveredIndex(index);
			onHoverPoint?.(data[index] ?? null);
		},
		[data, onHoverPoint],
	);
	const handlePointerLeave = React.useCallback(() => {
		setHoveredIndex(null);
		onHoverPoint?.(null);
	}, [onHoverPoint]);

	if (data.length === 0) {
		return (
			<svg
				viewBox={`0 0 ${width} ${height}`}
				role="img"
				aria-label="No trend data"
				className="h-full min-h-[34px] w-full min-w-[72px] overflow-visible text-blue-500"
			/>
		);
	}

	return (
		<svg
			viewBox={`0 0 ${width} ${height}`}
			role="img"
			aria-label={
				titlePoint
					? `${titlePoint.label}: ${formatValue(titlePoint.value)}`
					: "No trend data"
			}
			className="h-full min-h-[34px] w-full min-w-[72px] cursor-crosshair overflow-visible text-blue-500"
			onPointerMove={handlePointerMove}
			onPointerLeave={handlePointerLeave}
		>
			<title>
				{titlePoint
					? `${titlePoint.label}: ${formatValue(titlePoint.value)}`
					: "No trend data"}
			</title>
			<polyline
				points={points}
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			{hovered ? (
				<>
					<line
						x1={hovered.x}
						x2={hovered.x}
						y1={3}
						y2={height - 3}
						stroke="currentColor"
						strokeDasharray="2 3"
						strokeOpacity={0.32}
					/>
					<circle
						cx={hovered.x}
						cy={hovered.y}
						r={3.2}
						fill="hsl(var(--background))"
						stroke="currentColor"
						strokeWidth={2}
					/>
				</>
			) : null}
			<rect width={width} height={height} fill="transparent" />
		</svg>
	);
}

function KpiCard({ kpi }: { kpi: ObservabilityKpi }) {
	const [hoveredPoint, setHoveredPoint] =
		React.useState<ObservabilitySeriesPoint | null>(null);
	const positive = (kpi.deltaPercent ?? 0) >= 0;
	const DeltaIcon = positive ? ChevronUp : ChevronDown;
	const displayValue = hoveredPoint?.value ?? kpi.value;
	return (
		<Card className="overflow-hidden rounded-lg">
			<CardContent className="grid min-h-[104px] grid-cols-[1fr_92px] items-center gap-4 p-4">
				<div className="min-w-0">
					<CardTitle className="text-xs font-medium text-muted-foreground">
						{kpi.label}
					</CardTitle>
					<div className="mt-1 text-2xl font-semibold tracking-tight">
						{formatKpiValue(kpi, displayValue)}
					</div>
					<div
						className={cn(
							"mt-2 inline-flex items-center gap-1 text-xs font-medium",
							hoveredPoint
								? "text-muted-foreground"
								: positive
									? "text-emerald-600"
									: "text-rose-600",
						)}
					>
						{hoveredPoint ? null : kpi.deltaPercent !== null ? (
							<DeltaIcon className="h-3 w-3" />
						) : null}
						<span>{hoveredPoint?.label ?? formatDelta(kpi.deltaPercent)}</span>
					</div>
				</div>
				<div className="min-w-0">
					<Sparkline
						data={kpi.sparkline}
						height={38}
						formatValue={(value) => formatKpiValue(kpi, value)}
						onHoverPoint={setHoveredPoint}
					/>
				</div>
			</CardContent>
		</Card>
	);
}

function ChartCard({
	title,
	subtitle,
	children,
}: {
	title: string;
	subtitle?: string;
	children: React.ReactNode;
}) {
	return (
		<Card className="rounded-lg">
			<CardHeader className="pb-2">
				<CardTitle className="text-base">{title}</CardTitle>
				{subtitle ? (
					<p className="text-sm text-muted-foreground">{subtitle}</p>
				) : null}
			</CardHeader>
			<CardContent>
				{children}
			</CardContent>
		</Card>
	);
}

function BarBreakdownChart({
	data,
	label,
	height = 300,
}: {
	data: ObservabilityBreakdownItem[];
	label: string;
	height?: number;
}) {
	const chartConfig = {
		value: { label, color: CHART_COLORS[0] },
	} satisfies ChartConfig;
	return (
		<ChartContainer
			config={chartConfig}
			className="w-full min-w-0"
			style={{ height, minHeight: height }}
		>
			<BarChart data={data} margin={{ top: 12, right: 12, bottom: 48, left: 0 }}>
				<CartesianGrid vertical={false} />
				<XAxis
					dataKey="label"
					angle={-28}
					textAnchor="end"
					interval={0}
					height={64}
					tickLine={false}
					axisLine={false}
				/>
				<YAxis tickLine={false} axisLine={false} width={44} />
				<Tooltip content={<ChartTooltipContent />} />
				<Bar
					dataKey="value"
					fill="var(--color-value)"
					radius={[4, 4, 0, 0]}
					isAnimationActive={false}
				/>
			</BarChart>
		</ChartContainer>
	);
}

function DonutBreakdownChart({
	data,
	height = 300,
}: {
	data: ObservabilityBreakdownItem[];
	height?: number;
}) {
	return <BarBreakdownChart data={data} label="value" height={height} />;
}

function UsageTypeAreaChart({
	data,
	height = 300,
}: {
	data: ObservabilityBreakdownItem[];
	height?: number;
}) {
	const chartConfig = Object.fromEntries(
		data.map((item, index) => [
			item.id,
			{ label: item.label, color: CHART_COLORS[index % CHART_COLORS.length] },
		]),
	) satisfies ChartConfig;
	return (
		<div className="space-y-3">
			<ChartContainer
				config={chartConfig}
				className="w-full min-w-0"
				style={{ height, minHeight: height }}
			>
				<AreaChart data={data} margin={{ top: 12, right: 12, bottom: 8, left: 0 }}>
					<CartesianGrid vertical={false} />
					<XAxis dataKey="label" tickLine={false} axisLine={false} />
					<YAxis tickLine={false} axisLine={false} width={44} />
					<Tooltip content={<ChartTooltipContent />} />
					<Area
						type="monotone"
						dataKey="value"
						stroke={CHART_COLORS[0]}
						fill={CHART_COLORS[0]}
						fillOpacity={0.16}
						strokeWidth={2}
						isAnimationActive={false}
					/>
				</AreaChart>
			</ChartContainer>
			<div className="grid gap-2 sm:grid-cols-2">
				{data.map((item, index) => (
					<div key={item.id} className="flex items-center justify-between gap-3">
						<div className="flex min-w-0 items-center gap-2">
							<span
								className="h-2.5 w-2.5 rounded-sm"
								style={{
									backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
								}}
							/>
							<span className="truncate text-sm">{item.label}</span>
						</div>
						<span className="font-mono text-xs text-muted-foreground">
							{formatNumber(item.value)}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

function LineTrendChart({
	data,
	label,
	height = 300,
}: {
	data: Array<{ label: string; value: number }>;
	label: string;
	height?: number;
}) {
	const chartConfig = {
		value: { label, color: CHART_COLORS[0] },
	} satisfies ChartConfig;
	return (
		<ChartContainer
			config={chartConfig}
			className="w-full min-w-0"
			style={{ height, minHeight: height }}
		>
			<LineChart data={data} margin={{ top: 12, right: 12, bottom: 8, left: 0 }}>
				<CartesianGrid vertical={false} />
				<XAxis dataKey="label" tickLine={false} axisLine={false} />
				<YAxis tickLine={false} axisLine={false} width={44} />
				<Tooltip content={<ChartTooltipContent />} />
				<Line
					type="monotone"
					dataKey="value"
					stroke="var(--color-value)"
					strokeWidth={3}
					dot={false}
					isAnimationActive={false}
				/>
			</LineChart>
		</ChartContainer>
	);
}

function RankedList({
	title,
	items,
}: {
	title: string;
	items: ObservabilityRankedItem[];
}) {
	return (
		<Card className="rounded-lg">
			<CardHeader>
				<CardTitle className="text-base">{title}</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{items.length === 0 ? (
					<p className="text-sm text-muted-foreground">No usage in this period.</p>
				) : null}
				{items.map((item) => (
					<RankedListItem key={item.id} item={item} />
				))}
			</CardContent>
		</Card>
	);
}

function RankedListItem({ item }: { item: ObservabilityRankedItem }) {
	const [hoveredPoint, setHoveredPoint] =
		React.useState<ObservabilitySeriesPoint | null>(null);
	const positive = (item.deltaPercent ?? 0) >= 0;
	const DeltaIcon = positive ? ChevronUp : ChevronDown;
	return (
		<div className="grid grid-cols-[1fr_120px] gap-3">
			<div className="min-w-0">
				<div className="truncate text-sm font-medium">{item.label}</div>
				<div className="text-xs text-muted-foreground">
					{item.subtitle ?? `${item.requests} requests`}
				</div>
				<Sparkline
					data={item.sparkline}
					height={34}
					onHoverPoint={setHoveredPoint}
				/>
			</div>
			<div className="text-right">
				<div className="font-mono text-sm">
					{formatNumber(hoveredPoint?.value ?? item.tokens)}
				</div>
				<div className="text-xs text-muted-foreground">
					{hoveredPoint?.label ?? "tokens"}
				</div>
				<div
					className={cn(
						"inline-flex items-center justify-end gap-1 text-xs font-medium",
						hoveredPoint
							? "text-muted-foreground"
							: positive
								? "text-emerald-600"
								: "text-rose-600",
					)}
				>
					{hoveredPoint ? null : item.deltaPercent !== null ? (
						<DeltaIcon className="h-3 w-3" />
					) : null}
					<span className={hoveredPoint ? "invisible" : undefined}>
						{formatDelta(item.deltaPercent)}
					</span>
				</div>
			</div>
		</div>
	);
}

function Overview({ data }: { data: ObservabilityData }) {
	return (
		<div className="space-y-6">
			<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
				{data.kpis.map((kpi) => (
					<KpiCard key={kpi.id} kpi={kpi} />
				))}
			</div>
			<div className="grid gap-4 xl:grid-cols-2">
				<RankedList title="Top API keys by tokens" items={data.topApiKeys} />
				<RankedList title="Top apps by tokens" items={data.topApps} />
			</div>
			<div className="grid gap-4 xl:grid-cols-2">
				<ChartCard
					title="Usage by model"
					subtitle="Spend in USD for the selected period."
				>
					<BarBreakdownChart data={data.charts.usageByModelCost} label="$" />
				</ChartCard>
				<ChartCard
					title="Usage type"
					subtitle="AI Stats Credits versus BYOK spend."
				>
					<UsageTypeAreaChart data={data.charts.usageTypeCost} />
				</ChartCard>
				<ChartCard title="Request volume by model">
					<BarBreakdownChart
						data={data.charts.requestVolumeByModel}
						label="requests"
					/>
				</ChartCard>
				<ChartCard
					title="Token split"
					subtitle="Input, output, and reasoning tokens."
				>
					<BarBreakdownChart data={data.charts.tokenSplit} label="tokens" />
				</ChartCard>
				<ChartCard title="Cached and uncached tokens">
					<BarBreakdownChart data={data.charts.cacheSplit} label="tokens" />
				</ChartCard>
			</div>
		</div>
	);
}

function Trends({ data }: { data: ObservabilityData }) {
	return (
		<div className="space-y-6">
			<ChartCard
				title="Spend over time"
				subtitle={data.periodLabel}
			>
				<LineTrendChart data={data.charts.spendOverTime} label="$" />
			</ChartCard>
			<div className="grid gap-4 xl:grid-cols-3">
				<RankedList title="Models" items={data.trendingModels} />
				<RankedList title="API keys" items={data.trendingKeys} />
				<RankedList title="Apps" items={data.trendingApps} />
			</div>
		</div>
	);
}

function aggregateExploreRows(
	rows: ObservabilityExploreRow[],
	dimension: keyof Pick<ObservabilityExploreRow, "model" | "apiKey" | "app" | "provider">,
	metric: keyof Pick<ObservabilityExploreRow, "requests" | "tokens" | "cost" | "errors">,
) {
	const totals = new Map<string, number>();
	for (const row of rows) {
		totals.set(row[dimension], (totals.get(row[dimension]) ?? 0) + Number(row[metric]));
	}
	return Array.from(totals.entries())
		.map(([id, value]) => ({ id, label: id, value }))
		.sort((a, b) => b.value - a.value)
		.slice(0, 12);
}

function Explore({ data, requestsTable }: { data: ObservabilityData; requestsTable: React.ReactNode }) {
	const [dimension, setDimension] =
		React.useState<"model" | "apiKey" | "app" | "provider">("model");
	const [metric, setMetric] =
		React.useState<"tokens" | "requests" | "cost" | "errors">("tokens");
	const chartData = aggregateExploreRows(data.exploreRows, dimension, metric);
	return (
		<div className="space-y-6">
			<Card className="rounded-lg">
				<CardHeader className="gap-3 lg:flex-row lg:items-center lg:justify-between">
					<div>
						<CardTitle className="text-base">Explore usage</CardTitle>
						<p className="text-sm text-muted-foreground">
							Build a quick view by changing dimension and metric.
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<select
							value={dimension}
							onChange={(event) => setDimension(event.target.value as typeof dimension)}
							className="h-9 rounded-md border bg-background px-3 text-sm"
						>
							<option value="model">Model</option>
							<option value="apiKey">API key</option>
							<option value="app">App</option>
							<option value="provider">Provider</option>
						</select>
						<select
							value={metric}
							onChange={(event) => setMetric(event.target.value as typeof metric)}
							className="h-9 rounded-md border bg-background px-3 text-sm"
						>
							<option value="tokens">Tokens</option>
							<option value="requests">Requests</option>
							<option value="cost">Cost</option>
							<option value="errors">Errors</option>
						</select>
					</div>
				</CardHeader>
				<CardContent>
					<BarBreakdownChart data={chartData} label={metric} height={360} />
				</CardContent>
			</Card>
			<Card className="rounded-lg">
				<CardHeader>
					<CardTitle className="text-base">Explore table</CardTitle>
				</CardHeader>
				<CardContent className="overflow-x-auto">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Bucket</TableHead>
								<TableHead>Model</TableHead>
								<TableHead>API key</TableHead>
								<TableHead>App</TableHead>
								<TableHead>Provider</TableHead>
								<TableHead className="text-right">Requests</TableHead>
								<TableHead className="text-right">Tokens</TableHead>
								<TableHead className="text-right">Cost</TableHead>
								<TableHead className="text-right">Errors</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{data.exploreRows.slice(0, 80).map((row, index) => (
								<TableRow key={`${row.bucket}-${row.model}-${row.apiKey}-${index}`}>
									<TableCell>{row.bucket}</TableCell>
									<TableCell className="max-w-[220px] truncate">{row.model}</TableCell>
									<TableCell className="max-w-[180px] truncate">{row.apiKey}</TableCell>
									<TableCell className="max-w-[180px] truncate">{row.app}</TableCell>
									<TableCell>{row.provider}</TableCell>
									<TableCell className="text-right font-mono">
										{formatNumber(row.requests)}
									</TableCell>
									<TableCell className="text-right font-mono">
										{formatNumber(row.tokens)}
									</TableCell>
									<TableCell className="text-right font-mono">
										{formatCurrency(row.cost)}
									</TableCell>
									<TableCell className="text-right font-mono">{row.errors}</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
			<div>{requestsTable}</div>
		</div>
	);
}

function Guardrails({
	metrics,
}: {
	metrics: GuardrailEnforcementMetricsResult;
}) {
	const breakdown = [
		{ id: "blocked", label: "Blocked", value: metrics.totals.blocked },
		{ id: "redacted", label: "Redacted", value: metrics.totals.redacted },
		{ id: "flagged", label: "Flagged", value: metrics.totals.flagged },
	];
	const timeline = metrics.buckets.map((bucket) => ({
		id: bucket.bucket,
		label: bucket.label,
		value: bucket.total,
	}));
	return (
		<div className="space-y-6">
			<div className="grid gap-3 md:grid-cols-3">
				{breakdown.map((item) => (
					<Card key={item.id} className="rounded-lg">
						<CardHeader className="pb-2">
							<CardTitle className="text-sm text-muted-foreground">
								{item.label} requests
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-semibold">{formatNumber(item.value)}</div>
						</CardContent>
					</Card>
				))}
			</div>
			<div className="grid gap-4 xl:grid-cols-2">
				<ChartCard
					title="Guardrail breakdown"
				>
					<DonutBreakdownChart data={breakdown} />
				</ChartCard>
				<ChartCard
					title="Guardrail events over time"
				>
					<BarBreakdownChart data={timeline} label="events" />
				</ChartCard>
			</div>
			<Card className="rounded-lg">
				<CardHeader>
					<CardTitle className="text-base">Top guardrails</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					{metrics.topGuardrails.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							No guardrail events in this period.
						</p>
					) : null}
					{metrics.topGuardrails.map((guardrail) => (
						<div
							key={guardrail.id}
							className="flex items-center justify-between rounded-md border px-3 py-2"
						>
							<code className="text-xs">{guardrail.id}</code>
							<Badge variant="outline">{guardrail.count}</Badge>
						</div>
					))}
				</CardContent>
			</Card>
		</div>
	);
}

export default function ObservabilityHub({
	data,
	guardrailMetrics,
	initialTab,
	preset,
	customFrom,
	customTo,
	requestsTable,
}: {
	data: ObservabilityData;
	guardrailMetrics: GuardrailEnforcementMetricsResult;
	initialTab: ObservabilityTab;
	preset: UsageRangePreset;
	customFrom?: string | null;
	customTo?: string | null;
	requestsTable: React.ReactNode;
}) {
	return (
		<div className="space-y-6">
			<div className="rounded-lg border bg-card">
				<div className="border-b bg-muted/20 px-5 py-5">
					<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
						<div className="space-y-2">
							<div className="flex items-center gap-2">
								<div className="rounded-lg border bg-background p-2">
									<Database className="h-4 w-4 text-blue-600 dark:text-blue-400" />
								</div>
						</div>
						<div>
							<h1 className="text-2xl font-semibold tracking-tight">
								Observability
								</h1>
								<p className="mt-1 max-w-3xl text-sm text-muted-foreground">
									Request analytics, trends, guardrail outcomes, logs, and alerts for this workspace.
								</p>
							</div>
						</div>
						<div className="flex justify-end">
							<UsageLogsToolbar
								view="logs"
								preset={preset}
								customFrom={customFrom}
								customTo={customTo}
							/>
						</div>
					</div>
				</div>
			</div>

			{initialTab === "overview" ? <Overview data={data} /> : null}
			{initialTab === "trends" ? <Trends data={data} /> : null}
			{initialTab === "explore" ? (
				<Explore data={data} requestsTable={requestsTable} />
			) : null}
			{initialTab === "guardrails" ? (
				<Guardrails metrics={guardrailMetrics} />
			) : null}

			<div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">
				<Blocks className="h-4 w-4" />
				<span>
					Logs and Alerts are route-backed observability views and remain available from the tabs above.
				</span>
			</div>
		</div>
	);
}
