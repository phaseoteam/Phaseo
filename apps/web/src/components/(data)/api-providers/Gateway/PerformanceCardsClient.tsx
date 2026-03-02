"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
	Minus,
	TrendingDown,
	TrendingUp,
} from "lucide-react";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@/components/ui/empty";
import type { ProviderMetrics } from "@/lib/fetchers/api-providers/getProviderMetrics";
import { cn } from "@/lib/utils";
import { E2ELatencyChart, LatencyChart, ThroughputChart } from "./PerformanceCharts";

export type Trend = "up" | "down" | "neutral";

export type MetricCardSummary = {
	title: string;
	value: string;
	delta?: string;
	trend: Trend;
	helpText?: string;
};

type MetricKey = "throughput" | "latency" | "e2e";

type PerformanceCardsClientProps = {
	throughputData: Array<{ timestamp: string; avgThroughput: number | null }>;
	latencyData: Array<{ timestamp: string; avgLatencyMs: number | null }>;
	e2eLatencyData: Array<{ timestamp: string; avgGenerationMs: number | null }>;
	dailyModelLeaderboards: ProviderMetrics["dailyModelLeaderboards"];
	summary: {
		throughput: MetricCardSummary;
		latency: MetricCardSummary;
		e2e: MetricCardSummary;
	};
};

function toUtcBucket(date: Date): string {
	const bucket = new Date(date);
	bucket.setUTCHours(0, 0, 0, 0);
	return bucket.toISOString();
}

function formatBucketDate(timestamp: string | null): string {
	if (!timestamp) return "";
	const date = new Date(timestamp);
	if (!Number.isFinite(date.getTime())) return "";
	return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatMetricValue(metric: MetricKey, value: number | null): string {
	if (value == null || !Number.isFinite(value)) return "-";
	if (metric === "throughput") return `${value.toFixed(2)} t/s`;
	return `${Math.round(value)} ms`;
}

function DeltaPill({
	value,
	trend,
	invertColors = false,
	className,
}: {
	value: string;
	trend: Trend;
	invertColors?: boolean;
	className?: string;
}) {
	const isPositive = trend === "up";
	const isNeutral = trend === "neutral";
	const isGood = invertColors ? !isPositive : isPositive;

	let styles: string;
	let Icon: React.ComponentType<any>;

	if (isNeutral) {
		styles = "bg-gray-50 text-gray-700 dark:bg-gray-500/10 dark:text-gray-200";
		Icon = Minus;
	} else {
		styles = isGood
			? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200"
			: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200";
		Icon = trend === "down" ? TrendingDown : TrendingUp;
	}

	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
				"ring-1 ring-inset ring-black/5 dark:ring-white/5",
				styles,
				className,
			)}
			aria-label={`Change ${value}`}
		>
			<Icon className="h-3.5 w-3.5" aria-hidden />
			{value}
		</span>
	);
}

function PerformanceCard({
	title,
	value,
	delta,
	trend,
	invertDeltaColors = false,
	helpText,
	children,
}: {
	title: string;
	value: string;
	delta?: string;
	trend?: Trend;
	invertDeltaColors?: boolean;
	helpText?: string;
	children: React.ReactNode;
}) {
	const isEmpty = value.trim() === "--" || value.trim() === "-";
	const displayValue = isEmpty ? "-" : value;

	return (
		<div className="space-y-4 px-0 py-4 md:px-6">
			<div className="space-y-3">
				<div className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground">
					<span>{title}</span>
				</div>
				<div className="flex items-center gap-3">
					<span className="text-3xl font-semibold tracking-tight leading-none text-foreground">
						{displayValue}
					</span>
					{!isEmpty && delta ? (
						<DeltaPill
							value={delta}
							trend={trend ?? "neutral"}
							invertColors={invertDeltaColors}
						/>
					) : null}
				</div>
			</div>
			<div className="pt-2">{children}</div>
		</div>
	);
}

