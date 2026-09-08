"use client";

import { useRef, useState, type ReactNode } from "react";
import {
	CartesianGrid,
	Line,
	LineChart,
	ReferenceLine,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import type {
	ModelProviderMetricPoint,
	ModelProviderTrendPoint,
} from "@/lib/fetchers/models/getModelPerformance";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	TableSortButton,
	type TableSortDirection,
} from "@/components/ui/table-sort-button";
import { formatProviderDuration } from "@/components/(data)/models/modelPerformanceFormatting";
import { ModelMetricInfo } from "./ModelMetricInfo";

export type MetricKey =
	| "throughput"
	| "outputSpeed"
	| "latency"
	| "endToEnd"
	| "generation"
	| "overhead"
	| "tpot"
	| "itl"
	| "cachedInput";

type ModelProviderTrendChartProps = {
	title: string;
	data: ModelProviderTrendPoint[];
	metric: MetricKey;
	metricInfoLabel?: string;
	metricDescription?: string;
	emptyMessage?: string;
	timeResolution?: "day" | "hour";
	maxSeries?: number;
	detailed?: boolean;
	showHeader?: boolean;
	headerAction?: ReactNode;
};

type TableSortKey = "provider" | "minimum" | "maximum" | "average";
type TableSort = {
	key: TableSortKey;
	direction: Exclude<TableSortDirection, null>;
} | null;

export function getSeriesEmphasis(
	activeSeriesKey: string | null,
	seriesKey: string,
) {
	const isActive = activeSeriesKey === seriesKey;
	return {
		isActive,
		isDimmed: activeSeriesKey != null && !isActive,
	};
}

export function isUsableMetricValue(
	metric: MetricKey,
	value: number | null | undefined,
) {
	if (value == null || !Number.isFinite(value)) return false;
	return metric === "overhead" || metric === "cachedInput" ? value >= 0 : value > 0;
}

export function calculateCachedInputAverage(
	points: ModelProviderMetricPoint[],
): number | null {
	const totals = points.reduce(
		(accumulator, point) => {
			if (
				point.cachedInputTokens == null ||
				point.effectiveInputTokens == null ||
				!Number.isFinite(point.cachedInputTokens) ||
				!Number.isFinite(point.effectiveInputTokens) ||
				point.effectiveInputTokens <= 0
			) return accumulator;
			accumulator.cached += Math.max(0, point.cachedInputTokens);
			accumulator.effective += point.effectiveInputTokens;
			return accumulator;
		},
		{ cached: 0, effective: 0 },
	);
	if (totals.effective > 0) {
		return Math.min(100, (totals.cached * 100) / totals.effective);
	}
	const percentages = points
		.map((point) => point.cachedInputPct)
		.filter(
			(value): value is number => value != null && Number.isFinite(value),
		);
	return percentages.length > 0
		? percentages.reduce((sum, value) => sum + value, 0) / percentages.length
		: null;
}

export function getHoverDateTextAnchor(
	activeIndex: number,
	pointCount: number,
): "start" | "middle" | "end" {
	if (pointCount <= 1) return "middle";
	if (activeIndex <= 0) return "start";
	if (activeIndex >= pointCount - 1) return "end";
	return "middle";
}

type MetricConfig = {
	label: string;
	description: string;
	axisLabel: string;
	valueKey:
		| "avgThroughput"
		| "avgOutputSpeed"
		| "avgLatencyMs"
		| "avgEndToEndMs"
		| "avgGenerationMs"
		| "avgPhaseoOverheadMs"
		| "avgTpotMs"
		| "avgItlMs"
		| "cachedInputPct";
	formatValue: (value: number | null) => string;
	formatAxisTick?: (value: number) => string;
};

