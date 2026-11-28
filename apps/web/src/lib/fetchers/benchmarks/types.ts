export interface BenchmarkCard {
	benchmark_id: string;
	benchmark_name: string;
	total_models: number;
	metrics?: ArtificialAnalysisMetric[];
}

export interface ArtificialAnalysisPublicConfiguration {
	id: string;
	model_id: string;
	name: string;
	slug: string;
	effort: string | null;
	creator: { id: string; slug: string; name: string; color?: string } | null;
	intelligenceIndex: number | null;
	intelligenceIndexIsEstimated: boolean | null;
	totalTokens: Record<string, number | null> | null;
	outputTokensPerTask: Record<string, number | null> | null;
	totalCostUsd: Record<string, number | null> | null;
	costPerTaskUsd: Record<string, number | null> | null;
	timePerTaskSeconds: number | null;
	benchmarkScores: Record<string, number | null>;
	capabilityScores: Record<string, number | null> | null;
	modelDetails: Record<string, unknown>;
	pricing: Record<string, number | null>;
	performance: Record<string, unknown>;
	breakdowns: Record<string, unknown>;
	evaluations: Array<{ slug: string; score: number | null; outputTokensPerTask: number | null; costPerTaskUsd: number | null; timePerTaskSeconds: number | null }>;
}

export interface ArtificialAnalysisPublicData {
	snapshot_id: string;
	/** Intelligence Index methodology only; domain capability indices are versioned independently. */
	methodology_version: string;
	fetched_at: string;
	source_url: string;
	total: number;
	models: ArtificialAnalysisPublicConfiguration[];
}

export interface ArtificialAnalysisMetric {
	key: "intelligence" | "coding" | "agentic" | "cost";
	id: string;
	label: string;
	total_models: number;
}

export interface ArtificialAnalysisSuite {
	id: string;
	name: string;
	current_version: number;
	selected_version: number;
	versions: number[];
	metrics: ArtificialAnalysisMetric[];
	other_evaluations: { id: string; name: string }[];
}

export interface BenchmarkOrganisation {
	organisation_id: string;
	name?: string | null;
	colour?: string | null;
	display_name?: string | null;
	logo?: string | null;
	logo_url?: string | null;
}

export interface BenchmarkModelInfo {
	model_id: string;
	name?: string | null;
	release_date?: string | null;
	announcement_date?: string | null;
	organisation?: BenchmarkOrganisation | null;
}

export interface BenchmarkResult {
	variant?: string | null;
	result_key?: string | null;
	id: string;
	model_id: string;
	score: string | number | null;
	is_self_reported: boolean;
	model?: BenchmarkModelInfo | null;
	other_info?: unknown | null;
	source_link?: string | null;
	created_at?: string | null;
	updated_at?: string | null;
	rank?: number | null;
	/** Set on results read from a public leaderboard; such scores are already in the benchmark's scale. */
	source_id?: string | null;
	score_numeric?: number | null;
	source_model_label?: string | null;
	effort?: string | null;
	harness?: string | null;
	config?: string | null;
	ci_low?: number | null;
	ci_high?: number | null;
	cost_usd?: number | null;
	duration_seconds?: number | null;
	output_tokens?: number | null;
	observed_on?: string | null;
}

export interface BenchmarkSourceInfo {
	id: string;
	name: string;
	publisher: string | null;
	url: string | null;
	attribution: string | null;
	last_success_at: string | null;
}

export interface BenchmarkDirectoryEntry {
	id: string;
	name: string;
	category?: string;
	unit?: string;
	type?: string;
	higherIsBetter: boolean;
	sourceId?: string;
	sourceName?: string;
	publisher?: string;
	models: number;
	results: number;
	independent: number;
	updatedAt?: string;
}

export interface BenchmarkPage {
	comparison_benchmarks?: BenchmarkPage[];
	suite?: ArtificialAnalysisSuite;
	id: string;
	name: string | null;
	category: string | null;
	ascending_order: boolean | null;
	total_models: number | null;
	link: string | null;
	results: BenchmarkResult[];
	type?: string | null;
	source_id?: string | null;
	description?: string | null;
	unit?: string | null;
	sources?: BenchmarkSourceInfo[];
}
