"use client";

import ModelPerformanceCards from "./ModelPerformanceCards";
import ModelSuccessChart from "./ModelSuccessChart";
import ModelTokenTrajectoryChart from "./ModelTokenTrajectory";
import { Activity } from "lucide-react";
import type { ModelPerformanceMetrics } from "@/lib/fetchers/models/getModelPerformance";
import type { ModelTokenTrajectory } from "@/lib/fetchers/models/getModelTokenTrajectory";
import { Card } from "@/components/ui/card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";

interface ModelPerformanceDashboardProps {
	metrics: ModelPerformanceMetrics;
	tokenTrajectory: ModelTokenTrajectory | null;
	mode?: "overview" | "page";
}

function formatReleaseDate(date: string | null | undefined): string | null {
	if (!date) return null;
	const parsed = new Date(date);
	if (!Number.isFinite(parsed.getTime())) return null;
	return parsed.toLocaleDateString("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

export default function ModelPerformanceDashboard({
	metrics,
	tokenTrajectory,
	mode = "overview",
}: ModelPerformanceDashboardProps) {
	const hasTelemetry =
		metrics.summary.totalRequests > 0 ||
		metrics.hourly.some((point) => point.requests > 0);
	const showDetailedPanels = mode === "page";
	const cumulativeTokens =
		metrics.cumulativeTokens != null
			? Math.round(metrics.cumulativeTokens).toLocaleString()
			: "N/A";
	const cumulativeSince = formatReleaseDate(metrics.releaseDate);

	return (
		<section className="space-y-10">
			{hasTelemetry ? (
				<>
					<ModelPerformanceCards
						summary={metrics.summary}
						prevSummary={metrics.prevSummary}
						hourly={metrics.hourly}
						providerDaily7d={metrics.providerDaily7d}
					/>
					{showDetailedPanels ? (
						<>
							<Card className="px-5 py-4">
								<div className="flex flex-wrap items-center justify-between gap-2">
									<div className="space-y-1">
										<p className="text-[11px] uppercase tracking-wide text-muted-foreground">
											Cumulative Tokens
										</p>
										<p className="text-2xl font-semibold text-foreground">
											{cumulativeTokens}
										</p>
									</div>
									<p className="text-xs text-muted-foreground">
										{cumulativeSince
											? `Since ${cumulativeSince}`
											: "Since model release"}
									</p>
								</div>
							</Card>
							<ModelSuccessChart successSeries={metrics.successSeries} />
							<ModelTokenTrajectoryChart data={tokenTrajectory} />
						</>
					) : null}
				</>
			) : (
				<Empty className="rounded-lg border p-8">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Activity className="size-5" />
						</EmptyMedia>
						<EmptyTitle>No gateway telemetry yet</EmptyTitle>
						<EmptyDescription>
							This model hasn't processed any gateway traffic in the selected
							window. Live charts will appear as soon as requests arrive.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
		</section>
	);
}