const METRICS: Record<MetricKey, MetricConfig> = {
	throughput: {
		label: "Throughput",
		description: "Output tokens per second across the full selected-provider request, including time to first token.",
		axisLabel: "Tokens / second",
		valueKey: "avgThroughput",
		formatValue: (value) => (value != null ? `${value.toFixed(2)} t/s` : "-"),
	},
	outputSpeed: {
		label: "Output Speed",
		description: "Output tokens per second after the first token arrives, excluding time to first token.",
		axisLabel: "Tokens / second",
		valueKey: "avgOutputSpeed",
		formatValue: (value) => (value != null ? `${value.toFixed(2)} t/s` : "-"),
	},
	latency: {
		label: "Latency",
		description: "Time from the request entering Phaseo until the first content-bearing generated output reaches the gateway.",
		axisLabel: "Milliseconds",
		valueKey: "avgLatencyMs",
		formatValue: (value) => (value != null ? `${Math.round(value)} ms` : "-"),
	},
	endToEnd: {
		label: "End-to-End Latency",
		description: "Total time from the request entering Phaseo until the complete response is returned.",
		axisLabel: "Duration",
		valueKey: "avgEndToEndMs",
		formatValue: formatProviderDuration,
		formatAxisTick: (value) => formatProviderDuration(value),
	},
	generation: {
		label: "Provider Duration",
		description: "Time from sending the selected provider request until its final response completes.",
		axisLabel: "Duration",
		valueKey: "avgGenerationMs",
		formatValue: formatProviderDuration,
		formatAxisTick: (value) => formatProviderDuration(value),
	},
	overhead: {
		label: "Phaseo Overhead",
		description: "Gateway end-to-end duration minus the selected provider duration, including routing and response processing.",
		axisLabel: "Milliseconds",
		valueKey: "avgPhaseoOverheadMs",
		formatValue: (value) => (value != null ? `${Math.round(value)} ms` : "-"),
	},
	tpot: {
		label: "TPOT",
		description: "Time per output token after the first token. Lower values indicate faster token generation.",
		axisLabel: "Milliseconds",
		valueKey: "avgTpotMs",
		formatValue: (value) => (value != null ? `${value.toFixed(2)} ms` : "-"),
	},
	itl: {
		label: "ITL",
		description: "Mean observed interval between successive content-bearing provider stream frames. Providers may batch multiple tokens into one frame.",
		axisLabel: "Milliseconds",
		valueKey: "avgItlMs",
		formatValue: (value) => (value != null ? `${value.toFixed(2)} ms` : "-"),
	},
	cachedInput: {
		label: "Cached Input",
		description: "Share of input tokens served from a provider cache. Only requests where the provider reports cache usage are included.",
		axisLabel: "Cached input (%)",
		valueKey: "cachedInputPct",
		formatValue: (value) => (value != null ? `${value.toFixed(1)}%` : "-"),
		formatAxisTick: (value) => `${Math.round(value)}%`,
	},
};

const FALLBACK_PROVIDER_COLORS = [
	"var(--chart-1)",
	"var(--chart-2)",
	"var(--chart-3)",
	"var(--chart-4)",
	"var(--chart-5)",
];

function normalizeColor(value: string | null | undefined): string | null {
	if (!value || typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return `#${trimmed}`;
	return trimmed;
}

function parseTimeBucket(value: string, resolution: "day" | "hour"): Date {
	return new Date(resolution === "day" ? `${value}T00:00:00Z` : value);
}

export function formatPerformanceTimeHeading(
	value: string,
	resolution: "day" | "hour",
): string {
	const date = parseTimeBucket(value, resolution);
	if (!Number.isFinite(date.getTime())) return value;
	return date.toLocaleString("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
		...(resolution === "hour"
			? { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }
			: { timeZone: "UTC" }),
	});
}

export function formatPerformanceTimeTick(
	value: string,
	resolution: "day" | "hour",
): string {
	const date = parseTimeBucket(value, resolution);
	if (!Number.isFinite(date.getTime())) return value;
	const day = date.toLocaleDateString("en-GB", {
		day: "2-digit",
		month: "short",
		timeZone: "UTC",
	});
	if (resolution === "day") return day;
	const hour = date.toLocaleTimeString("en-GB", {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
		timeZone: "UTC",
	});
	return `${day} · ${hour}`;
}

function getPointTime(point: ModelProviderTrendPoint): string {
	return "bucket" in point ? point.bucket : point.day;
}

