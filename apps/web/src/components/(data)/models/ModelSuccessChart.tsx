"use client";

import { Activity } from "lucide-react";
import type { ChartConfig } from "@/components/ui/chart";
import {
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
} from "@/components/ui/chart";
import {
	CartesianGrid,
	Line,
	LineChart,
	ResponsiveContainer,
	XAxis,
	YAxis,
} from "recharts";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import type { ModelSuccessPoint } from "@/lib/fetchers/models/getModelPerformance";

const successChartConfig: ChartConfig = {
	overall: {
		label: "AI Stats success rate",
		color: "hsl(142, 76%, 36%)",
	},
	worst: {
		label: "Least stable provider",
		color: "hsl(340, 82%, 52%)",
	},
};

function formatBucketLabel(bucket: string) {
	const date = new Date(bucket);
	if (!Number.isFinite(date.getTime())) {
		return bucket;
	}
	return date.toLocaleTimeString("en-US", {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
}

interface ModelSuccessChartProps {
	successSeries: ModelSuccessPoint[];
}

export default function ModelSuccessChart({
	successSeries,
}: ModelSuccessChartProps) {
	const chartData = successSeries.map((point) => ({
		time: formatBucketLabel(point.bucket),
		overall: point.overallSuccessPct ?? null,
		worst: point.worstProviderSuccessPct,
		bucket: point.bucket,
	}));

	if (!chartData.length) {
		return (
			<div className="rounded-lg border border-dashed border-gray-300 bg-muted/20 p-6 text-center">
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Activity />
						</EmptyMedia>
						<EmptyTitle>No success data yet</EmptyTitle>
						<EmptyDescription>
							Data will appear as requests land in the last 24
							hours.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</div>
		);
	}

	return (
		<div className="rounded-lg border border-gray-200 dark:border-gray-700 p-6">
			<div className="flex items-center justify-between">
				<div>
					<h3 className="text-lg font-semibold text-foreground">
						Model Uptime
					</h3>
				</div>
			</div>
			<div className="mt-4 h-[260px] w-full">
				<ChartContainer
					config={successChartConfig}
					className="h-full w-full"
				>
					<ResponsiveContainer width="100%" height="100%">
						<LineChart data={chartData}>
							<CartesianGrid
								strokeDasharray="3 3"
								stroke="rgba(148, 163, 184, 0.2)"
								vertical={false}
							/>
							<XAxis
								dataKey="time"
								axisLine={false}
								tickLine={false}
								tick={{
									fontSize: 12,
									fill: "hsl(var(--muted-foreground))",
								}}
							/>
							<YAxis
								axisLine={false}
								tickLine={false}
								tick={{
									fontSize: 12,
									fill: "hsl(var(--muted-foreground))",
								}}
								domain={[0, 100]}
								tickFormatter={(value) =>
									`${value.toFixed(0)}%`
								}
							/>
							<ChartTooltip
								content={({ active, payload }) => {
									if (
										!active ||
										!payload ||
										!payload.length
									) {
										return null;
									}

									return (
										<div className="rounded-lg border border-border bg-background p-3 shadow-lg">
											<p className="text-xs uppercase text-muted-foreground">
												{payload[0].payload.time}
											</p>
											<p className="text-sm">
												<span className="font-semibold">
													Model success:
												</span>{" "}
												{payload[0].payload.overall !=
												null
													? `${payload[0].payload.overall.toFixed(
															1
													  )}%`
													: "—"}
											</p>
											<p className="text-sm">
												<span className="font-semibold">
													Worst provider:
												</span>{" "}
												{payload[0].payload.worst !=
												null
													? `${payload[0].payload.worst.toFixed(
															1
													  )}%`
													: "—"}
											</p>
										</div>
									);
								}}
							/>
							<ChartLegend
								verticalAlign="top"
								content={<ChartLegendContent />}
							/>
							<Line
								type="monotone"
								dataKey="worst"
								stroke="var(--color-worst)"
								strokeWidth={2}
								dot={false}
								strokeDasharray="4 3"
								connectNulls
							/>
							<Line
								type="monotone"
								dataKey="overall"
								stroke="var(--color-overall)"
								strokeWidth={3}
								dot={false}
								connectNulls
							/>
						</LineChart>
					</ResponsiveContainer>
				</ChartContainer>
			</div>
		</div>
	);
}
