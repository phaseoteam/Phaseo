"use client";

import { useMemo, useState } from "react";
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

function formatBucketLabel(value: string) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatNumber(value: number) {
	if (!Number.isFinite(value)) return "â€”";
	if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
	if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
	if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
	return value.toLocaleString();
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
		const key = row.model_id || "Unknown";
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
		totalsByModel.set(key, (totalsByModel.get(key) ?? 0) + value);
	}

	const sortedModels = Array.from(totalsByModel.entries())
		.sort((a, b) => b[1] - a[1])
		.map(([model]) => model);

	if (!sortedModels.length) {
		return (
			<RankingsEmptyState
				title="No weekly usage data yet"
				description="Usage appears once enough requests are aggregated to meet privacy thresholds."
			/>
		);
	}

	const endWeek = startOfWeek(new Date());
	for (let i = 51; i >= 0; i -= 1) {
		const ts = endWeek.getTime() - i * WEEK_MS;
		if (!bucketMap.has(ts)) {
			bucketMap.set(ts, {
				bucket: formatBucketLabel(new Date(ts).toISOString()),
				bucketTs: ts,
			} as Record<string, number> & { bucket: string; bucketTs: number });
		}
	}

	const modelOrder = sortedModels.includes("Other")
		? [...sortedModels.filter((model) => model !== "Other"), "Other"]
		: sortedModels;

	const { chartData, seriesKeys, seriesStyle } = useMemo(() => {
		const keyMap = new Map<string, string>();
		modelOrder.forEach((model) => {
			if (model === "Other") {
				keyMap.set(model, "other");
			} else {
				keyMap.set(model, keyForSeries(model));
			}
		});

		const colourMap = assignSeriesColours(
			modelOrder.filter((model) => model !== "Other")
		);

		const style: SeriesStyle = {};
		modelOrder.forEach((model) => {
			const key = keyMap.get(model) ?? model;
			if (model === "Other") {
				style[key] = {
					label: "Other",
					color: "hsl(0 0% 70% / 0.6)",
					stroke: "hsl(0 0% 50%)",
				};
				return;
			}
			const explicit = explicitColourMap.get(model);
			const c = colourMap[model];
			style[key] = {
				label: nameMap[model] ?? model,
				color: explicit ?? c?.fill ?? "hsl(210 70% 75%)",
				stroke: explicit ?? c?.stroke ?? c?.fill ?? "hsl(210 70% 55%)",
			};
		});

		const data = Array.from(bucketMap.values())
			.sort((a, b) => a.bucketTs - b.bucketTs)
			.map(({ bucket, bucketTs, ...rest }) => {
				const row: Record<string, number | string> = { bucket };
				modelOrder.forEach((model) => {
					const key = keyMap.get(model) ?? model;
					row[key] = Number(rest[model] ?? 0);
				});
				return row;
			});

		const keys = modelOrder.map((model) => keyMap.get(model) ?? model);

		return { chartData: data, seriesKeys: keys, seriesStyle: style };
	}, [bucketMap, explicitColourMap, modelOrder, nameMap]);

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
							const filteredPayload =
								props.payload
									?.filter((item) => Number(item?.value ?? 0) > 0)
									.sort(
										(a, b) =>
											Number(b?.value ?? 0) - Number(a?.value ?? 0)
									) ?? [];
							if (!filteredPayload.length) return null;
							return (
								<ChartTooltipContent
									{...props}
									payload={filteredPayload}
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
				</BarChart>
			</ChartContainer>
			<p className="text-sm text-muted-foreground text-center">
				Weekly {metric} across the last 12 months, stacked by top models. Remaining
				usage is grouped as Other.
			</p>
		</div>
	);
}