function MiniModelLeaderboard({
	metric,
	dateLabel,
	items,
}: {
	metric: MetricKey;
	dateLabel: string | null;
	items: ProviderMetrics["dailyModelLeaderboards"][string]["throughput"];
}) {
	return (
		<div className="mt-3">
			<div className="mb-2 text-center text-xs text-muted-foreground">
				{formatBucketDate(dateLabel)}
			</div>
			{items.length > 0 ? (
				<div className="space-y-1.5">
					{items.map((item) => (
						<div
							key={`${metric}-${item.id}`}
							className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border/50 py-1.5 text-sm last:border-b-0"
						>
							<Link
								href={`/models/${item.id}`}
								className="truncate font-medium text-foreground hover:text-primary"
							>
								{item.label}
							</Link>
							<div className="inline-flex items-baseline gap-1 justify-self-end">
								<span className="text-[11px] text-muted-foreground">Avg</span>
								<span className="text-sm font-medium text-foreground">
									{formatMetricValue(metric, item.value)}
								</span>
							</div>
						</div>
					))}
				</div>
			) : (
				<Empty size="compact" className="min-h-[88px]">
					<EmptyHeader className="gap-1">
						<EmptyTitle className="text-sm">No model data for this day</EmptyTitle>
						<EmptyDescription className="text-xs">
							Move across the chart to inspect another date.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
		</div>
	);
}

export default function PerformanceCardsClient({
	throughputData,
	latencyData,
	e2eLatencyData,
	dailyModelLeaderboards,
	summary,
}: PerformanceCardsClientProps) {
	const [hoveredBucket, setHoveredBucket] = useState<string | null>(null);
	const syncId = "provider-performance-sync";

	const todayBucket = useMemo(() => toUtcBucket(new Date()), []);
	const yesterdayBucket = useMemo(
		() => toUtcBucket(new Date(Date.now() - 24 * 60 * 60 * 1000)),
		[],
	);
	const availableBuckets = useMemo(
		() => Object.keys(dailyModelLeaderboards).sort(),
		[dailyModelLeaderboards],
	);

	const hasBucket = (bucket: string | null): boolean =>
		Boolean(bucket && dailyModelLeaderboards[bucket]);

	const latestBucket = availableBuckets[availableBuckets.length - 1] ?? null;
	const activeBucket = hasBucket(hoveredBucket)
		? hoveredBucket
		: hasBucket(todayBucket)
			? todayBucket
			: hasBucket(yesterdayBucket)
				? yesterdayBucket
				: latestBucket;

	const throughputLeaderboard = activeBucket
		? dailyModelLeaderboards[activeBucket]?.throughput ?? []
		: [];
	const latencyLeaderboard = activeBucket
		? dailyModelLeaderboards[activeBucket]?.latency ?? []
		: [];
	const e2eLeaderboard = activeBucket
		? dailyModelLeaderboards[activeBucket]?.e2e ?? []
		: [];

	return (
		<div className="grid grid-cols-1 divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0 *:min-w-0">
			<PerformanceCard
				title={summary.throughput.title}
				value={summary.throughput.value}
				delta={summary.throughput.delta}
				trend={summary.throughput.trend}
				helpText={summary.throughput.helpText}
			>
				<ThroughputChart
					data={throughputData}
					onHoverBucket={setHoveredBucket}
					syncId={syncId}
				/>
				<MiniModelLeaderboard
					metric="throughput"
					dateLabel={activeBucket}
					items={throughputLeaderboard}
				/>
			</PerformanceCard>

			<PerformanceCard
				title={summary.latency.title}
				value={summary.latency.value}
				delta={summary.latency.delta}
				trend={summary.latency.trend}
				helpText={summary.latency.helpText}
				invertDeltaColors={true}
			>
				<LatencyChart
					data={latencyData}
					onHoverBucket={setHoveredBucket}
					syncId={syncId}
				/>
				<MiniModelLeaderboard
					metric="latency"
					dateLabel={activeBucket}
					items={latencyLeaderboard}
				/>
			</PerformanceCard>

			<PerformanceCard
				title={summary.e2e.title}
				value={summary.e2e.value}
				delta={summary.e2e.delta}
				trend={summary.e2e.trend}
				helpText={summary.e2e.helpText}
				invertDeltaColors={true}
			>
				<E2ELatencyChart
					data={e2eLatencyData}
					onHoverBucket={setHoveredBucket}
					syncId={syncId}
				/>
				<MiniModelLeaderboard
					metric="e2e"
					dateLabel={activeBucket}
					items={e2eLeaderboard}
				/>
			</PerformanceCard>
		</div>
	);
}