export function getPerformanceAxisTickIndexes(
	pointCount: number,
	resolution: "day" | "hour",
): number[] {
	if (pointCount <= 0) return [];
	if (resolution === "day" || pointCount <= 8) {
		return Array.from({ length: pointCount }, (_, index) => index);
	}
	const interval = Math.max(1, Math.ceil((pointCount - 1) / 7));
	const ticks = Array.from(
		{ length: Math.floor((pointCount - 1) / interval) + 1 },
		(_, index) => index * interval,
	);
	if (ticks[ticks.length - 1] !== pointCount - 1) ticks.push(pointCount - 1);
	return ticks;
}

function toSeriesKey(providerId: string): string {
	return providerId.replace(/[^a-zA-Z0-9]+/g, "_");
}

function getPercentile(providerId: string): number | null {
	const match = /^percentile-(\d+)$/.exec(providerId);
	if (!match) return null;
	const percentile = Number(match[1]);
	return Number.isFinite(percentile) ? percentile : null;
}

function getPercentileDescription(percentile: number): string {
	return `P${percentile} is the value at or below which ${percentile}% of recorded requests fall.`;
}

export default function ModelProviderTrendChart({
	title,
	data,
	metric,
	metricInfoLabel,
	metricDescription,
	emptyMessage,
	timeResolution = "day",
	maxSeries = 3,
	detailed = false,
	showHeader = true,
	headerAction,
}: ModelProviderTrendChartProps) {
	const isPercentileData = data.some(
		(point) => getPercentile(point.provider) != null,
	);
	const [activeTime, setActiveTime] = useState<string | null>(null);
	const activeTimeRef = useRef<string | null>(null);
	const [hoveredSeriesKey, setHoveredSeriesKey] = useState<string | null>(null);
	const [focusedSeriesKey, setFocusedSeriesKey] = useState<string | null>(null);
	const [tableSort, setTableSort] = useState<TableSort>(null);
	const activeSeriesKey = hoveredSeriesKey ?? focusedSeriesKey;
	const updateActiveTime = (time: string | null) => {
		if (activeTimeRef.current === time) return;
		activeTimeRef.current = time;
		setActiveTime(time);
	};
	const metricConfig = METRICS[metric];
	const observedData = data.filter(
		(point) =>
			point.requests > 0 &&
			isUsableMetricValue(metric, point[metricConfig.valueKey]),
	);
	const providers = Array.from(
		observedData
			.reduce((map, point) => {
				const existing = map.get(point.provider) ?? {
					provider: point.provider,
					name: point.providerName || point.provider,
					color: normalizeColor(point.providerColor),
					requests: 0,
				};
				existing.requests += point.requests;
				if (!existing.color) {
					existing.color = normalizeColor(point.providerColor);
				}
				map.set(point.provider, existing);
				return map;
			}, new Map<string, { provider: string; name: string; color: string | null; requests: number }>())
			.values(),
	)
		.sort((a, b) => b.requests - a.requests)
		.slice(0, maxSeries)
		.map((provider, index) => ({
			...provider,
			seriesKey: toSeriesKey(provider.provider),
			color:
				provider.color ??
				FALLBACK_PROVIDER_COLORS[index] ??
				FALLBACK_PROVIDER_COLORS[0],
		}));

	const providerIdSet = new Set(providers.map((provider) => provider.provider));
	const seriesColumnLabel = providers.every((provider) =>
		provider.provider.startsWith("percentile-"),
	)
		? "Percentile"
		: "Provider";
	const filtered = observedData.filter((point) =>
		providerIdSet.has(point.provider),
	);
	const sortedTimes = Array.from(
		new Set(filtered.map(getPointTime)),
	).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
	const byTime = new Map<string, Record<string, number | null>>();
	for (const time of sortedTimes) {
		byTime.set(time, {});
	}
	for (const point of filtered) {
		const row = byTime.get(getPointTime(point));
		if (!row) continue;
		const provider = providers.find(
			(providerItem) => providerItem.provider === point.provider,
		);
		if (!provider) continue;
		row[provider.seriesKey] = point[metricConfig.valueKey] ?? null;
	}
	const chartData = sortedTimes.map((time, index) => {
		const values = byTime.get(time) ?? {};
		const row: Record<string, string | number | null> = {
			time,
			index,
		};
		for (const provider of providers) {
			row[provider.seriesKey] = values[provider.seriesKey] ?? null;
		}
		return row;
	});
	const latestRow = chartData[chartData.length - 1] ?? null;
	const hoveredRow = activeTime
		? (chartData.find((row) => row.time === activeTime) ?? null)
		: null;
	const activeRow = hoveredRow ?? latestRow;
	const activeHeadingDate =
		activeRow && typeof activeRow.time === "string"
			? formatPerformanceTimeHeading(activeRow.time, timeResolution)
			: "-";
	const activeIndex =
		activeRow && typeof activeRow.index === "number" ? activeRow.index : null;
	const isHovering = hoveredRow != null;
	const providerRows = providers.map((provider) => {
				const providerPoints = filtered.filter(
					(point) => point.provider === provider.provider,
				);
				const metricValues = providerPoints
					.map((point) => point[metricConfig.valueKey])
					.filter(
						(value): value is number => value != null && Number.isFinite(value),
					);
				const average = metric === "cachedInput"
					? calculateCachedInputAverage(providerPoints)
					: metricValues.length > 0
						? metricValues.reduce((sum, value) => sum + value, 0) /
							metricValues.length
						: null;
				const minimum =
					metricValues.length > 0 ? Math.min(...metricValues) : null;
				const maximum =
					metricValues.length > 0 ? Math.max(...metricValues) : null;
				const rawHovered = activeRow?.[provider.seriesKey];
				const hoveredValue =
					typeof rawHovered === "number" && Number.isFinite(rawHovered)
						? rawHovered
						: null;
				return {
					...provider,
					average,
					minimum,
					maximum,
					hoveredValue,
				};
			});
	const sortedProviderRows = (() => {
		const defaultRows = isPercentileData
			? [...providerRows].sort(
					(left, right) =>
						(getPercentile(left.provider) ?? 0) -
						(getPercentile(right.provider) ?? 0),
				)
			: providerRows;
		if (!tableSort) return defaultRows;
		const multiplier = tableSort.direction === "asc" ? 1 : -1;
		return [...defaultRows].sort((left, right) => {
			if (tableSort.key === "provider") {
				const leftPercentile = getPercentile(left.provider);
				const rightPercentile = getPercentile(right.provider);
				if (leftPercentile != null && rightPercentile != null) {
					return (leftPercentile - rightPercentile) * multiplier;
				}
				return left.name.localeCompare(right.name) * multiplier;
			}
			const leftValue = left[tableSort.key] ?? Number.NEGATIVE_INFINITY;
			const rightValue = right[tableSort.key] ?? Number.NEGATIVE_INFINITY;
			return (leftValue - rightValue) * multiplier;
		});
	})();
	const cycleTableSort = (key: TableSortKey) => {
		setTableSort((current) => {
			if (!current || current.key !== key) return { key, direction: "desc" };
			if (current.direction === "desc") return { key, direction: "asc" };
			return null;
		});
	};
	const renderDetailedTooltip = ({
		active,
		payload,
	}: {
		active?: boolean;
		payload?: ReadonlyArray<{
			payload?: Record<string, string | number | null>;
		}>;
	}) => {
		const row = payload?.[0]?.payload;
		if (!isHovering || !active || !row || typeof row.time !== "string") {
			return null;
		}
		const tooltipRows = providers.flatMap((provider) => {
			const value = row[provider.seriesKey];
			return typeof value === "number" && Number.isFinite(value)
				? [{ provider, value }]
				: [];
		});
		if (tooltipRows.length === 0) return null;

		return (
			<div className="min-w-44 rounded-md border border-border/80 bg-popover/95 p-2 text-popover-foreground shadow-xl backdrop-blur-sm">
				<p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
					{formatPerformanceTimeHeading(row.time, timeResolution)}
				</p>
				<div className="space-y-1">
					{tooltipRows.map(({ provider, value }) => (
						<div
							key={provider.seriesKey}
							className="grid grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-2 text-xs"
						>
							<span
								className="h-4 w-[3px] justify-self-center rounded-full"
								style={{ backgroundColor: provider.color }}
							/>
							<span className="truncate font-medium">{provider.name}</span>
							<span className="pl-3 text-right font-medium tabular-nums">
								{metricConfig.formatValue(value)}
							</span>
						</div>
					))}
				</div>
			</div>
		);
	};

	if (providers.length === 0) {
		return (
			<div className="flex h-full flex-col gap-3">
				<div className="flex items-center gap-1.5">
					<p className={detailed ? "text-lg font-medium leading-none text-foreground" : "text-sm font-medium leading-none text-foreground"}>{title}</p>
					<ModelMetricInfo label={metricInfoLabel ?? metricConfig.label} description={metricDescription ?? metricConfig.description} />
				</div>
				<div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-border px-4 text-center text-xs text-muted-foreground">
					{emptyMessage ?? "This metric was not recorded for recent requests."}
				</div>
			</div>
		);
	}

	return (
		<div className={detailed ? "flex h-full min-h-0 flex-col gap-3" : "space-y-3"}>
			{showHeader ? <div className="flex items-start justify-between gap-3">
				<div className="flex items-center gap-1.5">
					<p className={detailed ? "text-lg font-medium leading-none text-foreground" : "text-sm font-medium leading-none text-foreground"}>{title}</p>
					<ModelMetricInfo label={metricInfoLabel ?? metricConfig.label} description={metricDescription ?? metricConfig.description} />
				</div>
				<div className="flex shrink-0 items-center gap-2">
					{detailed ? (
						<span className="whitespace-nowrap text-[11px] text-muted-foreground">
							{activeHeadingDate}
						</span>
					) : null}
					{headerAction}
				</div>
			</div> : null}
			{chartData.length > 0 ? (
				<div
					className={
						detailed
							? "h-[300px] w-full shrink-0 pt-1"
							: "h-[148px] w-full pt-1"
					}
				>
				<ResponsiveContainer width="100%" height="100%">
					<LineChart
						data={chartData}
						margin={detailed
							? { top: 8, right: 18, left: 24, bottom: 28 }
							: { top: 8, right: 0, left: 0, bottom: 24 }}
						onMouseMove={(state: any) => {
							const timeFromPointer =
								typeof state?.activeCoordinate?.x === "number" &&
								typeof state?.offset?.left === "number" &&
								typeof state?.offset?.width === "number" &&
								state.offset.width > 0 &&
								chartData.length > 0
									? (() => {
											const relativeX =
												state.activeCoordinate.x - state.offset.left;
											const clampedX = Math.max(
												0,
												Math.min(relativeX, state.offset.width),
											);
											const index =
												chartData.length === 1
													? 0
													: Math.round(
															(clampedX / state.offset.width) *
																(chartData.length - 1),
														);
											return String(chartData[index]?.time ?? "");
										})()
									: null;
							const timeFromLabel =
								typeof state?.activeLabel === "string"
									? state.activeLabel
									: null;
							const timeFromNumericLabel =
								typeof state?.activeLabel === "number" && chartData.length > 0
									? String(
											chartData[
												Math.max(
													0,
													Math.min(
														chartData.length - 1,
														Math.round(state.activeLabel),
													),
												)
											]?.time ?? "",
										)
									: null;
							const timeFromIndex =
								typeof state?.activeTooltipIndex === "number" &&
								state.activeTooltipIndex >= 0 &&
								state.activeTooltipIndex < chartData.length
									? String(chartData[state.activeTooltipIndex]?.time ?? "")
									: null;
							const timeFromPayload =
								typeof state?.activePayload?.[0]?.payload?.time === "string"
									? state.activePayload[0].payload.time
									: null;
							const time =
								timeFromPointer ||
								timeFromLabel ||
								timeFromNumericLabel ||
								timeFromIndex ||
								timeFromPayload ||
								null;
							updateActiveTime(time);
						}}
						onMouseLeave={() => updateActiveTime(null)}
					>
						<CartesianGrid vertical={false} stroke="transparent" />
						<XAxis
							dataKey="index"
							type="number"
							domain={chartData.length === 1 ? [-0.5, 0.5] : [0, chartData.length - 1]}
							ticks={getPerformanceAxisTickIndexes(chartData.length, timeResolution)}
							allowDataOverflow
							hide={!detailed}
							tickFormatter={(value) =>
								formatPerformanceTimeTick(
									String(chartData[Math.round(Number(value))]?.time ?? ""),
									timeResolution,
								)
							}
							tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
							tickLine={false}
							axisLine={{ stroke: "var(--border)" }}
							label={detailed ? { value: timeResolution === "hour" ? "Time (UTC)" : "Date", position: "insideBottom", offset: -18, fill: "var(--muted-foreground)", fontSize: 11 } : undefined}
						/>
						<YAxis
							hide={!detailed}
							width={70}
							tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
							tickLine={false}
							axisLine={false}
							tickFormatter={metricConfig.formatAxisTick}
							label={detailed ? { value: metricConfig.axisLabel, angle: -90, position: "insideLeft", offset: -10, fill: "var(--muted-foreground)", fontSize: 11 } : undefined}
						/>
						{detailed ? (
							<Tooltip
								content={renderDetailedTooltip}
								cursor={false}
								isAnimationActive={false}
								wrapperStyle={{ pointerEvents: "none", zIndex: 20 }}
							/>
						) : null}
						{isHovering && activeIndex != null ? (
							<ReferenceLine
								x={activeIndex}
								stroke="var(--muted-foreground)"
								strokeDasharray="3 4"
								strokeWidth={1}
								label={!detailed && activeRow && typeof activeRow.time === "string" ? {
									value: formatPerformanceTimeTick(activeRow.time, timeResolution),
									position: "bottom",
									offset: 7,
									textAnchor: getHoverDateTextAnchor(activeIndex, chartData.length),
									dx: activeIndex === 0 && chartData.length > 1 ? 2 : activeIndex === chartData.length - 1 && chartData.length > 1 ? -2 : 0,
									fill: "var(--muted-foreground)",
									fontSize: 11,
								} : undefined}
							/>
						) : null}
						{providers.map((provider) => {
							const { isActive, isDimmed } = getSeriesEmphasis(
								activeSeriesKey,
								provider.seriesKey,
							);
							return (
								<Line
									key={provider.seriesKey}
									type="monotone"
									dataKey={provider.seriesKey}
								stroke={provider.color}
									strokeWidth={isActive ? 3.5 : 2}
									strokeOpacity={isDimmed ? 0.18 : 1}
									strokeLinecap="round"
									strokeLinejoin="round"
									dot={chartData.length === 1 ? { r: 3, strokeWidth: 2, fill: provider.color, stroke: provider.color } : false}
									activeDot={{ r: 4, strokeWidth: 1, fill: provider.color, stroke: "var(--background)" }}
									connectNulls
									isAnimationActive={false}
								/>
							);
						})}
					</LineChart>
				</ResponsiveContainer>
				</div>
			) : (
				<div className="flex h-[148px] items-center justify-center rounded-md border border-dashed border-border px-4 text-center text-xs text-muted-foreground">
					No {title.toLowerCase()} samples were recorded in this period.
				</div>
			)}
			{detailed ? (
				<ScrollArea
					className="min-h-0 flex-1 rounded-md border border-border/70"
					viewportClassName="min-h-0"
					keepScrollbarMounted
				>
					<div role="table" aria-label={`${title} details`}>
						<div
							role="row"
							className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(5rem,0.35fr))] gap-3 border-b border-border/70 bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground"
						>
							<div role="columnheader">
								<TableSortButton
									className="-ml-2 w-fit"
									direction={tableSort?.key === "provider" ? tableSort.direction : null}
									onClick={() => cycleTableSort("provider")}
								>
									{seriesColumnLabel}
								</TableSortButton>
							</div>
							<div role="columnheader">
								<TableSortButton
									align="end"
									direction={tableSort?.key === "minimum" ? tableSort.direction : null}
									onClick={() => cycleTableSort("minimum")}
								>
									Min
								</TableSortButton>
							</div>
							<div role="columnheader">
								<TableSortButton
									align="end"
									direction={tableSort?.key === "maximum" ? tableSort.direction : null}
									onClick={() => cycleTableSort("maximum")}
								>
									Max
								</TableSortButton>
							</div>
							<div role="columnheader">
								<TableSortButton
									align="end"
									direction={tableSort?.key === "average" ? tableSort.direction : null}
									onClick={() => cycleTableSort("average")}
								>
									Avg
								</TableSortButton>
							</div>
						</div>
						{sortedProviderRows.map((provider) => {
						const { isActive, isDimmed } = getSeriesEmphasis(
							activeSeriesKey,
							provider.seriesKey,
						);
						return <div
							key={provider.seriesKey}
							role="row"
							className="grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(5rem,0.35fr))] gap-3 border-b border-border/50 px-3 py-2.5 text-sm outline-none last:border-b-0 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
							style={{ opacity: isDimmed ? 0.35 : 1 }}
							tabIndex={0}
							onMouseEnter={() => setHoveredSeriesKey(provider.seriesKey)}
							onMouseLeave={() => setHoveredSeriesKey(null)}
							onFocus={() => setFocusedSeriesKey(provider.seriesKey)}
							onBlur={(event) => {
								if (!event.currentTarget.contains(event.relatedTarget)) {
									setFocusedSeriesKey(null);
								}
							}}
						>
							<span role="cell" className="inline-flex min-w-0 items-center gap-2">
								<span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: provider.color }} />
								<span className={isActive ? "truncate font-semibold" : "truncate font-medium"}>{provider.name}</span>
								{getPercentile(provider.provider) != null ? (
									<ModelMetricInfo
										label={provider.name}
										description={getPercentileDescription(
											getPercentile(provider.provider)!,
										)}
									/>
								) : null}
							</span>
							<span role="cell" className="text-right tabular-nums text-muted-foreground">{metricConfig.formatValue(provider.minimum)}</span>
							<span role="cell" className="text-right tabular-nums text-muted-foreground">{metricConfig.formatValue(provider.maximum)}</span>
							<span role="cell" className="text-right font-medium tabular-nums">{metricConfig.formatValue(provider.average)}</span>
						</div>;
						})}
					</div>
				</ScrollArea>
			) : (
			<div className="space-y-1.5 pt-1">
				{providerRows.map((provider) => {
					const { isActive, isDimmed } = getSeriesEmphasis(
						activeSeriesKey,
						provider.seriesKey,
					);
					return (
						<div
							key={provider.seriesKey}
							className="flex items-center justify-between gap-3 rounded-sm text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
							style={{
								opacity: isDimmed ? 0.35 : 1,
								transform: isActive ? "translateX(2px)" : "translateX(0)",
							}}
							tabIndex={0}
							onMouseEnter={() => setHoveredSeriesKey(provider.seriesKey)}
							onMouseLeave={() => setHoveredSeriesKey(null)}
							onFocus={() => setFocusedSeriesKey(provider.seriesKey)}
							onBlur={() => setFocusedSeriesKey(null)}
						>
							<span className="inline-flex min-w-0 items-center gap-2">
								<span
									className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
									style={{ backgroundColor: provider.color }}
								/>
								<span
									className={
										isActive
											? "truncate font-medium text-foreground"
											: "truncate text-foreground"
									}
								>
									{provider.name}
								</span>
							</span>
							<span className="shrink-0 tabular-nums text-foreground">
								{isHovering ? (
									metricConfig.formatValue(provider.hoveredValue)
								) : (
									<>
										<span className="text-muted-foreground">Avg </span>
										{metricConfig.formatValue(provider.average)}
									</>
								)}
							</span>
						</div>
					);
				})}
			</div>
			)}
		</div>
	);
}
