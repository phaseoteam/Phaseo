"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import type { TimeseriesData } from "@/lib/fetchers/rankings/getRankingsData";
import { RankingsEmptyState } from "@/components/(rankings)/RankingsEmptyState";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { assignSeriesColours, keyForSeries } from "@/components/(rankings)/chart-colors";

type UsageStackedBarProps = {
	data: TimeseriesData[];
	metric?: "requests" | "tokens";
	nameMap?: Record<string, string>;
};

type SeriesStyle = Record<string, { label: string; color: string; stroke: string }>;
const TOP_MODELS = 10;
const STABLE_REFERENCE_DATE = new Date(0);

function formatBucketLabel(value: string) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatNumber(value: number) {
	if (!Number.isFinite(value)) return "--";
	if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
	if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
	if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
	return value.toLocaleString();
}

function formatPaceGain(value: number) {
	const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
	if (safeValue >= 1e9) return `+${(safeValue / 1e9).toFixed(2)}B`;
	if (safeValue >= 1e6) return `+${(safeValue / 1e6).toFixed(2)}M`;
	if (safeValue >= 1e3) return `+${(safeValue / 1e3).toFixed(2)}K`;
	return `+${safeValue.toFixed(2)}`;
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

export function UsageStackedBar({
	data,
	metric = "requests",
	nameMap = {},
}: UsageStackedBarProps) {
	const [hoveredKey, setHoveredKey] = useState<string | null>(null);
	const [nowMs, setNowMs] = useState<number | null>(null);

	useEffect(() => {
		setNowMs(Date.now());
	}, []);

	if (!data.length) {
		return (
			<RankingsEmptyState
				title="No weekly usage data yet"
				description="Usage appears once enough requests are aggregated to meet privacy thresholds."
			/>
		);
	}

	const totalsByModel = new Map<string, number>();
	const explicitColourMap = new Map<string, string>();
	const bucketMap = new Map<number, Record<string, number> & { bucket: string; bucketTs: number }>();

	for (const row of data) {
		const bucketTs = new Date(row.bucket).getTime();
		if (!Number.isFinite(bucketTs)) continue;
		const rawKey = row.model_id?.trim() || "Unknown";
		const keyLower = rawKey.toLowerCase();
		if (keyLower === "unknown") continue;
		const key = keyLower === "other" ? "Other" : rawKey;
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
		totalsByModel.set(key, (totalsByModel.get(key) ?? 0) + value);
	}

	const sortedModels = Array.from(totalsByModel.entries())
		.sort((a, b) => b[1] - a[1])
		.map(([model]) => model);
	const rankedModels = sortedModels.filter((model) => model !== "Other");
	const topModels = rankedModels.slice(0, TOP_MODELS);
	const overflowModels = rankedModels.slice(TOP_MODELS);
	const hasOther = overflowModels.length > 0 || totalsByModel.has("Other");

	if (!topModels.length && !hasOther) {
		return (
			<RankingsEmptyState
				title="No weekly usage data yet"
				description="Usage appears once enough requests are aggregated to meet privacy thresholds."
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
		}
	}

	const modelOrder = hasOther ? [...topModels, "Other"] : topModels;
	const currentWeekStartTs = endWeek.getTime();

	const { chartData, seriesKeys, seriesStyle } = useMemo(() => {
		const keyMap = new Map<string, string>();
		topModels.forEach((model) => {
			keyMap.set(model, keyForSeries(model));
		});
		if (hasOther) keyMap.set("Other", "other");

		const colourMap = assignSeriesColours(
			topModels
		);

		const style: SeriesStyle = {};
		topModels.forEach((model) => {
			const key = keyMap.get(model) ?? model;
			const explicit = explicitColourMap.get(model);
			const c = colourMap[model];
			style[key] = {
				label: nameMap[model] ?? model,
				color: explicit ?? c?.fill ?? "hsl(210 70% 75%)",
				stroke: explicit ?? c?.stroke ?? c?.fill ?? "hsl(210 70% 55%)",
			};
		});
		if (hasOther) {
			style.other = {
				label: "Other",
				color: "hsl(0 0% 70% / 0.6)",
				stroke: "hsl(0 0% 50%)",
			};
		}

		const data = Array.from(bucketMap.values())
			.sort((a, b) => a.bucketTs - b.bucketTs)
			.map(({ bucket, bucketTs, ...rest }) => {
				const row: Record<string, number | string | boolean> = { bucket };
				topModels.forEach((model) => {
					const key = keyMap.get(model) ?? model;
					row[key] = Number(rest[model] ?? 0);
				});
				if (hasOther) {
					let otherTotal = Number(rest.Other ?? 0);
					for (const model of overflowModels) {
						otherTotal += Number(rest[model] ?? 0);
					}
					row.other = otherTotal;
				}
				row.projected_pace = 0;
				row.__isCurrentWeek = false;
				return row;
			});

		const keys = modelOrder.map((model) => keyMap.get(model) ?? model);
		const lastIndex = data.length - 1;
		if (lastIndex >= 0) {
			const sumForRow = (row: Record<string, number | string | boolean>) =>
				keys.reduce((sum, key) => sum + Number(row[key] ?? 0), 0);
			const currentWeekRow = data[lastIndex];
			const currentTotal = sumForRow(currentWeekRow);
			const isCurrentWeek =
				nowMs !== null &&
				nowMs >= currentWeekStartTs &&
				nowMs < currentWeekStartTs + WEEK_MS;
			if (isCurrentWeek) {
				const elapsedMs = Math.max(1, nowMs - currentWeekStartTs);
				const elapsedRatio = Math.min(1, Math.max(0, elapsedMs / WEEK_MS));
				const projectedTotal =
					elapsedRatio > 0 && elapsedRatio < 1
						? Math.max(currentTotal, currentTotal / elapsedRatio)
						: currentTotal;
				const projectedDelta = Math.max(0, projectedTotal - currentTotal);
				currentWeekRow.projected_pace = projectedDelta;
				currentWeekRow.__isCurrentWeek = true;
			}
		}

		return { chartData: data, seriesKeys: keys, seriesStyle: style };
	}, [
		bucketMap,
		currentWeekStartTs,
		explicitColourMap,
		hasOther,
		modelOrder,
		nameMap,
		nowMs,
		overflowModels,
		topModels,
	]);

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
		<div className="space-y-4">
			<ChartContainer config={chartConfig} className="h-[420px] w-full">
				<BarChart
					data={chartData}
					margin={{ top: 16, right: 12, left: 0, bottom: 32 }}
					onMouseLeave={() => setHoveredKey(null)}
				>
					<defs>
						<pattern
							id="rankingsProjectedPacePattern"
							patternUnits="userSpaceOnUse"
							width={8}
							height={8}
							patternTransform="rotate(45)"
						>
							<rect width={8} height={8} fill="hsl(0 0% 88% / 0.35)" />
							<line
								x1={0}
								y1={0}
								x2={0}
								y2={8}
								stroke="hsl(0 0% 65% / 0.8)"
								strokeWidth={2}
							/>
						</pattern>
					</defs>
					<CartesianGrid vertical={false} className="stroke-muted" />
					<XAxis
						dataKey="bucket"
						minTickGap={24}
						interval="preserveStartEnd"
						tickLine={false}
						axisLine={false}
					/>
					<YAxis
						tickFormatter={(value) => formatNumber(Number(value))}
						width={60}
						tickLine={false}
						axisLine={false}
					/>
					<ChartTooltip
						content={(props) => {
							const rowPayload = (props.payload?.[0]?.payload ?? {}) as Record<
								string,
								number | string | boolean
							>;
							const isCurrentWeek = Boolean(rowPayload.__isCurrentWeek);
							const filteredPayload =
								props.payload
									?.filter(
										(item) =>
											String(item?.dataKey ?? "") !== "projected_pace" &&
											Number(item?.value ?? 0) > 0
									)
									.sort(
										(a, b) =>
											Number(b?.value ?? 0) - Number(a?.value ?? 0)
									)
									.slice(0, 10) ?? [];
							if (!filteredPayload.length) return null;
							const weeklyTotal = filteredPayload.reduce(
								(sum, item) => sum + Number(item?.value ?? 0),
								0
							);
							const weeklyPaceGain = isCurrentWeek
								? Number(rowPayload.projected_pace ?? 0)
								: 0;
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
											const cfg = seriesStyle[seriesKey];
											const isActive = hoveredKey === seriesKey;
											return (
												<div
													className={`flex w-full items-center justify-between rounded-md px-1.5 py-0.5 ${
														isActive
															? "bg-zinc-200/70 dark:bg-zinc-800/70"
															: ""
													}`}
												>
													<span className="inline-flex items-center gap-1.5">
														<span
															className="inline-block rounded-[2px]"
															style={{
																backgroundColor: cfg?.color,
																width: 4,
																height: 14,
															}}
														/>
														<span>{cfg?.label ?? String(name ?? "")}</span>
													</span>
													<span className="ml-auto pl-3 font-mono">
														{formatNumber(val)}
													</span>
												</div>
											);
										}}
									/>
									<div className="space-y-0.5 border-t border-border/60 pt-1.5 text-xs">
										<div className="flex items-center justify-between">
											<span className="text-muted-foreground">Total</span>
											<span className="font-mono">{formatNumber(weeklyTotal)}</span>
										</div>
										{isCurrentWeek ? (
											<div className="flex items-center justify-between">
												<span className="text-muted-foreground">Weekly Pace</span>
												<span className="font-mono">
													{formatPaceGain(weeklyPaceGain)}
												</span>
											</div>
										) : null}
									</div>
								</div>
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
								stackId="usage"
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
					<Bar
						dataKey="projected_pace"
						name="Projected pace"
						stackId="usage"
						fill="url(#rankingsProjectedPacePattern)"
						stroke="hsl(0 0% 55% / 0.7)"
						strokeWidth={0.5}
						radius={[4, 4, 0, 0]}
						isAnimationActive={false}
					/>
				</BarChart>
			</ChartContainer>
		</div>
	);
}
