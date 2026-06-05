"use client";

import { useState, type ReactNode } from "react";
import type {
	ModelPerformancePoint,
	ModelPerformanceSummary,
	ModelProviderDailyPoint,
} from "@/lib/fetchers/models/getModelPerformance";
import ModelProviderTrendChart from "./ModelProviderTrendChart";

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
}

export default function ModelPerformanceCards({
	summary,
	prevSummary,
	hourly,
	providerDaily7d,
}: ModelPerformanceCardsProps) {
	const [activeDay, setActiveDay] = useState<string | null>(null);
	void summary;
	void prevSummary;
	const hasHourly = hourly.some((point) => point.requests > 0);

	return (
		<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
			<MetricCard>
				<ModelProviderTrendChart
					title="Throughput"
					data={providerDaily7d}
					metric="throughput"
					activeDay={activeDay}
					onActiveDayChange={setActiveDay}
				/>
			</MetricCard>

			<MetricCard>
				<ModelProviderTrendChart
					title="Latency"
					data={providerDaily7d}
					metric="latency"
					activeDay={activeDay}
					onActiveDayChange={setActiveDay}
				/>
			</MetricCard>

			<MetricCard>
				<ModelProviderTrendChart
					title="E2E Latency"
					data={providerDaily7d}
					metric="generation"
					activeDay={activeDay}
					onActiveDayChange={setActiveDay}
				/>
			</MetricCard>

			{!hasHourly ? (
				<p className="text-xs text-muted-foreground md:col-span-2 lg:col-span-3">
					Low sample volume in the last 24 hours. Trend lines reflect up to 3
					active providers over the last 7 days.
				</p>
			) : null}
		</div>
	);
}
