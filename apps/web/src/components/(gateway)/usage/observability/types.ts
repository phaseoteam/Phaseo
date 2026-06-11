export type ObservabilityRange = "1h" | "1d" | "1w" | "1m" | "1y";

export type ObservabilityTab =
	| "overview"
	| "trends"
	| "explore"
	| "guardrails";

export type ObservabilitySeriesPoint = {
	bucket: string;
	label: string;
	value: number;
};

export type ObservabilityKpi = {
	id: "spend" | "requests" | "tokens" | "cache";
	label: string;
	value: number;
	previous: number;
	deltaPercent: number | null;
	sparkline: ObservabilitySeriesPoint[];
	format: "currency" | "number" | "percent";
};

export type ObservabilityRankedItem = {
	id: string;
	label: string;
	subtitle?: string | null;
	tokens: number;
	requests: number;
	cost: number;
	previousTokens: number;
	deltaPercent: number | null;
	sparkline: ObservabilitySeriesPoint[];
};

export type ObservabilityBreakdownItem = {
	id: string;
	label: string;
	value: number;
};

export type ObservabilityExploreRow = {
	bucket: string;
	model: string;
	apiKey: string;
	app: string;
	provider: string;
	requests: number;
	tokens: number;
	inputTokens: number;
	outputTokens: number;
	reasoningTokens: number;
	cachedTokens: number;
	uncachedTokens: number;
	cost: number;
	errors: number;
};

export type ObservabilityData = {
	range: ObservabilityRange;
	periodLabel: string;
	kpis: ObservabilityKpi[];
	topApiKeys: ObservabilityRankedItem[];
	topApps: ObservabilityRankedItem[];
	trendingModels: ObservabilityRankedItem[];
	trendingKeys: ObservabilityRankedItem[];
	trendingApps: ObservabilityRankedItem[];
	charts: {
		usageByModelCost: ObservabilityBreakdownItem[];
		usageTypeCost: ObservabilityBreakdownItem[];
		requestVolumeByModel: ObservabilityBreakdownItem[];
		tokenSplit: ObservabilityBreakdownItem[];
		cacheSplit: ObservabilityBreakdownItem[];
		spendOverTime: ObservabilitySeriesPoint[];
	};
	exploreRows: ObservabilityExploreRow[];
};
