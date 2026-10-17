import type { getDataClient } from "@/data/supabase";

export const ARTIFICIAL_ANALYSIS_ID = "artificial-analysis";
export const AA_METRICS = [
	{ key: "intelligence", prefix: "aa-intelligence-index", label: "Intelligence" },
	{ key: "coding", prefix: "aa-coding-index", label: "Coding" },
	{ key: "agentic", prefix: "aa-agentic-index", label: "Agentic" },
	{ key: "cost", prefix: "aa-intelligence-index-cost", label: "Evaluation Cost" },
] as const;

type Benchmark = { benchmark_id: string; name: string | null; total_models: number | null };
type CoverageRow = { benchmark_id: string; total_models: number; published: boolean };

export function isArtificialAnalysisEntry(id: string) {
	return id === ARTIFICIAL_ANALYSIS_ID || id.startsWith("aa-");
}

export function artificialAnalysisCatalogue(rows: Benchmark[], coverage: CoverageRow[]) {
	const counts = new Map(coverage.map((row) => [row.benchmark_id, row.total_models]));
	const published = new Set(coverage.filter((row) => row.published).map((row) => row.benchmark_id));
	const count = (id: string) => counts.get(id) ?? 0;
	const versions = rows.flatMap((row) => {
		const version = row.benchmark_id.match(/^aa-intelligence-index-v([1-9]\d*)$/)?.[1];
		return version && published.has(row.benchmark_id) && count(row.benchmark_id) > 0 ? [Number(version)] : [];
	}).sort((a, b) => b - a);
	const currentVersion = versions[0] ?? null;
	const metrics = (version: number) => AA_METRICS.map((metric) => ({
		key: metric.key,
		id: `${metric.prefix}-v${version}`,
		label: metric.label,
		total_models: count(`${metric.prefix}-v${version}`),
	}));
	const otherEvaluations = rows.filter((row) => isArtificialAnalysisEntry(row.benchmark_id)
		&& row.benchmark_id !== ARTIFICIAL_ANALYSIS_ID
		&& !/^aa-(?:intelligence|coding|agentic)-index(?:-cost)?-v\d+$/.test(row.benchmark_id)
		&& count(row.benchmark_id) > 0)
		.map((row) => ({ id: row.benchmark_id, name: row.name ?? row.benchmark_id }));
	const entries = rows.filter((row) => !isArtificialAnalysisEntry(row.benchmark_id));
	return {
		versions,
		currentVersion,
		metrics,
		otherEvaluations,
		// Until a versioned index exists, keep existing evaluations discoverable.
		entries: currentVersion === null ? rows : [...entries, {
			benchmark_id: ARTIFICIAL_ANALYSIS_ID,
			name: "Artificial Analysis",
			total_models: count(`aa-intelligence-index-v${currentVersion}`),
			metrics: metrics(currentVersion),
		}],
	};
}

/** SQL counts visible scored models and admits only atomically published versions. */
export async function fetchArtificialAnalysisCoverage(client: ReturnType<typeof getDataClient>, rows: Benchmark[]) {
	if (!rows.some((row) => isArtificialAnalysisEntry(row.benchmark_id))) return [];
	const { data, error } = await client.rpc("get_artificial_analysis_coverage");
	if (error) throw error;
	return (data ?? []) as CoverageRow[];
}
