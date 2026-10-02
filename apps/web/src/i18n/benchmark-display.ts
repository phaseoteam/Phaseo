type Translator = { (key: never): string };

export const BENCHMARK_CONFIGURATION_KEYS: Record<string, string> = {
	default: "Common.ui.chatComposer.default",
	none: "Catalogue.benchmarks.nonReasoning",
	low: "Common.ui.requestBuilder.low",
	medium: "Common.ui.requestBuilder.medium",
	high: "Common.ui.requestBuilder.high",
	xhigh: "Common.ui.requestBuilder.extraHigh",
	max: "Common.ui.requestBuilder.max",
};

export const ARTIFICIAL_ANALYSIS_METRIC_KEYS = ["intelligence", "coding", "agentic", "cost"] as const;

/** Unknown imported configurations retain their identifier. */
export function localizedBenchmarkConfiguration(value: string | null | undefined, t: Translator): string {
	const code = value?.toLowerCase() || "default";
	const key = BENCHMARK_CONFIGURATION_KEYS[code];
	return key ? t(key as never) : value ?? "";
}

export function localizedArtificialAnalysisMetric<T extends { key: string; label: string; description: string }>(metric: T, t: Translator): T {
	if (!(ARTIFICIAL_ANALYSIS_METRIC_KEYS as readonly string[]).includes(metric.key)) return metric;
	return {
		...metric,
		label: t(("Catalogue.rankings.benchmarkMetrics." + metric.key) as never),
		description: t(("Catalogue.benchmarks.metricDescriptions." + metric.key) as never),
	};
}
