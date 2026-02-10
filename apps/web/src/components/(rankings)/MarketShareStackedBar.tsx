"use client";

import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import type { MarketShareTimeseriesData } from "@/lib/fetchers/rankings/getRankingsData";
import { RankingsEmptyState } from "@/components/(rankings)/RankingsEmptyState";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { assignSeriesColours, keyForSeries } from "@/components/(rankings)/chart-colors";

type MarketShareStackedBarProps = {
	data: MarketShareTimeseriesData[];
	dimension: "organization" | "provider";
	metric?: "requests" | "tokens";
	normalizeToPercent?: boolean;
};

type SeriesStyle = Record<string, { label: string; color: string; stroke: string }>;
const STABLE_REFERENCE_DATE = new Date(0);

function formatBucketLabel(value: string) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	if (date.getHours() !== 0 || date.getMinutes() !== 0) {
		return date.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			hour: "numeric",
		});
	}
	return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatNumber(value: number) {
	if (!Number.isFinite(value)) return "--";
	if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
	if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
	if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
	return value.toLocaleString();
}

function formatPercent(value: number) {
	if (!Number.isFinite(value)) return "--";
	if (value === 0) return "0%";
	if (value < 1) return "<1%";
	return `${Math.round(value)}%`;
}

function normalizeColour(value?: string | null) {
	if (!value) return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return `#${trimmed}`;
	return trimmed;
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

	if (!data.length) {
		return (
			<RankingsEmptyState
				title={`No ${dimension} market share data yet`}
				description="Market share appears once usage is recorded for this period."
			/>
		);
	}

	const totalsByGroup = new Map<string, number>();
	const explicitColourMap = new Map<string, string>();
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

		const colour = normalizeColour(row.colour);
		if (colour && key !== "Other" && !explicitColourMap.has(key)) {
			explicitColourMap.set(key, colour);
		}

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
			<RankingsEmptyState
				title={`No ${dimension} market share data yet`}
				description="Market share appears once usage is recorded for this period."
			/>
		);
	}

	const existingBucketTs = Array.from(bucketMap.keys());
	const endWeekTs =
		existingBucketTs.length > 0
			? Math.max(...existingBucketTs)
			: startOfWeek(STABLE_REFERENCE_DATE).getTime();
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

	const groupOrder = sortedGroups.includes("Other")
		? [...sortedGroups.filter((group) => group !== "Other"), "Other"]
		: sortedGroups;

	const { chartData, seriesKeys, seriesStyle } = useMemo(() => {
		const keyMap = new Map<string, string>();
		groupOrder.forEach((group) => {
			if (group === "Other") {
				keyMap.set(group, "other");
			} else {
				keyMap.set(group, keyForSeries(group));
			}
		});

		const colourMap = assignSeriesColours(
			groupOrder.filter((group) => group !== "Other")
		);

		const style: SeriesStyle = {};
		groupOrder.forEach((group) => {
			const key = keyMap.get(group) ?? group;
			if (group === "Other") {
				style[key] = {
					label: "Other",
					color: "hsl(0 0% 70% / 0.6)",
					stroke: "hsl(0 0% 50%)",
				};
				return;
			}
			const explicit = explicitColourMap.get(group);
			const c = colourMap[group];
			style[key] = {
				label: group,
				color: explicit ?? c?.fill ?? "hsl(210 70% 75%)",
				stroke: explicit ?? c?.stroke ?? c?.fill ?? "hsl(210 70% 55%)",
			};
		});

		const data = Array.from(bucketMap.values())
			.sort((a, b) => a.bucketTs - b.bucketTs)
			.map(({ bucket, bucketTs, ...rest }) => {
				const bucketTotal = bucketTotals.get(bucketTs) ?? 0;
				const row: Record<string, number | string> = { bucket };
				groupOrder.forEach((group) => {
					const key = keyMap.get(group) ?? group;
					const rawValue = Number(rest[group] ?? 0);
					row[key] =
						normalizeToPercent && bucketTotal > 0
							? (rawValue / bucketTotal) * 100
							: rawValue;
				});
				return row;
			});

		const keys = groupOrder.map((group) => keyMap.get(group) ?? group);

		return { chartData: data, seriesKeys: keys, seriesStyle: style };
	}, [bucketMap, bucketTotals, explicitColourMap, groupOrder, normalizeToPercent]);

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
				onMouseLeave={() => setHoveredKey(null)}
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
						const filteredPayload =
							props.payload
								?.filter((item) => Number(item?.value ?? 0) > 0)
								.sort(
									(a, b) => Number(b?.value ?? 0) - Number(a?.value ?? 0)
								)
								.slice(0, 10) ?? [];
						if (!filteredPayload.length) return null;
						return (
							<ChartTooltipContent
								active={props.active}
								label={props.label}
								payload={filteredPayload}
								labelFormatter={(lbl) => String(lbl)}
								formatter={(v, name, item) => {
									const val = Number(v ?? 0);
									const seriesKey = String(item?.dataKey ?? name ?? "");
									const cfg = seriesStyle[seriesKey];
									const isActive = hoveredKey === seriesKey;
									return (
										<>
											<span className="inline-flex items-center gap-2">
												<span
													className="inline-block rounded-[2px]"
													style={{
														backgroundColor: cfg?.color,
														width: isActive ? 6 : 4,
														height: 14,
													}}
												/>
												<span className={isActive ? "font-medium" : ""}>
													{cfg?.label ?? String(name ?? "")}
												</span>
											</span>
											<span className="ml-auto font-mono">
												{normalizeToPercent
													? formatPercent(val)
													: formatNumber(val)}
											</span>
										</>
									);
								}}
							/>
						);
					}}
				/>
				{seriesKeys.map((key, index) => {
					const s = seriesStyle[key];
					const active = hoveredKey ? hoveredKey === key : true;
					return (
						<Bar
							key={key}
							dataKey={key}
							name={s?.label}
							stackId="share"
							fill={`var(--color-${key}, ${s?.color})`}
							fillOpacity={hoveredKey ? (active ? 0.95 : 0.35) : 0.9}
							radius={
								index === seriesKeys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]
							}
							onMouseOver={() => setHoveredKey(key)}
							onMouseOut={() => setHoveredKey(null)}
							isAnimationActive={false}
						/>
					);
				})}
			</BarChart>
		</ChartContainer>
	);
}
