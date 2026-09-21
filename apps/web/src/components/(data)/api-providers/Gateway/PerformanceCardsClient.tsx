"use client";

import { useMemo, useState } from "react";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
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
import type { ProviderMetrics } from "@/lib/fetchers/api-providers/providerDataTypes";
import { cn } from "@/lib/utils";
import { E2ELatencyChart, LatencyChart, ThroughputChart } from "./PerformanceCharts";

export type Trend = "up" | "down" | "neutral";

export type MetricCardSummary = {
	title: string;
	value: number | null;
	delta?: number | null;
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

function formatMetricValue(
	metric: MetricKey,
	value: number | null,
	formatNumber: ReturnType<typeof useDisplayFormatters>["number"],
): string {
	if (value == null || !Number.isFinite(value)) return "-";
	if (metric === "throughput") {
		return `${formatNumber(value, {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		})} t/s`;
	}
	return `${formatNumber(value, { maximumFractionDigits: 0 })} ms`;
}

function DeltaPill({
	value,
	trend,
	invertColors = false,
	className,
}: {
	value: number;
	trend: Trend;
	invertColors?: boolean;
	className?: string;
}) {
	const format = useDisplayFormatters();
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
			aria-label={`Change ${format.number(value)} percent`}
		>
			<Icon className="h-3.5 w-3.5" aria-hidden />
			{value >= 0 ? "+" : "-"}
			{format.number(Math.abs(value), {
				minimumFractionDigits: 1,
				maximumFractionDigits: 1,
			})}%
		</span>
	);
}

function PerformanceCard({
	title,
	metric,
	value,
	delta,
	trend,
	invertDeltaColors = false,
	helpText,
	children,
}: {
	title: string;
	metric: MetricKey;
	value: number | null;
	delta?: number | null;
	trend?: Trend;
	invertDeltaColors?: boolean;
	helpText?: string;
	children: React.ReactNode;
}) {
	const format = useDisplayFormatters();
	const isEmpty = value == null || !Number.isFinite(value);
	const displayValue = isEmpty ? "-" : formatMetricValue(metric, value, format.number);

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
					{!isEmpty && delta != null ? (
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
	const format = useDisplayFormatters();
	return (
		<div className="mt-3">
			<div className="mb-2 text-center text-xs text-muted-foreground">
				{format.calendarDate(dateLabel, "")}
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
								className="truncate font-medium text-foreground underline decoration-transparent underline-offset-2 transition-colors hover:text-primary hover:decoration-current"
							>
								{item.label}
							</Link>
							<div className="inline-flex items-baseline gap-1 justify-self-end">
								<span className="text-[11px] text-muted-foreground">Avg</span>
								<span className="text-sm font-medium text-foreground">
									{formatMetricValue(metric, item.value, format.number)}
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

export default function PerformanceCardsClient(props: PerformanceCardsClientProps) {
	const hasPerformanceData = [
		...props.throughputData.map((point) => point.avgThroughput),
		...props.latencyData.map((point) => point.avgLatencyMs),
		...props.e2eLatencyData.map((point) => point.avgGenerationMs),
	].some((value) => value != null && Number.isFinite(value));
	if (hasPerformanceData) return <PerformanceCardsWithData {...props} />;
	return (
		<div className="overflow-hidden rounded-lg border border-border/70 bg-background">
			<div className="grid grid-cols-1 divide-y divide-border/70 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
				{[props.summary.throughput, props.summary.latency, props.summary.e2e].map((metric) => (
					<div key={metric.title} className="min-w-0 px-3 py-4 sm:px-5">
						<p className="truncate text-xs font-medium text-muted-foreground">{metric.title}</p>
						<p className="mt-1 text-xl font-semibold tracking-tight">—</p>
					</div>
				))}
			</div>
			<p className="border-t border-border/70 px-3 py-3 text-sm text-muted-foreground sm:px-5">Performance metrics will appear after this provider serves gateway traffic.</p>
		</div>
	);
}

function PerformanceCardsWithData({
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
	const bucketsWithData = useMemo(() => {
		return new Set(
			availableBuckets.filter((bucket) => {
				const day = dailyModelLeaderboards[bucket];
				if (!day) return false;
				return (
					day.throughput.length > 0 ||
					day.latency.length > 0 ||
					day.e2e.length > 0
				);
			}),
		);
	}, [availableBuckets, dailyModelLeaderboards]);

	const hasBucket = (bucket: string | null): boolean =>
		Boolean(bucket && dailyModelLeaderboards[bucket]);
	const hasDataForBucket = (bucket: string | null): boolean =>
		Boolean(bucket && bucketsWithData.has(bucket));

	const latestBucket = availableBuckets[availableBuckets.length - 1] ?? null;
	const latestBucketWithData = useMemo(() => {
		for (let i = availableBuckets.length - 1; i >= 0; i -= 1) {
			const bucket = availableBuckets[i];
			if (bucketsWithData.has(bucket)) return bucket;
		}
		return null;
	}, [availableBuckets, bucketsWithData]);
	const activeBucket = hasBucket(hoveredBucket)
		? hoveredBucket
		: hasDataForBucket(todayBucket)
			? todayBucket
			: hasDataForBucket(yesterdayBucket)
				? yesterdayBucket
				: latestBucketWithData ?? latestBucket;

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
		<div className="grid grid-cols-1 divide-y divide-border/70 overflow-hidden rounded-lg border border-border/70 bg-background md:grid-cols-3 md:divide-x md:divide-y-0 *:min-w-0">
			<PerformanceCard
				title={summary.throughput.title}
				metric="throughput"
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
				metric="latency"
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
				metric="e2e"
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
