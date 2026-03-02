import { getProviderMetrics } from "@/lib/fetchers/api-providers/getProviderMetrics";
import PerformanceCardsClient, {
	type MetricCardSummary,
	type Trend,
} from "./PerformanceCardsClient";

function calculateDelta(
	data: Array<{
		avgThroughput?: number | null;
		avgLatencyMs?: number | null;
		avgGenerationMs?: number | null;
	}>,
	key: "avgThroughput" | "avgLatencyMs" | "avgGenerationMs"
): { value: string; trend: Trend } {
	if (data.length < 2) return { value: "+0.0%", trend: "neutral" };

	const last = data[data.length - 1]?.[key];
	const previous = data[data.length - 2]?.[key];
	if (last == null || previous == null || previous === 0) {
		return { value: "+0.0%", trend: "neutral" };
	}

	const delta = ((last - previous) / previous) * 100;
	return {
		value: `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`,
		trend: delta > 0 ? "up" : delta < 0 ? "down" : "neutral",
	};
}

export default async function PerformanceCards({
	params,
}: {
	params?: Promise<{ apiProvider: string }> | { apiProvider: string };
}) {
	const resolvedParams = params ? await params : undefined;
	const apiProvider = resolvedParams?.apiProvider ?? "";

	const metrics = await getProviderMetrics(apiProvider, 24 * 7);

	const throughputData = metrics.timeseries.throughput;
	const latencyData = metrics.timeseries.latency;
	const e2eLatencyData = metrics.timeseries.latency.map((point) => ({
		timestamp: point.timestamp,
		avgGenerationMs: point.avgGenerationMs,
	}));

	const throughputDelta = calculateDelta(throughputData, "avgThroughput");
	const latencyDelta = calculateDelta(latencyData, "avgLatencyMs");
	const e2eDelta = calculateDelta(e2eLatencyData, "avgGenerationMs");

	const summary: {
		throughput: MetricCardSummary;
		latency: MetricCardSummary;
		e2e: MetricCardSummary;
	} = {
		throughput: {
			title: "Throughput",
			value:
				metrics.summary.avgThroughput != null
					? `${metrics.summary.avgThroughput.toFixed(2)} t/s`
					: "-",
			delta: throughputDelta.value,
			trend: throughputDelta.trend,
			helpText: "Median throughput per day across all requests.",
		},
		latency: {
			title: "Latency",
			value:
				metrics.summary.avgLatencyMs != null
					? `${Math.round(metrics.summary.avgLatencyMs)} ms`
					: "-",
			delta: latencyDelta.value,
			trend: latencyDelta.trend,
			helpText: "Median response latency per day across all requests.",
		},
		e2e: {
			title: "E2E latency",
			value:
				metrics.summary.avgGenerationMs != null
					? `${Math.round(metrics.summary.avgGenerationMs)} ms`
					: "-",
			delta: e2eDelta.value,
			trend: e2eDelta.trend,
			helpText: "Median end-to-end latency per day across all requests.",
		},
	};

	return (
		<PerformanceCardsClient
			throughputData={throughputData}
			latencyData={latencyData}
			e2eLatencyData={e2eLatencyData}
			dailyModelLeaderboards={metrics.dailyModelLeaderboards}
			summary={summary}
		/>
	);
}
