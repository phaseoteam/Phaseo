"use client";

import { Activity } from "lucide-react";
import type { ChartConfig } from "@/components/ui/chart";
import {
	ChartContainer,
	ChartTooltip,
} from "@/components/ui/chart";
import {
	CartesianGrid,
	Line,
	LineChart,
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

const UPTIME_COLOR = "hsl(142, 76%, 36%)";
const LEAST_STABLE_PROVIDER_COLOR = "hsl(340, 82%, 52%)";

const successChartConfig: ChartConfig = {
	overall: {
		label: "Uptime",
		color: UPTIME_COLOR,
	},
	worst: {
		label: "Least stable provider",
		color: LEAST_STABLE_PROVIDER_COLOR,
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

function formatPercent(value: number | null | undefined) {
	return value != null && Number.isFinite(value) ? `${value.toFixed(1)}%` : "-";
}

function getDisplayedUptime(value: number | null | undefined, requests: number) {
	if (value != null && Number.isFinite(value)) return value;
	return requests === 0 ? 100 : null;
}

interface ModelSuccessChartProps {
	successSeries: ModelSuccessPoint[];
	showLeastStableProvider?: boolean;
}

function ChartKey({ showLeastStableProvider }: { showLeastStableProvider: boolean }) {
	return (
		<div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
			<div className="inline-flex items-center gap-1.5">
				<span className="h-0.5 w-5 rounded-full bg-[var(--color-overall)]" />
				<span>Uptime</span>
			</div>
			{showLeastStableProvider ? (
				<div className="inline-flex items-center gap-1.5">
					<span className="h-0.5 w-5 rounded-full border-t-2 border-dashed border-[var(--color-worst)]" />
					<span>Least stable provider</span>
				</div>
			) : null}
		</div>
	);
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
			<div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center">
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Activity />
						</EmptyMedia>
						<EmptyTitle>No uptime data yet</EmptyTitle>
						<EmptyDescription>
							Data will appear as requests land in the last 24 hours.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</div>
		);
	}

	return (
		<div className="rounded-lg border border-border/70 bg-background p-6">
			<div
				className="flex flex-wrap items-center justify-between gap-3"
				style={
					{
						"--color-overall": UPTIME_COLOR,
						"--color-worst": LEAST_STABLE_PROVIDER_COLOR,
					} as Record<string, string>
				}
			>
				<h3 className="text-lg font-semibold text-foreground">Model Uptime</h3>
				<ChartKey showLeastStableProvider={showLeastStableProvider} />
			</div>
			<div className="mt-4 h-[260px] w-full">
				<ChartContainer
					config={successChartConfig}
					className="h-full w-full"
				>
					<LineChart data={chartData}>
						<CartesianGrid
							strokeDasharray="3 3"
							stroke="var(--border)"
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
							tickFormatter={(value) => `${Number(value).toFixed(0)}%`}
						/>
						<ChartTooltip
							content={({ active, payload }) => {
								if (!active || !payload?.length) {
									return null;
								}
								const point = payload[0].payload;
								return (
									<div className="rounded-lg border border-border bg-background p-3 text-foreground shadow-lg">
										<p className="text-xs uppercase text-muted-foreground">
											{point.time}
										</p>
										<p className="text-sm">
											<span className="font-semibold">Uptime:</span>{" "}
											{formatPercent(point.overall)}
										</p>
										{showLeastStableProvider ? (
											<p className="text-sm">
												<span className="font-semibold">Least stable provider:</span>{" "}
												{formatPercent(point.worst)}
											</p>
										) : null}
									</div>
								);
							}}
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
				</ChartContainer>
			</div>
		</div>
	);
}
