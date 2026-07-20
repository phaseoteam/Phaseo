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
		uptimePct: number | null;
		latencyP95Ms: number | null;
		latencyP50Ms: number | null;
		latencyAvgMs: number | null;
		requests24h: number;
		successful24h: number;
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
