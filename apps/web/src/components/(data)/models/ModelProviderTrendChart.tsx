"use client";

import { useMemo } from "react";
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
import type { ModelProviderDailyPoint } from "@/lib/fetchers/models/getModelPerformance";

type MetricKey = "throughput" | "latency" | "generation";

type ModelProviderTrendChartProps = {
	title: string;
	data: ModelProviderDailyPoint[];
	metric: MetricKey;
	activeDay: string | null;
	onActiveDayChange: (day: string | null) => void;
};

type MetricConfig = {
	label: string;
	valueKey: "avgThroughput" | "avgLatencyMs" | "avgGenerationMs";
	formatValue: (value: number | null) => string;
};

const METRICS: Record<MetricKey, MetricConfig> = {
	throughput: {
		label: "Throughput",
		valueKey: "avgThroughput",
		formatValue: (value) => (value != null ? `${value.toFixed(2)} t/s` : "-"),
	},
	latency: {
		label: "Latency",
		valueKey: "avgLatencyMs",
		formatValue: (value) => (value != null ? `${Math.round(value)} ms` : "-"),
	},
	generation: {
		label: "E2E Latency",
		valueKey: "avgGenerationMs",
		formatValue: (value) => (value != null ? `${Math.round(value)} ms` : "-"),
	},
};

const FALLBACK_PROVIDER_COLORS = [
	"#f59e0b",
	"#f97316",
	"#84cc16",
];

