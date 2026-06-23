"use client";

import ModelPerformanceCards from "./ModelPerformanceCards";
import { Activity } from "lucide-react";
import type { ModelPerformanceMetrics } from "@/lib/fetchers/models/getModelPerformance";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";

interface ModelPerformanceDashboardProps {
	metrics: ModelPerformanceMetrics;
}

export default function ModelPerformanceDashboard({
	metrics,
}: ModelPerformanceDashboardProps) {
	const hasTelemetry =
		metrics.summary.totalRequests > 0 ||
		metrics.hourly.some((point) => point.requests > 0);

	return (
		<section className="space-y-10">
			{hasTelemetry ? (
				<ModelPerformanceCards
					summary={metrics.summary}
					prevSummary={metrics.prevSummary}
					hourly={metrics.hourly}
					providerDaily7d={metrics.providerDaily7d}
				/>
			) : (
				<Empty className="rounded-lg border p-8">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Activity className="size-5" />
						</EmptyMedia>
						<EmptyTitle>No gateway telemetry yet</EmptyTitle>
						<EmptyDescription>
							This model has not processed any gateway traffic in the selected
							window. Live charts will appear as soon as requests arrive.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
		</section>
	);
}
