export type GatewayTimeseriesPoint = {
	timestamp: string;
	requests: number;
	uptimePct: number | null;
	p50Ms: number | null;
	p95Ms: number | null;
	avgMs: number | null;
	requestsPerMin: number;
	tokensPerMin: number;
	hoursAgo: number;
};

export type GatewayMarketingMetrics = {
	summary: {
		windowHours: number;
		uptimePct: number | null;
		latencyP95Ms: number | null;
		latencyP50Ms: number | null;
		latencyAvgMs: number | null;
		requestsInWindow: number;
		successfulInWindow: number;
		tokensInWindow: number;
		/** @deprecated Use requestsInWindow with windowHours. */
		requests24h: number;
		/** @deprecated Use successfulInWindow with windowHours. */
		successful24h: number;
		/** @deprecated Use tokensInWindow with windowHours. */
		tokens24h: number;
		requestsPerMinAvg: number | null;
		supportedModels: number | null;
		supportedProviders: number | null;
	};
	timeseries: {
		uptime: GatewayTimeseriesPoint[];
		latency: GatewayTimeseriesPoint[];
		throughput: GatewayTimeseriesPoint[];
	};
	supported: { modelIds: string[]; providerIds: string[] };
	fallback: boolean;
	error?: string;
};

export function formatGatewayMetricWindow(hours: number): string {
	if (!Number.isFinite(hours) || hours <= 0) return "selected window";
	if (hours % (24 * 30) === 0) return `${hours / (24 * 30)}mo`;
	if (hours % (24 * 7) === 0) return `${hours / (24 * 7)}w`;
	if (hours % 24 === 0) return `${hours / 24}d`;
	return `${hours}h`;
}