function normalizeColor(value: string | null | undefined): string | null {
	if (!value || typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return `#${trimmed}`;
	return trimmed;
}

function formatDayHeading(day: string): string {
	const date = new Date(`${day}T00:00:00Z`);
	if (!Number.isFinite(date.getTime())) return day;
	return date.toLocaleDateString("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

function toSeriesKey(providerId: string): string {
	return providerId.replace(/[^a-zA-Z0-9]+/g, "_");
}

export default function ModelProviderTrendChart({
	title,
	data,
	metric,
	activeDay,
	onActiveDayChange,
}: ModelProviderTrendChartProps) {
	const metricConfig = METRICS[metric];
	const providers = Array.from(
		data.reduce(
			(map, point) => {
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
			},
			new Map<
				string,
				{ provider: string; name: string; color: string | null; requests: number }
			>(),
		).values(),
	)
		.sort((a, b) => b.requests - a.requests)
		.slice(0, 3)
		.map((provider, index) => ({
			...provider,
			seriesKey: toSeriesKey(provider.provider),
			color: provider.color ?? FALLBACK_PROVIDER_COLORS[index] ?? FALLBACK_PROVIDER_COLORS[0],
		}));

	if (providers.length === 0) {
		return (
			<div className="flex h-full items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
				No provider trend data available.
			</div>
		);
	}

	const providerIdSet = new Set(providers.map((provider) => provider.provider));
	const filtered = data.filter((point) => providerIdSet.has(point.provider));
	const sortedDays = Array.from(new Set(filtered.map((point) => point.day))).sort(
		(a, b) => new Date(a).getTime() - new Date(b).getTime(),
	);
	const byDay = new Map<string, Record<string, number | null>>();
	for (const day of sortedDays) {
		byDay.set(day, {});
	}
	for (const point of filtered) {
		const row = byDay.get(point.day);
		if (!row) continue;
		const provider = providers.find((providerItem) => providerItem.provider === point.provider);
		if (!provider) continue;
		row[provider.seriesKey] = point[metricConfig.valueKey];
	}
	const chartData = sortedDays.map((day, index) => {
		const values = byDay.get(day) ?? {};
		const row: Record<string, string | number | null> = {
			day,
			index,
		};
		for (const provider of providers) {
			row[provider.seriesKey] = values[provider.seriesKey] ?? null;
		}
		return row;
	});
	const latestRow = chartData[chartData.length - 1] ?? null;
	const hoveredRow = activeDay
		? chartData.find((row) => row.day === activeDay) ?? null
		: null;
	const activeRow = hoveredRow ?? latestRow;
	const activeHeadingDate =
		activeRow && typeof activeRow.day === "string"
			? formatDayHeading(activeRow.day)
			: "-";
	const activeIndex =
		activeRow && typeof activeRow.index === "number" ? activeRow.index : null;
	const isHovering = activeDay != null;
	const providerRows = useMemo(
		() =>
			providers.map((provider) => {
				const metricValues = filtered
					.filter((point) => point.provider === provider.provider)
					.map((point) => point[metricConfig.valueKey])
					.filter(
						(value): value is number =>
							value != null && Number.isFinite(value),
					);
				const average =
					metricValues.length > 0
						? metricValues.reduce((sum, value) => sum + value, 0) /
							metricValues.length
						: null;
				const rawHovered = activeRow?.[provider.seriesKey];
				const hoveredValue =
					typeof rawHovered === "number" && Number.isFinite(rawHovered)
						? rawHovered
						: null;
				return {
					...provider,
					average,
					hoveredValue,
				};
			}),
		[providers, filtered, metricConfig.valueKey, activeRow],
	);

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between gap-3">
				<p className="text-lg font-medium leading-none text-foreground">{title}</p>
				<span className="text-xs text-muted-foreground">{activeHeadingDate}</span>
			</div>
				<div className="h-[170px] w-full pt-1">
					<ResponsiveContainer width="100%" height="100%">
						<LineChart
							data={chartData}
							margin={{ top: 8, right: 0, left: 0, bottom: 6 }}
							onMouseMove={(state: any) => {
								const dayFromPointer =
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
												return String(chartData[index]?.day ?? "");
											})()
										: null;
								const dayFromLabel =
									typeof state?.activeLabel === "string"
										? state.activeLabel
										: null;
								const dayFromNumericLabel =
									typeof state?.activeLabel === "number" &&
									chartData.length > 0
										? String(
												chartData[
													Math.max(
														0,
														Math.min(
															chartData.length - 1,
															Math.round(state.activeLabel),
														),
													)
												]?.day ?? "",
											)
										: null;
								const dayFromIndex =
									typeof state?.activeTooltipIndex === "number" &&
									state.activeTooltipIndex >= 0 &&
									state.activeTooltipIndex < chartData.length
										? String(chartData[state.activeTooltipIndex]?.day ?? "")
										: null;
								const dayFromPayload =
									typeof state?.activePayload?.[0]?.payload?.day === "string"
										? state.activePayload[0].payload.day
										: null;
									const day =
										dayFromPointer ||
										dayFromLabel ||
										dayFromNumericLabel ||
										dayFromIndex ||
										dayFromPayload ||
										null;
								onActiveDayChange(day);
							}}
							onMouseLeave={() => onActiveDayChange(null)}
						>
							<CartesianGrid vertical={false} stroke="transparent" />
							<XAxis
								dataKey="index"
								type="number"
								domain={[0, Math.max(chartData.length - 1, 0)]}
								allowDataOverflow
								hide
							/>
							<YAxis
								hide
							/>
						<Tooltip
							content={() => null}
							cursor={false}
						/>
							{activeIndex != null ? (
								<ReferenceLine
									x={activeIndex}
									stroke="hsl(var(--muted-foreground))"
									strokeDasharray="3 4"
									strokeWidth={1}
								/>
							) : null}
						{providers.map((provider) => (
							<Line
								key={provider.seriesKey}
								type="monotone"
								dataKey={provider.seriesKey}
								stroke={provider.color}
								strokeWidth={2}
								strokeLinecap="round"
								strokeLinejoin="round"
								dot={false}
								connectNulls
								isAnimationActive={false}
							/>
						))}
					</LineChart>
				</ResponsiveContainer>
			</div>
			<div className="space-y-1.5">
				{providerRows.map((provider) => (
					<div
						key={provider.seriesKey}
						className="flex items-center justify-between gap-3 text-xs"
					>
						<span className="inline-flex min-w-0 items-center gap-2">
							<span
								className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
								style={{ backgroundColor: provider.color }}
							/>
							<span className="truncate text-foreground">{provider.name}</span>
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
				))}
			</div>
		</div>
	);
}
