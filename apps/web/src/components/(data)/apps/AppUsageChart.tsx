"use client";

import { useMemo, useState } from "react";
import { BarChart, Bar, CartesianGrid, XAxis, YAxis } from "recharts";
import { RankingsEmptyState } from "@/components/(rankings)/RankingsEmptyState";
import { assignSeriesColours, keyForSeries } from "@/components/(rankings)/chart-colors";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";

type Row = {
	created_at: string;
	usage?: any;
	cost_nanos?: number | null;
	model_id?: string | null;
	success?: boolean;
};

const TOP_MODELS = 10;
const UNKNOWN_MODEL_LABEL = "Unknown model";
const WINDOW_DAYS = 30;

function formatDayLabel(date: Date) {
	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
	});
}

function formatNumber(value: number) {
	if (!Number.isFinite(value)) return "--";
	if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
	if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
	if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
	return value.toLocaleString();
}

function getTokens(usage: any) {
	const total = Number(usage?.total_tokens);
	if (Number.isFinite(total) && total > 0) return total;
	const input = Number(usage?.input_text_tokens ?? usage?.input_tokens ?? 0) || 0;
	const output = Number(usage?.output_text_tokens ?? usage?.output_tokens ?? 0) || 0;
	return input + output;
}

function normalizeColour(value?: string | null) {
	if (!value) return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return `#${trimmed}`;
	return trimmed;
}

type SeriesStyle = Record<string, { label: string; color: string; stroke: string }>;

export default function AppUsageChart({
	rows,
	windowLabel: _windowLabel,
	modelLabels = {},
	modelColours = {},
}: {
	rows: Row[];
	windowLabel: string;
	modelLabels?: Record<string, string>;
	modelColours?: Record<string, string | null | undefined>;
}) {
	const [hoveredKey, setHoveredKey] = useState<string | null>(null);

	const { chartData, seriesKeys, seriesStyle } = useMemo(() => {
		const end = new Date();
		end.setHours(12, 0, 0, 0);
		const dayBuckets = Array.from({ length: WINDOW_DAYS }, (_, index) => {
			const date = new Date(end);
			date.setDate(end.getDate() - (WINDOW_DAYS - 1 - index));
			const dayKey = date.toISOString().slice(0, 10);
			return {
				dayKey,
				label: formatDayLabel(date),
			};
		});
		const bucketKeySet = new Set(dayBuckets.map((bucket) => bucket.dayKey));

		const bucketMap = new Map<string, Map<string, number>>();
		const totalsByModel = new Map<string, number>();

		for (const row of rows) {
			if (row.success === false || !row.created_at) continue;
			const date = new Date(row.created_at);
			if (Number.isNaN(date.getTime())) continue;
			date.setHours(12, 0, 0, 0);
			const dayKey = date.toISOString().slice(0, 10);
			if (!bucketKeySet.has(dayKey)) continue;

			const rawModel = row.model_id?.trim() || UNKNOWN_MODEL_LABEL;
			const tokens = getTokens(row.usage);
			if (!tokens || tokens < 0) continue;

			const dayMap = bucketMap.get(dayKey) ?? new Map<string, number>();
			dayMap.set(rawModel, (dayMap.get(rawModel) ?? 0) + tokens);
			bucketMap.set(dayKey, dayMap);

			totalsByModel.set(rawModel, (totalsByModel.get(rawModel) ?? 0) + tokens);
		}

		const modelOrder = Array.from(totalsByModel.entries())
			.sort((a, b) => b[1] - a[1])
			.map(([model]) => model);
		const topModels = modelOrder.slice(0, TOP_MODELS);
		const hasOther = modelOrder.length > TOP_MODELS;
		const topSet = new Set(topModels);

		const keyMap = new Map<string, string>();
		for (const model of topModels) {
			keyMap.set(model, keyForSeries(model));
		}
		if (hasOther) keyMap.set("Other", "other");

		const generatedColours = assignSeriesColours(topModels);
		const styles: SeriesStyle = {};
		for (const model of topModels) {
			const key = keyMap.get(model) ?? model;
			const explicit = normalizeColour(modelColours[model]);
			const generated = generatedColours[model];
			styles[key] = {
				label: modelLabels[model] ?? model,
				color: explicit ?? generated?.fill ?? "hsl(210 70% 75%)",
				stroke: explicit ?? generated?.stroke ?? "hsl(210 70% 55%)",
			};
		}
		if (hasOther) {
			styles.other = {
				label: "Other",
				color: "hsl(0 0% 70% / 0.6)",
				stroke: "hsl(0 0% 50%)",
			};
		}

		const chartRows = dayBuckets.map(({ dayKey, label }) => {
			const row: Record<string, string | number | boolean> = {
				bucket: label,
			};
			for (const model of topModels) {
				const key = keyMap.get(model) ?? model;
				row[key] = 0;
			}
			if (hasOther) row.other = 0;

			const dayMap = bucketMap.get(dayKey);
			if (dayMap) {
				for (const [model, value] of dayMap.entries()) {
					if (topSet.has(model)) {
						const key = keyMap.get(model) ?? model;
						row[key] = Number(row[key] ?? 0) + value;
					} else if (hasOther) {
						row.other = Number(row.other ?? 0) + value;
					}
				}
			}

			return row;
		});

		const keys = [
			...topModels.map((model) => keyMap.get(model) ?? model),
			...(hasOther ? ["other"] : []),
		];

		return {
			chartData: chartRows,
			seriesKeys: keys,
			seriesStyle: styles,
		};
	}, [rows, modelLabels, modelColours]);

	if (!rows.length || !seriesKeys.length) {
		return (
			<RankingsEmptyState
				title="No usage data yet"
				description="Usage appears once this app has recent successful requests."
			/>
		);
	}

	const chartConfig = {
		value: { label: "Tokens", color: "hsl(var(--primary))" },
		...Object.fromEntries(
			Object.entries(seriesStyle).map(([k, v]) => [
				k,
				{ label: v.label, color: v.color },
			]),
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
											Number(b?.value ?? 0) - Number(a?.value ?? 0),
									)
									.slice(0, 10) ?? [];
							if (!filteredPayload.length) return null;
							const weeklyTotal = filteredPayload.reduce(
								(sum, item) => sum + Number(item?.value ?? 0),
								0
							);
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
									</div>
								</div>
							);
						}}
					/>
					{seriesKeys.map((key, index) => {
						const style = seriesStyle[key];
						const active = hoveredKey ? hoveredKey === key : true;
						return (
							<Bar
								key={key}
								dataKey={key}
								name={style?.label}
								stackId="usage"
								fill={`var(--color-${key}, ${style?.color})`}
								fillOpacity={hoveredKey ? (active ? 0.95 : 0.35) : 0.9}
								radius={index === seriesKeys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
								onMouseOver={() => setHoveredKey(key)}
								onMouseOut={() => setHoveredKey(null)}
								isAnimationActive={false}
							/>
						);
					})}
				</BarChart>
			</ChartContainer>
		</div>
	);
}

