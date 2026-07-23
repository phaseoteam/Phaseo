"use client";

import { useState, type ReactNode } from "react";
import type {
	ModelPerformancePoint,
	ModelPerformanceSummary,
	ModelProviderDailyPoint,
	ModelPerformanceQualityPoint,
} from "@/lib/fetchers/models/getModelPerformance";
import ModelProviderTrendChart from "./ModelProviderTrendChart";
import ModelQualityTrendChart from "./ModelQualityTrendChart";

function MetricCard({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<div className="min-w-0 rounded-lg border border-border/70 bg-background px-4 py-4">
			<div className="min-h-[228px] w-full min-w-0">{children}</div>
		</div>
	);
}

interface ModelPerformanceCardsProps {
	summary: ModelPerformanceSummary;
	prevSummary?: ModelPerformanceSummary | null;
	hourly: ModelPerformancePoint[];
	providerDaily7d: ModelProviderDailyPoint[];
	chartProviderDaily7d?: ModelProviderDailyPoint[];
	qualitySeries?: ModelPerformanceQualityPoint[];
}

export default function ModelPerformanceCards({
	summary,
	prevSummary,
	hourly,
	providerDaily7d,
	chartProviderDaily7d,
	qualitySeries = [],
}: ModelPerformanceCardsProps) {
	const [activeDay, setActiveDay] = useState<string | null>(null);
	void summary;
	void prevSummary;
	const hasHourly = hourly.some((point) => point.requests > 0);
	const hasToolCallQuality = qualitySeries.some((point) => point.toolCallSuccessPct != null);
	const hasStructuredOutputQuality = qualitySeries.some((point) => point.structuredOutputSuccessPct != null);
	const hasCacheQuality = qualitySeries.some((point) => point.cacheHitRatePct != null);
	const chartData = chartProviderDaily7d ?? providerDaily7d;
	const maxSeries = chartProviderDaily7d ? 5 : 3;

	return (
		<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
			<MetricCard>
				<ModelProviderTrendChart
					title="Throughput"
					data={chartData}
					metric="throughput"
					maxSeries={maxSeries}
					activeDay={activeDay}
					onActiveDayChange={setActiveDay}
				/>
			</MetricCard>

			{hasToolCallQuality ? (
				<ModelQualityTrendChart title="Tool call success" data={qualitySeries} metric="toolCallSuccessPct" />
			) : null}
			{hasStructuredOutputQuality ? (
				<ModelQualityTrendChart title="Structured output" data={qualitySeries} metric="structuredOutputSuccessPct" />
			) : null}
			{hasCacheQuality ? (
				<ModelQualityTrendChart title="Cache hit rate" data={qualitySeries} metric="cacheHitRatePct" />
			) : null}

			<MetricCard>
				<ModelProviderTrendChart
					title="Latency"
					data={chartData}
					metric="latency"
					maxSeries={maxSeries}
					activeDay={activeDay}
					onActiveDayChange={setActiveDay}
				/>
			</MetricCard>

			<MetricCard>
				<ModelProviderTrendChart
					title="E2E Latency"
					data={chartData}
					metric="generation"
					maxSeries={maxSeries}
					activeDay={activeDay}
					onActiveDayChange={setActiveDay}
				/>
			</MetricCard>

			{!hasHourly ? (
				<p className="text-xs text-muted-foreground md:col-span-2 lg:col-span-3">
					Low sample volume in the last 24 hours. Trend lines reflect {chartProviderDaily7d
						? "P50, P75, P90, P95, and P99 over the last 7 days."
						: "up to 3 active providers over the last 7 days."}
				</p>
			) : null}
		</div>
	);
}
