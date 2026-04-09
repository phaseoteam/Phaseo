export type CompareGatewayUsagePoint = {
	date: string;
	value: number;
};

export type CompareGatewayUsage = {
	periodDays: number;
	tokens30d: number;
	latestDate: string | null;
	points30d: CompareGatewayUsagePoint[];
	totalRequests: number;
	requests30m: number;
	latencyP50Ms30m: number | null;
	throughputP50TokPerSec30m: number | null;
	cumulativeTokens: number | null;
	requestPoints24h: CompareGatewayUsagePoint[];
};

export type CompareGatewayUsageByModel = Record<string, CompareGatewayUsage>;
