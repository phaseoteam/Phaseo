"use client";

import React from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Maximize2, TrendingUp, TrendingDown } from "lucide-react";
import { ChartContainer } from "@/components/ui/chart";
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
import { formatAxisNumber, formatAxisCurrency } from "./chart-formatters";
import { EnhancedChartTooltip } from "./EnhancedChartTooltip";
import { OTHER_SERIES_KEY, reduceChartSeries } from "./chartSeries";
import { getModelDisplayName, type ModelMetadataMap } from "./model-display";

interface MetricChartCardProps {
	title: string;
	icon: React.ElementType;
	currentValue: number;
	previousValue: number;
	avgValue: number;
	format: (value: number) => string;
	chartData: Array<{
		bucket: string;
		[key: string]: number | string;
	}>;
	colorMap: Record<string, string>;
	modelMetadata: ModelMetadataMap;
	onClick: () => void;
	metricType?: "number" | "currency";
}

type TopSeriesRow = {
	key: string;
	total: number;
};

function hash32(str: string) {
	let h = 0x811c9dc5 >>> 0;
	for (let i = 0; i < str.length; i++) {
		h ^= str.charCodeAt(i);
		h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
	}
	return h >>> 0;
}

function getColor(id: string, colorMap: Record<string, string>) {
	if (id === OTHER_SERIES_KEY) {
		return "hsl(0 0% 72% / 0.78)";
	}
	const orgColor = colorMap[id];
	if (orgColor) {
		return orgColor;
	}
	const hue = hash32(id) % 360;
	return `hsl(${hue} 45% 78% / 0.88)`;
}

