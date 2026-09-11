"use client";

import { Maximize2 } from "lucide-react";
import type {
	ModelPerformancePoint,
	ModelPerformanceSummary,
	ModelProviderDailyPoint,
	ModelProviderHourlyPoint,
	ModelProviderTrendPoint,
	ModelPerformanceQualityPoint,
} from "@/lib/fetchers/models/getModelPerformance";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import ModelProviderTrendChart, {
	isUsableMetricValue,
	type MetricKey,
} from "./ModelProviderTrendChart";
import ModelQualityTrendChart from "./ModelQualityTrendChart";

type MetricValueKey =
	| "avgThroughput"
	| "avgOutputSpeed"
	| "avgLatencyMs"
	| "avgEndToEndMs"
	| "avgGenerationMs"
	| "avgPhaseoOverheadMs"
	| "avgTpotMs"
	| "avgItlMs"
	| "cachedInputPct";

type MetricDefinition = {
	metric: MetricKey;
	valueKey: MetricValueKey;
	label: string;
	description: string;
};

const METRICS: MetricDefinition[] = [
	{
		metric: "throughput",
		valueKey: "avgThroughput",
		label: "Throughput",
		description: "Output tokens per second across the complete provider request.",
	},
	{
		metric: "latency",
		valueKey: "avgLatencyMs",
		label: "Latency",
		description: "Time from request start until the first generated output arrives.",
	},
	{
		metric: "endToEnd",
		valueKey: "avgEndToEndMs",
		label: "End-to-End Latency",
		description: "Total time from request start until the complete response is returned.",
	},
	{
		metric: "cachedInput",
		valueKey: "cachedInputPct",
		label: "Cache Rate",
		description: "Share of reported input tokens served from the provider cache.",
	},
];

const METRIC_DEFINITIONS = Object.fromEntries(
	METRICS.map((definition) => [definition.metric, definition]),
) as Record<MetricKey, MetricDefinition>;

export function selectMetricData(
	metric: MetricKey,
	detailed: boolean,
	detailData: ModelProviderTrendPoint[],
	cardData: ModelProviderTrendPoint[],
	hasPercentileSeries: boolean,
	fallbackData: ModelProviderTrendPoint[] = detailData,
) {
	const definition = METRIC_DEFINITIONS[metric];
	if (
		!hasPercentileSeries ||
		!detailData.some((point) =>
			isUsableMetricValue(metric, point[definition.valueKey]),
		)
	) {
		return fallbackData;
	}
	if (detailed) return detailData;
	return cardData.some((point) =>
		isUsableMetricValue(metric, point[definition.valueKey]),
	)
		? cardData
		: detailData;
}

export function hasQualityMetricData(
	metric: "toolCallErrorPct" | "structuredOutputErrorPct" | "cacheHitRatePct",
	qualitySeries: ModelPerformanceQualityPoint[],
) {
	return qualitySeries.some((point) => {
		if (metric === "toolCallErrorPct") {
			return point[metric] != null && !point.toolCallHistoricalDefault;
		}
		if (metric === "structuredOutputErrorPct") {
			return point[metric] != null && !point.structuredOutputHistoricalDefault;
		}
		return point[metric] != null;
	});
}

interface ModelPerformanceCardsProps {
	summary: ModelPerformanceSummary;
	prevSummary?: ModelPerformanceSummary | null;
	hourly: ModelPerformancePoint[];
	providerDaily7d: ModelProviderDailyPoint[];
	providerHourly7d: ModelProviderHourlyPoint[];
	chartProviderDaily7d?: ModelProviderDailyPoint[];
	qualitySeries?: ModelPerformanceQualityPoint[];
}

