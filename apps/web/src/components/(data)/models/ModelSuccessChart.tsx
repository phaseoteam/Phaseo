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

function getDisplayedUptime(value: number | null | undefined, requests: number) {
	if (value != null && Number.isFinite(value)) return value;
	return requests === 0 ? 100 : null;
}

interface ModelSuccessChartProps {
	successSeries: ModelSuccessPoint[];
	showLeastStableProvider?: boolean;
}

export default function ModelSuccessChart({
	successSeries,
	showLeastStableProvider = true,
}: ModelSuccessChartProps) {
	const chartData = successSeries.map((point) => ({
		time: formatBucketLabel(point.bucket),
		overall: getDisplayedUptime(point.overallSuccessPct, point.requests),
		worst: showLeastStableProvider
			? getDisplayedUptime(point.worstProviderSuccessPct, point.requests)
			: null,
		bucket: point.bucket,
		requests: point.requests,
	}));

	if (!chartData.length) {
		return (
			<div className="rounded-lg border border-dashed border-border/80 bg-muted/20 p-6 text-center">
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
		<div className="rounded-lg border border-border/80 bg-card p-6 text-card-foreground shadow-xs">
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
								stroke="var(--border)"
								opacity={0.5}
								vertical={false}
							/>
							<XAxis
								dataKey="time"
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
										<div className="rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg">
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
								content={(props) => (
									<ChartLegendContent
										payload={props.payload}
										verticalAlign={props.verticalAlign}
									/>
								)}
							/>
							{showLeastStableProvider ? (
								<Line
									type="monotone"
									dataKey="worst"
									stroke="var(--color-worst)"
									strokeWidth={2}
									dot={false}
									strokeDasharray="4 3"
									connectNulls
								/>
							) : null}
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
