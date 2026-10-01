"use client";

import { Maximize2 } from "lucide-react";
import { useTranslations } from "next-intl";
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
	labelKey: string;
	descriptionKey: string;
};

const METRICS: MetricDefinition[] = [
	{
		metric: "throughput",
		valueKey: "avgThroughput",
		labelKey: "throughput",
		descriptionKey: "metricDescriptions.throughputCard",
	},
	{
		metric: "latency",
		valueKey: "avgLatencyMs",
		labelKey: "latency",
		descriptionKey: "metricDescriptions.latencyCard",
	},
	{
		metric: "endToEnd",
		valueKey: "avgEndToEndMs",
		labelKey: "endToEndLatency",
		descriptionKey: "metricDescriptions.endToEndCard",
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
) {
	if (!hasPercentileSeries || detailed) return detailData;
	const definition = METRIC_DEFINITIONS[metric];
	return cardData.some((point) =>
		isUsableMetricValue(metric, point[definition.valueKey]),
	)
		? cardData
		: detailData;
}

interface ModelPerformanceCardsProps {
	summary: ModelPerformanceSummary;
	prevSummary?: ModelPerformanceSummary | null;
	hourly: ModelPerformancePoint[];
	providerDaily7d: ModelProviderDailyPoint[];
	providerHourly7d: ModelProviderHourlyPoint[];
	qualitySeries?: ModelPerformanceQualityPoint[];
}

export default function ModelPerformanceCards({
	summary,
	prevSummary,
	hourly,
	providerDaily7d,
	providerHourly7d,
	qualitySeries = [],
}: ModelPerformanceCardsProps) {
	const t = useTranslations("Catalogue.modelDetail.performance");
	void summary;
	void prevSummary;
	const hasHourly = hourly.some((point) => point.requests > 0);
	const usesHourlyData = providerHourly7d.length > 0;
	const detailData: ModelProviderTrendPoint[] = usesHourlyData
		? providerHourly7d
		: providerDaily7d;
	const cardData = detailData;
	const providerCount = new Set(
		detailData
			.filter((point) => point.requests > 0)
			.map((point) => point.provider),
	).size;
	const metrics = METRICS.map((definition) => ({
		...definition,
		label: t(definition.labelKey as never),
		description: t(definition.descriptionKey as never),
	}));
	const metricData = (metric: MetricKey, detailed: boolean) =>
		selectMetricData(
			metric,
			detailed,
			detailData,
			cardData,
			false,
		);
	return (
		<div className="space-y-4">
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
				{metrics.map((definition) => (
					<Dialog key={definition.metric}>
						<div className="min-w-0 rounded-lg border border-border/70 bg-background px-4 py-4">
							<ModelProviderTrendChart
								title={definition.label}
								data={metricData(definition.metric, false)}
								metric={definition.metric}
								maxSeries={3}
								timeResolution={usesHourlyData ? "hour" : "day"}
								headerAction={
									<DialogTrigger asChild>
										<button
											type="button"
											className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
												aria-label={t("expandMetric", { metric: definition.label } as never)}
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
									{t("metricDialogDescription", {
										description: definition.description,
										count: providerCount,
										resolution: usesHourlyData ? "hour" : "day",
									} as never)}
								</DialogDescription>
							</DialogHeader>
							<div className="h-full min-h-0 overflow-hidden rounded-lg border border-border/70 bg-background p-4">
								<ModelProviderTrendChart
									title={definition.label}
									data={metricData(definition.metric, true)}
									metric={definition.metric}
									maxSeries={Number.MAX_SAFE_INTEGER}
									timeResolution={usesHourlyData ? "hour" : "day"}
									detailed
									showHeader={false}
								/>
							</div>
						</DialogContent>
					</Dialog>
				))}
			</div>

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
				<ModelQualityTrendChart
					title={t("qualityMetrics.toolCallErrors.label" as never)}
					data={qualitySeries}
					metric="toolCallErrorPct"
				/>
				<ModelQualityTrendChart
					title={t("qualityMetrics.structuredResponseErrors.label" as never)}
					data={qualitySeries}
					metric="structuredOutputErrorPct"
				/>
				<ModelQualityTrendChart
					title={t("qualityMetrics.cacheHitRate.label" as never)}
					data={qualitySeries}
					metric="cacheHitRatePct"
				/>
			</div>

			{!hasHourly ? (
				<p className="text-xs text-muted-foreground">
					{t("lowSampleVolume")}
				</p>
			) : null}
		</div>
	);
}
