"use client";

import ModelPerformanceCards from "./ModelPerformanceCards";
import ModelProviderPerformanceTable from "./ModelProviderPerformanceTable";
import ModelSuccessChart from "./ModelSuccessChart";
import ModelTimeOfDayChart from "./ModelTimeOfDayChart";
import ModelTokenTrajectoryChart from "./ModelTokenTrajectory";
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
import { Activity } from "lucide-react";

interface ModelPerformanceDashboardProps {
	metrics: ModelPerformanceMetrics;
	tokenTrajectory: ModelTokenTrajectory | null;
}

export default function ModelPerformanceDashboard({
	metrics,
	tokenTrajectory,
}: ModelPerformanceDashboardProps) {
	const hasTelemetry =
		metrics.summary.totalRequests > 0 ||
		metrics.hourly.some((point) => point.requests > 0);

	console.log(`[dash] hasTelemetry=${hasTelemetry} reqs=${metrics.summary.totalRequests} hourlyWithReqs=${metrics.hourly.filter(p => p.requests > 0).length} providers=${metrics.providerPerformance.length}`);

	return (
		<section className="space-y-10">
			{hasTelemetry ? (
				<>
					<ModelPerformanceCards
						summary={metrics.summary}
						prevSummary={metrics.prevSummary}
						hourly={metrics.hourly}
					/>
					<ModelProviderPerformanceTable
						providers={metrics.providerPerformance}
					/>
					<ModelSuccessChart successSeries={metrics.successSeries} />
					<ModelTimeOfDayChart timeOfDay={metrics.timeOfDay} />
					<ModelTokenTrajectoryChart data={tokenTrajectory} />
				</>
			) : (
				<Card className="p-6">
					<Empty size="compact">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<Activity />
							</EmptyMedia>
							<EmptyTitle>No gateway telemetry yet</EmptyTitle>
							<EmptyDescription>
								This model hasn’t processed any gateway traffic
								in the selected window. Live charts will appear
								as soon as requests arrive.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				</Card>
			)}
		</section>
	);
}
