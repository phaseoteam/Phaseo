export interface BenchmarkCard {
	benchmark_id: string;
	benchmark_name: string;
	total_models: number;
	metrics?: ArtificialAnalysisMetric[];
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
}

export interface BenchmarkPage {
	suite?: ArtificialAnalysisSuite;
	id: string;
	name: string | null;
	category: string | null;
	ascending_order: boolean | null;
	total_models: number | null;
	link: string | null;
	results: BenchmarkResult[];
	type?: string | null;
}
