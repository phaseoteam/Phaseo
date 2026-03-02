"use client";

import {
	ChartContainer,
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
	Tooltip as RechartsTooltip,
} from "recharts";
import { Clock, Zap, Timer } from "lucide-react";
import {
	Empty,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
	EmptyDescription,
} from "@/components/ui/empty";

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
	onHoverBucket?: (timestamp: string | null) => void;
	syncId?: string;
}

export function LatencyChart({
	data,
	onHoverBucket,
	syncId,
}: LatencyChartProps) {
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
				<LineChart
					data={chartData}
					syncId={syncId}
					syncMethod="value"
					onMouseMove={(state: any) => {
						const hoveredTimestamp =
							typeof state?.activeLabel === "string"
								? state.activeLabel
								: state?.activePayload?.[0]?.payload?.timestamp ?? null;
						onHoverBucket?.(hoveredTimestamp);
					}}
					onMouseLeave={() => onHoverBucket?.(null)}
				>
					<CartesianGrid
						strokeDasharray="3 3"
						stroke="rgba(148, 163, 184, 0.2)"
						vertical={false}
					/>
					<XAxis
						dataKey="timestamp"
						hide
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
					<RechartsTooltip
						cursor={{
							stroke: "hsl(var(--border))",
							strokeWidth: 1,
							strokeDasharray: "4 4",
						}}
						content={() => null}
						isAnimationActive={false}
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
						activeDot={{
							r: 4,
							strokeWidth: 2,
							stroke: latencyColor,
							fill: "hsl(var(--background))",
						}}
						connectNulls={true}
					/>
				</LineChart>
			</ResponsiveContainer>
		</ChartContainer>
	);
}

interface ThroughputChartProps {
	data: Array<{ timestamp: string; avgThroughput: number | null }>;
	onHoverBucket?: (timestamp: string | null) => void;
	syncId?: string;
}

export function ThroughputChart({
	data,
	onHoverBucket,
	syncId,
}: ThroughputChartProps) {
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
				<LineChart
					data={chartData}
					syncId={syncId}
					syncMethod="value"
					onMouseMove={(state: any) => {
						const hoveredTimestamp =
							typeof state?.activeLabel === "string"
								? state.activeLabel
								: state?.activePayload?.[0]?.payload?.timestamp ?? null;
						onHoverBucket?.(hoveredTimestamp);
					}}
					onMouseLeave={() => onHoverBucket?.(null)}
				>
					<CartesianGrid
						strokeDasharray="3 3"
						stroke="rgba(148, 163, 184, 0.2)"
						vertical={false}
					/>
					<XAxis
						dataKey="timestamp"
						hide
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
					<RechartsTooltip
						cursor={{
							stroke: "hsl(var(--border))",
							strokeWidth: 1,
							strokeDasharray: "4 4",
						}}
						content={() => null}
						isAnimationActive={false}
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
						activeDot={{
							r: 4,
							strokeWidth: 2,
							stroke: throughputColor,
							fill: "hsl(var(--background))",
						}}
						connectNulls={true}
					/>
				</LineChart>
			</ResponsiveContainer>
		</ChartContainer>
	);
}

interface E2ELatencyChartProps {
	data: Array<{ timestamp: string; avgGenerationMs: number | null }>;
	onHoverBucket?: (timestamp: string | null) => void;
	syncId?: string;
}

export function E2ELatencyChart({
	data,
	onHoverBucket,
	syncId,
}: E2ELatencyChartProps) {
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
				<LineChart
					data={chartData}
					syncId={syncId}
					syncMethod="value"
					onMouseMove={(state: any) => {
						const hoveredTimestamp =
							typeof state?.activeLabel === "string"
								? state.activeLabel
								: state?.activePayload?.[0]?.payload?.timestamp ?? null;
						onHoverBucket?.(hoveredTimestamp);
					}}
					onMouseLeave={() => onHoverBucket?.(null)}
				>
					<CartesianGrid
						strokeDasharray="3 3"
						stroke="rgba(148, 163, 184, 0.2)"
						vertical={false}
					/>
					<XAxis
						dataKey="timestamp"
						hide
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
					<RechartsTooltip
						cursor={{
							stroke: "hsl(var(--border))",
							strokeWidth: 1,
							strokeDasharray: "4 4",
						}}
						content={() => null}
						isAnimationActive={false}
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
						activeDot={{
							r: 4,
							strokeWidth: 2,
							stroke: e2eColor,
							fill: "hsl(var(--background))",
						}}
						connectNulls={true}
					/>
				</LineChart>
			</ResponsiveContainer>
		</ChartContainer>
	);
}
