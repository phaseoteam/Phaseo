"use client";

import React from "react";
import {
	ChartContainer,
	ChartTooltip,
	type ChartConfig,
} from "@/components/ui/chart";
import {
	LineChart,
	Line,
	Area,
	XAxis,
	YAxis,
	CartesianGrid,
	ResponsiveContainer,
} from "recharts";
import { Clock, Zap, Timer } from "lucide-react";
import {
	Empty,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
	EmptyDescription,
} from "@/components/ui/empty";

function formatAxisHourLabel(timestamp: string): string {
	const date = new Date(timestamp);
	if (!Number.isFinite(date.getTime())) {
		return timestamp;
	}
	return date.toLocaleString("en-US", {
		weekday: "short",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
}

function formatTooltipTimestamp(timestamp: string): string {
	const date = new Date(timestamp);
	if (!Number.isFinite(date.getTime())) {
		return timestamp;
	}
	return date.toLocaleString("en-US", {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
}

const latencyChartConfig: ChartConfig = {
	latency: {
		label: "Latency (ms)",
		color: "hsl(32, 95%, 44%)",
	},
};

const throughputChartConfig: ChartConfig = {
	throughput: {
		label: "Throughput (t/s)",
		color: "hsl(189, 90%, 45%)",
	},
};

const e2eLatencyChartConfig: ChartConfig = {
	e2eLatency: {
		label: "E2E Latency (ms)",
		color: "hsl(262, 83%, 58%)",
	},
};

interface LatencyChartProps {
	data: Array<{ timestamp: string; avgLatencyMs: number | null }>;
}

export function LatencyChart({ data }: LatencyChartProps) {
	const chartData = data.map((point) => ({
		timestamp: point.timestamp,
		latency: point.avgLatencyMs,
	}));

	const nonNullSamples = chartData.filter(
		(point) => point.latency != null
	).length;

	if (!chartData.length || nonNullSamples === 0) {
		return (
			<div className="h-[200px] flex items-center justify-center">
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Clock />
						</EmptyMedia>
						<EmptyTitle>No latency data available</EmptyTitle>
						<EmptyDescription>
							Data will appear as requests are processed
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</div>
		);
	}

	const showDots = nonNullSamples <= 1;
	const latencyColor = "var(--color-latency)";
	const latencyDot = showDots
		? {
				r: 3,
				strokeWidth: 2,
				stroke: latencyColor,
				fill: latencyColor,
		  }
		: false;

	return (
		<ChartContainer
			config={latencyChartConfig}
			className="h-[200px] w-full max-w-full min-w-0"
		>
			<ResponsiveContainer width="100%" height="100%">
				<LineChart data={chartData}>
					<CartesianGrid
						strokeDasharray="3 3"
						stroke="rgba(148, 163, 184, 0.2)"
						vertical={false}
					/>
					<XAxis
						dataKey="timestamp"
						axisLine={false}
						tickLine={false}
						tick={{
							fontSize: 12,
							fill: "hsl(var(--muted-foreground))",
						}}
						tickFormatter={formatAxisHourLabel}
						minTickGap={16}
					/>
					<YAxis
						axisLine={false}
						tickLine={false}
						tick={{
							fontSize: 12,
							fill: "hsl(var(--muted-foreground))",
						}}
						tickFormatter={(value) => `${value}ms`}
					/>
					<ChartTooltip
						content={({ active, payload }) => {
							if (active && payload && payload.length) {
								const data = payload[0].payload;
								const value = payload[0].value;
								return (
									<div className="bg-background border border-border rounded-lg p-3 shadow-lg">
										<p className="font-medium mb-1">
											{formatTooltipTimestamp(
												data.timestamp
											)}
										</p>
										<p className="text-sm">
											<span className="font-medium">
												Latency:
											</span>{" "}
											{typeof value === "number"
												? value.toFixed(0)
												: value}{" "}
											ms
										</p>
									</div>
								);
							}
							return null;
						}}
					/>
					<Area
						type="monotone"
						dataKey="latency"
						stroke={latencyColor}
						fill={latencyColor}
						fillOpacity={0.2}
						strokeWidth={2}
						connectNulls={true}
					/>
					<Line
						type="monotone"
						dataKey="latency"
						stroke={latencyColor}
						strokeWidth={2}
						dot={latencyDot}
						connectNulls={true}
					/>
				</LineChart>
			</ResponsiveContainer>
		</ChartContainer>
	);
}

interface ThroughputChartProps {
	data: Array<{ timestamp: string; avgThroughput: number | null }>;
}

export function ThroughputChart({ data }: ThroughputChartProps) {
	const chartData = data.map((point) => ({
		timestamp: point.timestamp,
		throughput: point.avgThroughput,
	}));

	const nonNullSamples = chartData.filter(
		(point) => point.throughput != null
	).length;

	if (!chartData.length || nonNullSamples === 0) {
		return (
			<div className="h-[200px] flex items-center justify-center">
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Zap />
						</EmptyMedia>
						<EmptyTitle>No throughput data available</EmptyTitle>
						<EmptyDescription>
							Data will appear as requests are processed
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</div>
		);
	}

	const showDots = nonNullSamples <= 1;
	const throughputColor = "var(--color-throughput)";
	const throughputDot = showDots
		? {
				r: 3,
				strokeWidth: 2,
				stroke: throughputColor,
				fill: throughputColor,
		  }
		: false;

	return (
		<ChartContainer
			config={throughputChartConfig}
			className="h-[200px] w-full max-w-full min-w-0"
		>
			<ResponsiveContainer width="100%" height="100%">
				<LineChart data={chartData}>
					<CartesianGrid
						strokeDasharray="3 3"
						stroke="rgba(148, 163, 184, 0.2)"
						vertical={false}
					/>
					<XAxis
						dataKey="timestamp"
						axisLine={false}
						tickLine={false}
						tick={{
							fontSize: 12,
							fill: "hsl(var(--muted-foreground))",
						}}
						tickFormatter={formatAxisHourLabel}
						minTickGap={16}
					/>
					<YAxis
						axisLine={false}
						tickLine={false}
						tick={{
							fontSize: 12,
							fill: "hsl(var(--muted-foreground))",
						}}
						tickFormatter={(value) => `${value}t/s`}
					/>
					<ChartTooltip
						content={({ active, payload }) => {
							if (active && payload && payload.length) {
								const data = payload[0].payload;
								const value = payload[0].value;
								return (
									<div className="bg-background border border-border rounded-lg p-3 shadow-lg">
										<p className="font-medium mb-1">
											{formatTooltipTimestamp(
												data.timestamp
											)}
										</p>
										<p className="text-sm">
											<span className="font-medium">
												Throughput:
											</span>{" "}
											{typeof value === "number"
												? value.toFixed(2)
												: value}{" "}
											t/s
										</p>
									</div>
								);
							}
							return null;
						}}
					/>
					<Area
						type="monotone"
						dataKey="throughput"
						stroke={throughputColor}
						fill={throughputColor}
						fillOpacity={0.2}
						strokeWidth={2}
						connectNulls={true}
					/>
					<Line
						type="monotone"
						dataKey="throughput"
						stroke={throughputColor}
						strokeWidth={2}
						dot={throughputDot}
						connectNulls={true}
					/>
				</LineChart>
			</ResponsiveContainer>
		</ChartContainer>
	);
}

interface E2ELatencyChartProps {
	data: Array<{ timestamp: string; avgGenerationMs: number | null }>;
}

export function E2ELatencyChart({ data }: E2ELatencyChartProps) {
	const chartData = data.map((point) => ({
		timestamp: point.timestamp,
		e2eLatency: point.avgGenerationMs,
	}));

	const nonNullSamples = chartData.filter(
		(point) => point.e2eLatency != null
	).length;

	if (!chartData.length || nonNullSamples === 0) {
		return (
			<div className="h-[200px] flex items-center justify-center">
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Timer />
						</EmptyMedia>
						<EmptyTitle>No E2E latency data available</EmptyTitle>
						<EmptyDescription>
							Data will appear as requests are processed
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</div>
		);
	}

	const showDots = nonNullSamples <= 1;
	const e2eColor = "var(--color-e2eLatency)";
	const e2eDot = showDots
		? {
				r: 3,
				strokeWidth: 2,
				stroke: e2eColor,
				fill: e2eColor,
		  }
		: false;

	return (
		<ChartContainer
			config={e2eLatencyChartConfig}
			className="h-[200px] w-full max-w-full min-w-0"
		>
			<ResponsiveContainer width="100%" height="100%">
				<LineChart data={chartData}>
					<CartesianGrid
						strokeDasharray="3 3"
						stroke="rgba(148, 163, 184, 0.2)"
						vertical={false}
					/>
					<XAxis
						dataKey="timestamp"
						axisLine={false}
						tickLine={false}
						tick={{
							fontSize: 12,
							fill: "hsl(var(--muted-foreground))",
						}}
						tickFormatter={formatAxisHourLabel}
						minTickGap={16}
					/>
					<YAxis
						axisLine={false}
						tickLine={false}
						tick={{
							fontSize: 12,
							fill: "hsl(var(--muted-foreground))",
						}}
						tickFormatter={(value) => `${value}ms`}
					/>
					<ChartTooltip
						content={({ active, payload }) => {
							if (active && payload && payload.length) {
								const data = payload[0].payload;
								const value = payload[0].value;
								return (
									<div className="bg-background border border-border rounded-lg p-3 shadow-lg">
										<p className="font-medium mb-1">
											{formatTooltipTimestamp(
												data.timestamp
											)}
										</p>
										<p className="text-sm">
											<span className="font-medium">
												E2E Latency:
											</span>{" "}
											{typeof value === "number"
												? value.toFixed(0)
												: value}{" "}
											ms
										</p>
									</div>
								);
							}
							return null;
						}}
					/>
					<Area
						type="monotone"
						dataKey="e2eLatency"
						stroke={e2eColor}
						fill={e2eColor}
						fillOpacity={0.2}
						strokeWidth={2}
						connectNulls={true}
					/>
					<Line
						type="monotone"
						dataKey="e2eLatency"
						stroke={e2eColor}
						strokeWidth={2}
						dot={e2eDot}
						connectNulls={true}
					/>
				</LineChart>
			</ResponsiveContainer>
		</ChartContainer>
	);
}
