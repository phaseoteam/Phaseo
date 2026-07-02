"use client";

import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import type { MarketShareTimeseriesData } from "@/lib/fetchers/rankings/getRankingsData";
import { EmptyChartPreview } from "@/components/(rankings)/EmptyChartPreview";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import {
	assignOrderedSeriesColours,
	keyForSeries,
} from "@/components/(rankings)/chart-colors";

type MarketShareStackedBarProps = {
	data: MarketShareTimeseriesData[];
	dimension: "organization" | "provider";
	metric?: "requests" | "tokens";
	normalizeToPercent?: boolean;
};

type SeriesStyle = Record<string, { label: string; color: string; stroke: string }>;
const TOP_SERIES = 10;

function formatBucketLabel(value: string) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	});
}

function formatNumber(value: number) {
	if (!Number.isFinite(value)) return "--";
	if (value >= 1e9) return `${(value / 1e9).toFixed(1).replace(/\.0$/, "")}B`;
	if (value >= 1e6) return `${(value / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
	if (value >= 1e3) return `${(value / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
	return value.toLocaleString();
}

function formatPercent(value: number) {
	if (!Number.isFinite(value)) return "--";
	if (value === 0) return "0%";
	if (value < 1) return "<1%";
	return `${Math.round(value)}%`;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function startOfWeek(date: Date) {
	const d = new Date(date);
	d.setHours(0, 0, 0, 0);
	const day = (d.getDay() + 6) % 7;
	d.setDate(d.getDate() - day);
	return d;
}

export function MarketShareStackedBar({
	data,
	dimension,
	metric = "requests",
	normalizeToPercent = false,
}: MarketShareStackedBarProps) {
	const [hoveredKey, setHoveredKey] = useState<string | null>(null);
	const [nowMs] = useState(() => Date.now());

	if (!data.length) {
		return (
			<EmptyChartPreview
				title={`No ${dimension} market share data yet`}
				description="Market share appears once usage is recorded for this period."
				heightClassName="h-[360px]"
			/>
		);
	}

	const totalsByGroup = new Map<string, number>();
	const bucketMap = new Map<number, Record<string, number> & { bucket: string; bucketTs: number }>();
	const bucketTotals = new Map<number, number>();

	for (const row of data) {
		const bucketTs = new Date(row.bucket).getTime();
		if (!Number.isFinite(bucketTs)) continue;
		const key = row.name || "Unknown";
		if (key.trim().toLowerCase() === "unknown") continue;
		const value =
			metric === "tokens"
				? Number(row.tokens ?? 0)
				: Number(row.requests ?? 0);

		if (!Number.isFinite(value)) continue;

		const entry =
			bucketMap.get(bucketTs) ??
			({
				bucket: formatBucketLabel(row.bucket),
				bucketTs,
			} as Record<string, number> & { bucket: string; bucketTs: number });

		entry[key] = (entry[key] ?? 0) + value;
		bucketMap.set(bucketTs, entry);
		bucketTotals.set(bucketTs, (bucketTotals.get(bucketTs) ?? 0) + value);
		totalsByGroup.set(key, (totalsByGroup.get(key) ?? 0) + value);
	}

	const sortedGroups = Array.from(totalsByGroup.entries())
		.sort((a, b) => b[1] - a[1])
		.map(([name]) => name);

	if (!sortedGroups.length) {
		return (
			<EmptyChartPreview
				title={`No ${dimension} market share data yet`}
				description="Market share appears once usage is recorded for this period."
				heightClassName="h-[360px]"
			/>
		);
	}

	const existingBucketTs = Array.from(bucketMap.keys());
	const currentWeekTs = startOfWeek(new Date(nowMs)).getTime();
	const endWeekTs =
		existingBucketTs.length > 0
			? Math.max(...existingBucketTs, currentWeekTs)
			: currentWeekTs;
	const endWeek = startOfWeek(new Date(endWeekTs));
	for (let i = 51; i >= 0; i -= 1) {
		const ts = endWeek.getTime() - i * WEEK_MS;
		if (!bucketMap.has(ts)) {
			bucketMap.set(ts, {
				bucket: formatBucketLabel(new Date(ts).toISOString()),
				bucketTs: ts,
			} as Record<string, number> & { bucket: string; bucketTs: number });
			bucketTotals.set(ts, bucketTotals.get(ts) ?? 0);
		}
	}

	const rankedGroups = sortedGroups.filter((group) => group !== "Other");
	const topGroups = rankedGroups.slice(0, TOP_SERIES);
	const overflowGroups = rankedGroups.slice(TOP_SERIES);
	const hasOther = overflowGroups.length > 0 || sortedGroups.includes("Other");
	const groupOrder = hasOther ? [...topGroups, "Other"] : topGroups;

	const keyMap = new Map<string, string>();
	topGroups.forEach((group) => {
		keyMap.set(group, keyForSeries(group));
	});
	if (hasOther) {
		keyMap.set("Other", "other");
	}

	const colourMap = assignOrderedSeriesColours(topGroups);

	const seriesStyle: SeriesStyle = {};
	topGroups.forEach((group) => {
		const key = keyMap.get(group) ?? group;
		const c = colourMap[group];
		seriesStyle[key] = {
			label: group,
			color: c?.fill ?? "hsl(210 70% 75%)",
			stroke: c?.stroke ?? c?.fill ?? "hsl(210 70% 55%)",
		};
	});
	if (hasOther) {
		seriesStyle.other = {
			label: "Other",
			color: "hsl(0 0% 70% / 0.6)",
			stroke: "hsl(0 0% 50%)",
		};
	}

	const chartData = Array.from(bucketMap.values())
		.sort((a, b) => a.bucketTs - b.bucketTs)
		.map(({ bucket, bucketTs, ...rest }) => {
			const bucketTotal = bucketTotals.get(bucketTs) ?? 0;
			const row: Record<string, number | string> = { bucket };
			topGroups.forEach((group) => {
				const key = keyMap.get(group) ?? group;
				const rawValue = Number(rest[group] ?? 0);
				row[`${key}__raw`] = rawValue;
				row[key] =
					normalizeToPercent && bucketTotal > 0
						? (rawValue / bucketTotal) * 100
						: rawValue;
			});
			if (hasOther) {
				let otherTotal = Number(rest.Other ?? 0);
				for (const group of overflowGroups) {
					otherTotal += Number(rest[group] ?? 0);
				}
				row.other =
					normalizeToPercent && bucketTotal > 0
						? (otherTotal / bucketTotal) * 100
						: otherTotal;
				row.other__raw = otherTotal;
			}
			return row;
		});

	const seriesKeys = groupOrder.map((group) => keyMap.get(group) ?? group);

	const chartConfig = {
		value: { label: "Usage", color: "hsl(var(--primary))" },
		...Object.fromEntries(
			Object.entries(seriesStyle).map(([k, v]) => [
				k,
				{ label: v.label, color: v.color },
			])
		),
	} as const;

	return (
		<ChartContainer config={chartConfig} className="h-[360px] w-full">
			<BarChart
				data={chartData}
				margin={{ top: 16, right: 12, left: 0, bottom: 32 }}
			>
				<CartesianGrid vertical={false} className="stroke-muted" />
				<XAxis
					dataKey="bucket"
					minTickGap={24}
					interval="preserveStartEnd"
					tickLine={false}
					axisLine={false}
				/>
				<YAxis
					tickFormatter={(value) =>
						normalizeToPercent
							? formatPercent(Number(value))
							: formatNumber(Number(value))
					}
					width={60}
					tickLine={false}
					axisLine={false}
					domain={normalizeToPercent ? [0, 100] : undefined}
					ticks={normalizeToPercent ? [0, 25, 50, 75, 100] : undefined}
				/>
				<ChartTooltip
					content={(props) => {
						const sortedPayload =
							props.payload
								?.filter((item) => Number(item?.value ?? 0) > 0)
								.sort(
									(a, b) => Number(b?.value ?? 0) - Number(a?.value ?? 0)
								) ?? [];
						const otherPayload = sortedPayload.find(
							(item) => String(item?.dataKey ?? "") === "other"
						);
						const hoveredPayload = hoveredKey
							? sortedPayload.find(
									(item) =>
										String(item?.dataKey ?? "") === hoveredKey &&
										hoveredKey !== "other"
								)
							: undefined;
						const topPayload = sortedPayload
							.filter((item) => String(item?.dataKey ?? "") !== "other")
							.slice(0, TOP_SERIES);
						const hoveredAlreadyVisible =
							hoveredPayload &&
							topPayload.some(
								(item) => String(item?.dataKey ?? "") === hoveredKey
							);
						const filteredPayload = [
							...topPayload,
							...(hoveredPayload && !hoveredAlreadyVisible ? [hoveredPayload] : []),
							...(otherPayload ? [otherPayload] : []),
						];
						if (!filteredPayload.length) return null;
						return (
							<div className="grid min-w-32 items-start gap-1.5 rounded-lg border border-zinc-200/50 bg-white px-2.5 py-1.5 text-xs shadow-xl dark:border-zinc-800/50 dark:bg-zinc-950">
								<ChartTooltipContent
									active={props.active}
									label={props.label}
									payload={filteredPayload}
									className="min-w-0 border-0 bg-transparent p-0 shadow-none"
									labelFormatter={(lbl) => String(lbl)}
									formatter={(v, name, item) => {
										const val = Number(v ?? 0);
										const seriesKey = String(item?.dataKey ?? name ?? "");
										const payload = (item?.payload ?? {}) as Record<string, unknown>;
										const rawValue = Number(payload[`${seriesKey}__raw`] ?? val);
										const cfg = seriesStyle[seriesKey];
										const isHovered = hoveredKey === seriesKey;
										return (
											<div
												className={`flex w-full items-center justify-between rounded-md px-1.5 py-0.5 ${
													isHovered
														? "bg-zinc-200/70 dark:bg-zinc-800/70"
														: ""
												}`}
											>
												<span className="inline-flex min-w-0 items-center gap-1.5">
													<span
														className="inline-block shrink-0 rounded-[2px]"
														style={{
															backgroundColor: cfg?.color,
															width: 4,
															height: 14,
														}}
													/>
													<span
														className={`truncate ${isHovered ? "font-medium" : ""}`}
													>
														{cfg?.label ?? String(name ?? "")}
													</span>
												</span>
												<span className="ml-auto whitespace-nowrap pl-3 text-right tabular-nums">
													{normalizeToPercent
														? `${formatPercent(val)} · ${formatNumber(rawValue)}`
														: formatNumber(val)}
												</span>
											</div>
										);
									}}
								/>
							</div>
						);
					}}
				/>
				{seriesKeys.map((key, index) => {
					const s = seriesStyle[key];
					return (
						<Bar
							key={key}
							dataKey={key}
							name={s?.label}
							stackId="share"
							fill={`var(--color-${key}, ${s?.color})`}
							fillOpacity={1}
							radius={
								index === seriesKeys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]
							}
							onMouseOver={() => {
								setHoveredKey((current) => (current === key ? current : key));
							}}
							onMouseOut={() => {
								setHoveredKey((current) => (current === key ? null : current));
							}}
							isAnimationActive={false}
						/>
					);
				})}
			</BarChart>
		</ChartContainer>
	);
}
