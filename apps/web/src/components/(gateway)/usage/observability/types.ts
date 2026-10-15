import type { MonthSpendForecast } from "@/lib/gateway/usage/monthSpendForecast";
import type { MonthKpiFigure } from "@/lib/gateway/usage/monthUsageKpis";

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
	id: "spend" | "blended_price" | "requests" | "tokens" | "cache" | "success_rate";
	label: string;
	value: number;
	previous: number;
	deltaPercent: number | null;
	sparkline: ObservabilitySeriesPoint[];
	format: "currency" | "currency_per_million" | "number" | "percent";
	/** This UTC month from exact rollups; absent for filtered views. */
	month?: MonthKpiFigure | null;
};

export type ObservabilityRankedItem = {
	id: string;
	label: string;
	subtitle?: string | null;
	imageUrl?: string | null;
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

export type ObservabilityChartSeries = {
	id: string;
	label: string;
	color?: string;
};

export type ObservabilityTimeSeriesChart = {
	series: ObservabilityChartSeries[];
	data: Array<Record<string, string | number>>;
};

export type ObservabilityTrendMetricCharts = {
	spend: ObservabilityTimeSeriesChart;
	requests: ObservabilityTimeSeriesChart;
	tokens: ObservabilityTimeSeriesChart;
};

export type ObservabilityTrendCharts = {
	models: ObservabilityTrendMetricCharts;
	keys: ObservabilityTrendMetricCharts;
	apps: ObservabilityTrendMetricCharts;
};

export type ObservabilityFilterOptionData = {
	value: string;
	label: string;
	logoId?: string | null;
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
	isSampled?: boolean;
	sampleLimit?: number;
	kpis: ObservabilityKpi[];
	/** This UTC month's spend and projection from exact rollups; absent for filtered views. */
	monthSpend?: MonthSpendForecast | null;
	topApiKeys: ObservabilityRankedItem[];
	topApps: ObservabilityRankedItem[];
	trendingModels: ObservabilityRankedItem[];
	trendingKeys: ObservabilityRankedItem[];
	trendingApps: ObservabilityRankedItem[];
	charts: {
		usageByModelCost: ObservabilityTimeSeriesChart;
		usageTypeCost: ObservabilityTimeSeriesChart;
		requestVolumeByModel: ObservabilityTimeSeriesChart;
		tokenSplit: ObservabilityTimeSeriesChart;
		cacheSplit: ObservabilityTimeSeriesChart;
		spendOverTime: ObservabilitySeriesPoint[];
		trends: ObservabilityTrendCharts;
	};
	filterOptions?: {
		models?: ObservabilityFilterOptionData[];
	};
	exploreRows: ObservabilityExploreRow[];
};
