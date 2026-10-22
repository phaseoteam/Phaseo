/**
 * The compact compare payload from the web API's `/api/_web/compare/view`.
 * Mirrors `apps/web-api/src/models/compare-view.ts`; the Worker does the
 * pricing, route and benchmark work so pages only carry what they render.
 */
export type CompareView = {
	models: CompareViewModel[];
	benchmarks: CompareViewBenchmark[];
};

export type CompareViewModel = {
	id: string;
	name: string;
	lab: { id: string; name: string };
	status: string | null;
	releaseDate: string | null;
	announcedDate: string | null;
	deprecationDate: string | null;
	retirementDate: string | null;
	knowledgeCutoff: string | null;
	licence: string | null;
	inputTypes: string[];
	outputTypes: string[];
	contextWindow: { tokens: number; source: "model" | "providers" } | null;
	maxOutput: { tokens: number; source: "model" | "providers" } | null;
	features: {
		tools: boolean | null;
		structuredOutputs: boolean | null;
		reasoning: boolean | null;
		webSearch: boolean | null;
	};
	pricing: CompareViewPricing | null;
	providers: CompareViewProvider[];
	otherListings: Array<{ id: string; name: string }>;
	subscriptionPlans: Array<{
		id: string;
		name: string;
		organisation: string;
		price: number | null;
		currency: string | null;
		frequency: string | null;
		link: string | null;
	}>;
	links: {
		apiReference: string | null;
		announcement: string | null;
		paper: string | null;
		weights: string | null;
		repository: string | null;
	};
};

export type CompareViewPricing = {
	provider: { id: string; name: string; routed: boolean };
	tiers: Record<string, CompareViewPriceRow[]>;
};

export type ComparePriceKind = "input" | "output" | "cacheRead" | "cacheWrite5m" | "cacheWrite1h" | "cacheWrite" | "other";

export type CompareViewPriceRow = {
	meter: string;
	kind: ComparePriceKind;
	label: string | null;
	price: number;
	per: number;
	unit: string;
	conditional: boolean;
	/** For conditional rows, e.g. "input tokens ≤ 272K". */
	condition?: string | null;
};

export type CompareViewProvider = {
	id: string;
	name: string;
	input: number | null;
	output: number | null;
	cacheRead: number | null;
	contextWindow: number | null;
	maxOutput: number | null;
	tiers: string[];
	/** This route's price rows by service tier. Absent from responses cached before routes carried them. */
	pricing?: Record<string, CompareViewPriceRow[]>;
	quantisation: string | null;
};

export type CompareEffort = "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export type CompareViewBenchmark = {
	id: string;
	name: string;
	category: string | null;
	higherIsBetter: boolean;
	type: "percentage" | "numerical" | null;
	source: "epoch" | "artificial-analysis" | "lab" | "independent";
	link: string | null;
	results: Record<string, CompareViewBenchmarkResult[]>;
};

export type CompareViewBenchmarkResult = {
	score: number;
	variant: string | null;
	effort: CompareEffort | null;
	ci: [number, number] | null;
	selfReported: boolean;
	sourceLink: string | null;
};

export type CompareUsageWindow = "30m" | "24h" | "5d";

/** One day of a model's traffic through Phaseo. */
export type CompareActivityDay = { date: string; requests: number; input: number; output: number; reasoning: number };

export type CompareViewUsage = {
	periodDays: number;
	tokens30d: number;
	totalRequests: number;
	latencyP50Ms30m: number | null;
	throughputP50TokPerSec30m: number | null;
	/** Absent from web API deployments older than the compare view. */
	latencyWindow?: CompareUsageWindow | null;
	throughputWindow?: CompareUsageWindow | null;
	/** The last 30 days, oldest first. Absent from web API deployments older than the Activity section. */
	activity30d?: CompareActivityDay[];
};

export type CompareViewUsageByModel = Record<string, CompareViewUsage>;
