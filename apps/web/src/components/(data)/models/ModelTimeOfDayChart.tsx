"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
	CartesianGrid,
	ResponsiveContainer,
	XAxis,
	YAxis,
	LineChart,
	Line,
} from "recharts";
import { Card } from "@/components/ui/card";
import {
	ChartContainer,
	ChartTooltip,
} from "@/components/ui/chart";
import type { ModelTimeOfDayPoint } from "@/lib/fetchers/models/getModelPerformance";
import { Button } from "@/components/ui/button";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";

type MetricKey = "throughput" | "latency" | "generation";

const METRIC_CONFIG: Record<
	MetricKey,
	{
		labelKey: string;
		unit: string;
		valueKey: keyof ModelTimeOfDayPoint;
		color: string;
	}
> = {
	throughput: {
		labelKey: "throughput",
		unit: "t/s",
		valueKey: "avgThroughput",
		color: "hsl(189, 90%, 45%)",
	},
	latency: {
		labelKey: "latency",
		unit: "ms",
		valueKey: "avgLatencyMs",
		color: "hsl(32, 95%, 44%)",
	},
	generation: {
		labelKey: "endToEndLatency",
		unit: "ms",
		valueKey: "avgGenerationMs",
		color: "hsl(262, 83%, 58%)",
	},
};

function formatHour(hour: number) {
	return `${hour.toString().padStart(2, "0")}:00`;
}

interface ModelTimeOfDayChartProps {
	timeOfDay: ModelTimeOfDayPoint[];
}

export default function ModelTimeOfDayChart({
	timeOfDay,
}: ModelTimeOfDayChartProps) {
	const t = useTranslations("Catalogue.modelDetail.performance");
	const format = useDisplayFormatters();
	const [selectedMetric, setSelectedMetric] =
		useState<MetricKey>("throughput");

	const chartData = useMemo(() => {
		const config = METRIC_CONFIG[selectedMetric];
		const pointByHour = new Map<number, ModelTimeOfDayPoint>();
		timeOfDay.forEach((point) => {
			pointByHour.set(point.hour, point);
		});
		return Array.from({ length: 24 }, (_, hour) => {
			const point = pointByHour.get(hour);
			return {
				hour,
				value: point
					? ((point[config.valueKey] as number | null) ?? null)
					: null,
			};
		});
	}, [selectedMetric, timeOfDay]);

	const metricConfig = METRIC_CONFIG[selectedMetric];
	const valueCount = chartData.reduce(
		(count, point) => (point.value != null ? count + 1 : count),
		0
	);
	const hasValues = valueCount > 0;
	const shouldShowDot = valueCount === 1;
	const metricLabel = t(METRIC_CONFIG[selectedMetric].labelKey as never);

	if (!timeOfDay.length) {
		return null;
	}

	return (
		<Card className="p-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<p className="text-xs uppercase tracking-wide text-muted-foreground">
						{t("timeOfDay.title")}
					</p>
					<h3 className="text-lg font-semibold text-foreground">
						{t("timeOfDay.metricByHour", { metric: metricLabel } as never)}
					</h3>
				</div>
				<div className="flex gap-2">
					{(Object.keys(METRIC_CONFIG) as MetricKey[]).map(
						(option) => (
							<Button
								key={option}
								variant={
									option === selectedMetric
										? "default"
										: "outline"
								}
								size="sm"
								onClick={() => setSelectedMetric(option)}
							>
								{t(METRIC_CONFIG[option].labelKey as never)}
							</Button>
						)
					)}
				</div>
			</div>

			<div className="mt-4 h-[260px]">
				{hasValues ? (
					<ChartContainer
						config={{
							value: {
								label: metricLabel,
								color: metricConfig.color,
							},
						}}
						className="h-full w-full"
					>
						<ResponsiveContainer width="100%" height="100%">
							<LineChart data={chartData}>
								<CartesianGrid
									strokeDasharray="3 3"
									stroke="var(--border)"
									opacity={0.5}
									vertical={false}
								/>
								<XAxis
									dataKey="hour"
									tickFormatter={formatHour}
									axisLine={false}
									tickLine={false}
									tick={{
										fontSize: 12,
										fill: "var(--muted-foreground)",
									}}
								/>
								<YAxis
									axisLine={false}
									tickLine={false}
									tick={{
										fontSize: 12,
										fill: "var(--muted-foreground)",
									}}
									tickFormatter={(value) =>
										`${format.number(Number(value))}${metricConfig.unit}`
									}
								/>
								<ChartTooltip
									content={({ active, payload }) => {
										if (!active || !payload?.length) {
											return null;
										}

										const point = payload[0];
										return (
											<div className="rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-md">
												<p className="text-xs uppercase text-muted-foreground">
													{formatHour(
														point.payload.hour
													)}
												</p>
												<p className="text-sm font-medium">
											{point.payload.value == null
												? t("noData")
												: `${format.number(point.payload.value, {
														maximumFractionDigits:
															selectedMetric === "throughput" ? 2 : 0,
													})} ${metricConfig.unit}`}
												</p>
											</div>
										);
									}}
								/>
								<Line
									type="monotone"
									dataKey="value"
									stroke={metricConfig.color}
									strokeWidth={3}
									dot={
										shouldShowDot
											? {
												stroke: metricConfig.color,
												fill: metricConfig.color,
												r: 3,
											}
											: false
									}
									connectNulls
								/>
							</LineChart>
						</ResponsiveContainer>
					</ChartContainer>
				) : (
					<div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
						{t("timeOfDay.noSamples")}
					</div>
				)}
			</div>
			<p className="mt-3 text-xs text-muted-foreground">
				{t("timeOfDay.footer")}
			</p>
		</Card>
	);
}
