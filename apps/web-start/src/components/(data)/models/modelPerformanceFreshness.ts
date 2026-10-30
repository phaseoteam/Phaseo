import type { ModelPerformanceMetrics } from "@/lib/fetchers/models/getModelPerformance";

export function hasPerformanceHistory(metrics: ModelPerformanceMetrics): boolean {
	return (
		metrics.summary.totalRequests > 0 ||
		metrics.hourly.some((point) => point.requests > 0) ||
		(metrics.providerHourly7d?.some((point) => point.requests > 0) ?? false) ||
		metrics.providerDaily7d.some((point) => point.requests > 0) ||
		(metrics.providerPercentileDaily7d?.some((point) => point.requests > 0) ?? false)
	);
}

export function isPerformanceDataStale(
	metrics: ModelPerformanceMetrics,
): boolean {
	const latestSampleAt = getLatestPerformanceSampleAt(metrics);
	if (!latestSampleAt) return false;
	return Date.now() - Date.parse(latestSampleAt) > 24 * 60 * 60 * 1000;
}

export function getLatestPerformanceSampleAt(
	metrics: ModelPerformanceMetrics,
): string | null {
	const candidates = [
		...metrics.hourly
			.filter((point) => point.requests > 0)
			.map((point) => point.bucket),
		...(metrics.providerHourly7d ?? [])
			.filter((point) => point.requests > 0)
			.map((point) => point.bucket),
		...metrics.providerDaily7d
			.filter((point) => point.requests > 0)
			.map((point) => point.day),
	];
	const latest = candidates.reduce<number | null>((current, value) => {
		const timestamp = Date.parse(value);
		if (!Number.isFinite(timestamp)) return current;
		return current == null || timestamp > current ? timestamp : current;
	}, null);
	return latest == null ? null : new Date(latest).toISOString();
}
