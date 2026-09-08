"use client";

import { Maximize2 } from "lucide-react";
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
	label: string;
	description: string;
	emptyMessage: string;
	color: string;
}> = {
	toolCallSuccessPct: {
		label: "Tool call success",
		description: "Share of observed tool-calling requests that completed with a successful tool call.",
		emptyMessage: "No tool-call attempts were recorded in this period.",
		color: "hsl(221, 83%, 53%)",
	},
	toolCallErrorPct: {
		label: "Tool Call Errors",
		description: "Share of generated tool calls with invalid JSON arguments, a schema mismatch, or an unknown tool name. Historical traffic without response validation is shown as 0%.",
		emptyMessage: "No validated tool-call responses were recorded in this period.",
		color: "hsl(0, 72%, 51%)",
	},
	structuredOutputSuccessPct: {
		label: "Structured output",
		description: "Share of structured-output attempts that returned a valid structured response.",
		emptyMessage: "No structured-response attempts were recorded in this period.",
		color: "hsl(262, 83%, 58%)",
	},
	structuredOutputErrorPct: {
		label: "Structured Response Errors",
		description: "Share of requested structured responses with invalid JSON, a schema mismatch, or no structured output. Historical traffic without response validation is shown as 0%.",
		emptyMessage: "No validated structured responses were recorded in this period.",
		color: "hsl(25, 95%, 53%)",
	},
	cacheHitRatePct: {
		label: "Cache Hit Rate",
		description: "Cached read tokens as a percentage of reported input tokens.",
		emptyMessage: "Not enough input-token and cache-read telemetry was recorded in this period.",
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
	const config = METRICS[metric];
	const metricData: ModelProviderHourlyPoint[] = data.map((point) => ({
		bucket: point.bucket,
		provider: "all-providers",
		providerName: "All providers",
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
					metricInfoLabel={config.label}
					metricDescription={config.description}
					emptyMessage={config.emptyMessage}
					maxSeries={1}
					timeResolution="hour"
					headerAction={
						<DialogTrigger asChild>
							<button
								type="button"
								className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
								aria-label={`Expand ${title}`}
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
					<DialogDescription>{config.description}</DialogDescription>
				</DialogHeader>
				<div className="h-full min-h-0 overflow-hidden rounded-lg border border-border/70 bg-background p-4">
					<ModelProviderTrendChart
						title={title}
						data={metricData}
						metric="cachedInput"
						metricInfoLabel={config.label}
						metricDescription={config.description}
						emptyMessage={config.emptyMessage}
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