export default function ModelPerformanceCards({
	summary,
	prevSummary,
	hourly,
	providerDaily7d,
	providerHourly7d,
	chartProviderDaily7d,
	qualitySeries = [],
}: ModelPerformanceCardsProps) {
	void summary;
	void prevSummary;
	const hasHourly = hourly.some((point) => point.requests > 0);
	const usesHourlyData = providerHourly7d.length > 0;
	const providerData: ModelProviderTrendPoint[] = usesHourlyData
		? providerHourly7d
		: providerDaily7d;
	const detailData: ModelProviderTrendPoint[] =
		chartProviderDaily7d ?? providerData;
	const cardData = chartProviderDaily7d
		? chartProviderDaily7d.filter((point) =>
				["percentile-10", "percentile-50", "percentile-90"].includes(
					point.provider,
				),
			)
		: providerData;
	const providerCount = new Set(
		providerData
			.filter((point) => point.requests > 0)
			.map((point) => point.provider),
	).size;
	const detailSeriesLabel = chartProviderDaily7d
		? "All available percentile bands"
		: `${usesHourlyData ? "Hourly observations for" : "Daily observations for"} all ${providerCount.toLocaleString()} recorded provider${providerCount === 1 ? "" : "s"}`;
	const metricUsesPercentiles = (metric: MetricKey) => {
		if (!chartProviderDaily7d) return false;
		const definition = METRIC_DEFINITIONS[metric];
		return chartProviderDaily7d.some((point) =>
			isUsableMetricValue(metric, point[definition.valueKey]),
		);
	};
	const metricData = (metric: MetricKey, detailed: boolean) =>
		selectMetricData(
			metric,
			detailed,
			detailData,
			cardData,
			chartProviderDaily7d != null,
			providerData,
		);
	const metricTimeResolution = (metric: MetricKey) =>
		metricUsesPercentiles(metric) ? "day" : usesHourlyData ? "hour" : "day";
	const metricSeriesLabel = (metric: MetricKey) =>
		metricUsesPercentiles(metric)
			? detailSeriesLabel
			: `${usesHourlyData ? "Hourly observations for" : "Daily observations for"} all ${providerCount.toLocaleString()} recorded provider${providerCount === 1 ? "" : "s"}`;
	const qualityMetrics = [
		{
			title: "Tool Call Errors",
			metric: "toolCallErrorPct" as const,
		},
		{
			title: "Structured Response Errors",
			metric: "structuredOutputErrorPct" as const,
		},
	].filter(({ metric }) => hasQualityMetricData(metric, qualitySeries));
	return (
		<div className="space-y-4">
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
				{METRICS.map((definition) => (
					<Dialog key={definition.metric}>
						<div className="min-w-0 rounded-lg border border-border/70 bg-background px-4 py-4">
							<ModelProviderTrendChart
								title={definition.label}
								data={metricData(definition.metric, false)}
								metric={definition.metric}
								maxSeries={3}
								timeResolution={metricTimeResolution(definition.metric)}
								headerAction={
									<DialogTrigger asChild>
										<button
											type="button"
											className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
											aria-label={`Expand ${definition.label}`}
										>
											<Maximize2 className="size-3.5" />
										</button>
									</DialogTrigger>
								}
							/>
						</div>
						<DialogContent className="h-[min(90vh,850px)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden sm:max-w-5xl">
							<DialogHeader className="pr-10">
								<DialogTitle className="text-xl">{definition.label}</DialogTitle>
								<DialogDescription>
									{definition.description}{" "}
									{metricSeriesLabel(definition.metric)}{" "}
									are shown below.
								</DialogDescription>
							</DialogHeader>
							<div className="h-full min-h-0 overflow-hidden rounded-lg border border-border/70 bg-background p-4">
								<ModelProviderTrendChart
									title={definition.label}
									data={metricData(definition.metric, true)}
									metric={definition.metric}
									maxSeries={Number.MAX_SAFE_INTEGER}
									timeResolution={metricTimeResolution(definition.metric)}
									detailed
									showHeader={false}
								/>
							</div>
						</DialogContent>
					</Dialog>
				))}
			</div>

			{qualityMetrics.length > 0 ? (
				<div className="grid items-start gap-4 md:grid-cols-2 lg:grid-cols-3">
					{qualityMetrics.map(({ title, metric }) => (
						<ModelQualityTrendChart
							key={metric}
							title={title}
							data={qualitySeries}
							metric={metric}
						/>
					))}
				</div>
			) : null}

			{!hasHourly ? (
				<p className="text-xs text-muted-foreground">
					Low sample volume in the last 24 hours. Trends use the available{" "}
					seven-day history.
				</p>
			) : null}
		</div>
	);
}