export default function MetricChartCard({
	title,
	icon: Icon,
	currentValue,
	previousValue,
	avgValue,
	format,
	chartData,
	colorMap,
	modelMetadata,
	onClick,
	metricType = "number",
}: MetricChartCardProps) {
	const [activeSeriesKey, setActiveSeriesKey] = React.useState<string | null>(
		null,
	);

	const reduced = React.useMemo(() => reduceChartSeries(chartData, 12), [chartData]);
	const displayChartData = reduced.rows;
	const seriesKeys = reduced.seriesKeys;

	const topSeriesRows = React.useMemo(() => {
		const totals = new Map<string, number>();
		for (const row of chartData) {
			for (const [key, value] of Object.entries(row)) {
				if (key === "bucket") continue;
				const n = Number(value);
				if (!Number.isFinite(n)) continue;
				totals.set(key, (totals.get(key) ?? 0) + n);
			}
		}

		const sorted = Array.from(totals.entries())
			.sort((a, b) => b[1] - a[1])
			.map(([key, total]) => ({ key, total }));

		const top = sorted.slice(0, 5);
		if (sorted.length > 5) {
			const otherTotal = sorted
				.slice(5)
				.reduce((sum, row) => sum + row.total, 0);
			top.push({ key: OTHER_SERIES_KEY, total: otherTotal });
		}

		return top;
	}, [chartData]);

	const percentChange = previousValue > 0
		? ((currentValue - previousValue) / previousValue) * 100
		: currentValue > 0 ? 100 : 0;

	const chartConfig = React.useMemo(() => {
		const config: Record<string, { label: string; color: string }> = {};
		for (const key of seriesKeys) {
			config[key] = {
				label:
				key === OTHER_SERIES_KEY
					? "Other"
					: getModelDisplayName(key, modelMetadata),
				color: getColor(key, colorMap),
			};
		}
		return config;
	}, [seriesKeys, colorMap, modelMetadata]);

	return (
		<Card
			className="cursor-pointer hover:shadow-md transition-shadow relative group"
			onClick={onClick}
		>
			<CardHeader className="pb-2 space-y-2">
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-2 min-w-0">
						<Icon className="h-5 w-5 text-muted-foreground shrink-0" />
						<h3 className="font-semibold text-sm truncate">{title}</h3>
					</div>
					<div className="relative h-8 min-w-[116px] shrink-0">
						{percentChange !== 0 && (
							<div
								className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium ${
									percentChange > 0
										? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
										: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
								} absolute right-0 top-1/2 -translate-y-1/2 z-10 transition-transform duration-200 ease-out group-hover:-translate-x-[40px] group-focus-within:-translate-x-[40px]`}
							>
								{percentChange > 0 ? (
									<>
										<TrendingUp className="h-3 w-3" />
										<span>+{Math.abs(percentChange).toFixed(1)}%</span>
									</>
								) : (
									<>
										<TrendingDown className="h-3 w-3" />
										<span>-{Math.abs(percentChange).toFixed(1)}%</span>
									</>
								)}
							</div>
						)}
						<div className="absolute right-0 top-1/2 -translate-y-1/2 z-20 opacity-0 translate-x-[6px] scale-[0.96] pointer-events-none transition-all duration-200 ease-out group-hover:opacity-100 group-hover:translate-x-0 group-hover:scale-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:translate-x-0 group-focus-within:scale-100 group-focus-within:pointer-events-auto">
							<Button
								variant="ghost"
								size="sm"
								className="h-8 w-8 p-0"
								onClick={(e) => {
									e.stopPropagation();
									onClick();
								}}
							>
								<Maximize2 className="h-4 w-4" />
							</Button>
						</div>
					</div>
				</div>
				<div className="flex items-end justify-between gap-3 flex-wrap">
					<div className="text-3xl font-bold">{format(currentValue)}</div>
					<div className="text-sm text-muted-foreground">
						Avg:{" "}
						<span className="font-mono font-medium text-foreground">
							{metricType === "currency"
								? format(avgValue)
								: Math.round(avgValue).toLocaleString()}
						</span>
					</div>
				</div>
			</CardHeader>
			<CardContent className="pt-0">
				<div className="h-[220px]">
					<ChartContainer config={chartConfig} className="h-full w-full">
						<BarChart
							data={displayChartData}
							margin={{ left: 0, right: 0, top: 0, bottom: 0 }}
							onMouseLeave={() => setActiveSeriesKey(null)}
						>
							<CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.3} />
							<XAxis
								dataKey="bucket"
								tickLine={false}
								axisLine={false}
								tick={{ fontSize: 10 }}
								interval="preserveStartEnd"
							/>
							<YAxis
								tickLine={false}
								axisLine={false}
								tick={{ fontSize: 10 }}
								width={45}
								tickFormatter={metricType === "currency" ? formatAxisCurrency : formatAxisNumber}
							/>
							<Tooltip
								content={(props) => (
									<EnhancedChartTooltip
										{...props}
										format={format}
										getColor={(key) => getColor(key, colorMap)}
										activeKey={activeSeriesKey}
									/>
								)}
								cursor={{ fill: "hsl(var(--muted))", opacity: 0.15 }}
							/>
							{seriesKeys.map((key) => (
								<Bar
									key={key}
									dataKey={key}
									name={key === OTHER_SERIES_KEY ? "Other" : getModelDisplayName(key, modelMetadata)}
									stackId="a"
									fill={getColor(key, colorMap)}
									radius={[2, 2, 0, 0]}
									onMouseEnter={() => setActiveSeriesKey(key)}
									onMouseLeave={() => setActiveSeriesKey(null)}
								/>
							))}
						</BarChart>
					</ChartContainer>
				</div>

				<div className="mt-3 border-t pt-2 space-y-1.5">
					<div className="text-[10px] uppercase tracking-wide text-muted-foreground">Top Models</div>
					{topSeriesRows.length === 0 ? (
						<div className="text-xs text-muted-foreground">No usage yet.</div>
					) : (
						topSeriesRows.map((row: TopSeriesRow) => (
							<div key={row.key} className="flex items-center gap-2 text-xs">
								<div
									className="h-2.5 w-2.5 rounded-sm shrink-0"
									style={{ backgroundColor: getColor(row.key, colorMap) }}
								/>
								<span className="truncate text-muted-foreground">
									{row.key === OTHER_SERIES_KEY ? "Other" : getModelDisplayName(row.key, modelMetadata)}
								</span>
								<span className="ml-auto font-mono text-foreground">{format(row.total)}</span>
							</div>
						))
					)}
				</div>
			</CardContent>
		</Card>
	);
}
