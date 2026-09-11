"use client";

import type { ChartConfig } from "@/components/ui/chart";
import {
	ChartContainer,
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
import type { ModelSuccessPoint } from "@/lib/fetchers/models/getModelPerformance";

const successChartConfig: ChartConfig = {
	overall: {
		label: "Model uptime",
		color: "hsl(142, 76%, 36%)",
	},
	worst: {
		label: "Without Phaseo Routing",
		color: "hsl(340, 82%, 52%)",
	},
};

function formatBucketLabel(bucket: string) {
	const date = new Date(bucket);
	if (!Number.isFinite(date.getTime())) {
		return bucket;
	}
	return date.toLocaleTimeString("en-GB", {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
		timeZone: "UTC",
	});
}

function toHourlyBucket(value: Date | string) {
	const date = new Date(value);
	date.setUTCMinutes(0, 0, 0);
	return date.toISOString();
}

function getDisplayedUptime(value: number | null | undefined, requests: number) {
	if (value != null && Number.isFinite(value)) return value;
	return requests === 0 ? 100 : null;
}

function formatUptime(value: number | null | undefined) {
	return value != null ? `${value.toFixed(1)}%` : "—";
}

export function buildUptimeChartData(
	successSeries: ModelSuccessPoint[],
	now = new Date(),
) {
	const pointsByBucket = new Map(
		successSeries.map((point) => [toHourlyBucket(point.bucket), point]),
	);
	const currentHour = new Date(toHourlyBucket(now));

	return Array.from({ length: 24 }, (_, index) => {
		const bucketDate = new Date(currentHour);
		bucketDate.setUTCHours(currentHour.getUTCHours() - (23 - index));
		const bucket = bucketDate.toISOString();
		const point = pointsByBucket.get(bucket);
		const requests = point?.requests ?? 0;

		return {
			time: formatBucketLabel(bucket),
			overall: getDisplayedUptime(point?.overallSuccessPct, requests),
			worst: point
				? getDisplayedUptime(point.worstProviderSuccessPct, requests)
				: null,
			bucket,
			requests,
			worstRequests: point?.worstProviderRequests ?? 0,
		};
	});
}

interface ModelSuccessChartProps {
	successSeries: ModelSuccessPoint[];
	showLeastStableProvider?: boolean;
	showTitle?: boolean;
}

export default function ModelSuccessChart({
	successSeries,
	showLeastStableProvider = true,
	showTitle = true,
}: ModelSuccessChartProps) {
	const chartData = buildUptimeChartData(successSeries).map((point) => ({
		...point,
		worst: showLeastStableProvider ? point.worst : null,
	}));
	const totalRequests = chartData.reduce((sum, point) => sum + point.requests, 0);
	const measuredPoints = chartData.filter(
		(point) => point.requests > 0 && point.overall != null,
	);
	const measuredRequests = measuredPoints.reduce(
		(sum, point) => sum + point.requests,
		0,
	);
	const summaryUptime =
		totalRequests === 0
			? 100
			: measuredRequests > 0
				? measuredPoints.reduce(
						(sum, point) => sum + (point.overall ?? 0) * point.requests,
						0,
					) / measuredRequests
				: null;
	const measuredWorstPoints = chartData.filter(
		(point) => point.worstRequests > 0 && point.worst != null,
	);
	const measuredWorstRequests = measuredWorstPoints.reduce(
		(sum, point) => sum + point.worstRequests,
		0,
	);
	const withoutRoutingUptime = measuredWorstRequests > 0
		? measuredWorstPoints.reduce(
				(sum, point) => sum + (point.worst ?? 0) * point.worstRequests,
				0,
			) / measuredWorstRequests
		: null;

	return (
		<div className="grid gap-4 rounded-lg border border-border/70 bg-background p-4 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center">
			<div className="min-w-0">
				{showTitle ? (
					<h3 className="text-sm font-medium text-foreground">Model uptime</h3>
				) : null}
				<p className="mt-1 text-3xl font-semibold tracking-tight text-emerald-600 tabular-nums dark:text-emerald-400">
					{formatUptime(summaryUptime)}
				</p>
				<p className="mt-1 text-xs text-muted-foreground">Last 24 hours</p>
			</div>
			<div className="min-w-0">
				<div
					className="h-[112px] w-full"
					role="img"
					aria-label={`Hourly model uptime over the last 24 hours. Phaseo Routing: ${formatUptime(summaryUptime)}.${showLeastStableProvider ? ` Without Phaseo Routing: ${formatUptime(withoutRoutingUptime)}.` : ""}`}
				>
				<ChartContainer
					config={successChartConfig}
					className="h-full w-full"
				>
					<ResponsiveContainer width="100%" height="100%">
						<LineChart data={chartData}>
							<CartesianGrid vertical={false} stroke="var(--border)" opacity={0.35} />
							<XAxis
								dataKey="time"
								axisLine={false}
								interval={5}
								padding={{ left: 20, right: 20 }}
								tickLine={false}
								tick={{
									fontSize: 12,
									fill: "var(--muted-foreground)",
								}}
							/>
							<YAxis hide domain={[0, 100]} />
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
											<p className="text-xs text-muted-foreground">
												{payload[0].payload.time}
											</p>
											<p className="text-sm">
												<span className="font-semibold">
													Uptime:
												</span>{" "}
												{formatUptime(payload[0].payload.overall)}
											</p>
											{showLeastStableProvider ? (
												<p className="text-sm">
													<span className="font-semibold">
												Without Phaseo Routing:
													</span>{" "}
													{formatUptime(payload[0].payload.worst)}
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
									activeDot={false}
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
								activeDot={false}
								connectNulls
							/>
						</LineChart>
					</ResponsiveContainer>
				</ChartContainer>
				</div>
				<div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
					<span className="inline-flex items-center gap-1.5">
						<span className="h-0.5 w-4 rounded-full bg-emerald-600 dark:bg-emerald-400" aria-hidden="true" />
						Phaseo Routing <span className="font-medium tabular-nums text-foreground">{formatUptime(summaryUptime)}</span>
					</span>
					{showLeastStableProvider ? (
						<span className="inline-flex items-center gap-1.5">
							<span className="w-4 border-t-2 border-dashed border-pink-600 dark:border-pink-400" aria-hidden="true" />
							Without Phaseo Routing <span className="font-medium tabular-nums text-foreground">{formatUptime(withoutRoutingUptime)}</span>
						</span>
					) : null}
				</div>
			</div>
		</div>
	);
}
