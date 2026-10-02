"use client";

import { Maximize2 } from "lucide-react";
import { useTranslations } from "next-intl";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import type {
	ModelPerformanceQualityPoint,
	ModelProviderHourlyPoint,
} from "@/lib/fetchers/models/getModelPerformance";
import ModelProviderTrendChart from "./ModelProviderTrendChart";

type QualityMetric =
	| "toolCallSuccessPct"
	| "toolCallErrorPct"
	| "structuredOutputSuccessPct"
	| "structuredOutputErrorPct"
	| "cacheHitRatePct";

const METRICS: Record<QualityMetric, {
	messageKey: string;
	color: string;
}> = {
	toolCallSuccessPct: {
		messageKey: "toolCallSuccess",
		color: "hsl(221, 83%, 53%)",
	},
	toolCallErrorPct: {
		messageKey: "toolCallErrors",
		color: "hsl(0, 72%, 51%)",
	},
	structuredOutputSuccessPct: {
		messageKey: "structuredOutput",
		color: "hsl(262, 83%, 58%)",
	},
	structuredOutputErrorPct: {
		messageKey: "structuredResponseErrors",
		color: "hsl(25, 95%, 53%)",
	},
	cacheHitRatePct: {
		messageKey: "cacheHitRate",
		color: "hsl(142, 71%, 45%)",
	},
};

export default function ModelQualityTrendChart({
	title,
	data,
	metric,
}: {
	title: string;
	data: ModelPerformanceQualityPoint[];
	metric: QualityMetric;
}) {
	const t = useTranslations("Catalogue.modelDetail.performance");
	const config = METRICS[metric];
	const label = t(`qualityMetrics.${config.messageKey}.label` as never);
	const description = t(`qualityMetrics.${config.messageKey}.description` as never);
	const emptyMessage = t(`qualityMetrics.${config.messageKey}.emptyMessage` as never);
	const metricData: ModelProviderHourlyPoint[] = data.map((point) => ({
		bucket: point.bucket,
		provider: "all-providers",
		providerName: t("allProviders"),
		providerColor: config.color,
		avgThroughput: null,
		avgLatencyMs: null,
		avgGenerationMs: null,
		cachedInputPct: point[metric] ?? null,
		requests: point.requests,
	}));

	return (
		<Dialog>
			<div className="min-w-0 rounded-lg border border-border/70 bg-background px-4 py-4">
				<ModelProviderTrendChart
					title={title}
					data={metricData}
					metric="cachedInput"
					metricInfoLabel={label}
					metricDescription={description}
					metricAxisLabel={t("axisPercent")}
					emptyMessage={emptyMessage}
					maxSeries={1}
					timeResolution="hour"
					headerAction={
						<DialogTrigger asChild>
							<button
								type="button"
								className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
								aria-label={t("expandMetric", { metric: title } as never)}
							>
								<Maximize2 className="size-3.5" />
							</button>
						</DialogTrigger>
					}
				/>
			</div>
			<DialogContent className="h-[min(90vh,850px)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden sm:max-w-5xl">
				<DialogHeader className="pr-10">
					<DialogTitle className="text-xl">{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				<div className="h-full min-h-0 overflow-hidden rounded-lg border border-border/70 bg-background p-4">
					<ModelProviderTrendChart
						title={title}
						data={metricData}
						metric="cachedInput"
						metricInfoLabel={label}
						metricDescription={description}
						metricAxisLabel={t("axisPercent")}
						emptyMessage={emptyMessage}
						maxSeries={1}
						timeResolution="hour"
						detailed
						showHeader={false}
					/>
				</div>
			</DialogContent>
		</Dialog>
	);
}
