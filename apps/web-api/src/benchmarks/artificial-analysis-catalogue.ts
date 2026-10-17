import type { getDataClient } from "@/data/supabase";

export const ARTIFICIAL_ANALYSIS_ID = "artificial-analysis";
export const AA_METRICS = [
	{ key: "intelligence", prefix: "aa-intelligence-index", label: "Intelligence" },
	{ key: "coding", prefix: "aa-coding-index", label: "Coding" },
	{ key: "agentic", prefix: "aa-agentic-index", label: "Agentic" },
	{ key: "cost", prefix: "aa-intelligence-index-cost", label: "Evaluation Cost" },
] as const;

type Benchmark = { benchmark_id: string; name: string | null; total_models: number | null };
type CoverageRow = { benchmark_id: string; model_slug: string };

export function isArtificialAnalysisEntry(id: string) {
	return id === ARTIFICIAL_ANALYSIS_ID || id.startsWith("aa-");
}

export function artificialAnalysisCatalogue(rows: Benchmark[], coverage: CoverageRow[]) {
	const models = new Map<string, Set<string>>();
	for (const row of coverage) {
		const set = models.get(row.benchmark_id) ?? new Set<string>();
		set.add(row.model_slug);
		models.set(row.benchmark_id, set);
	}
	const count = (id: string) => models.get(id)?.size ?? 0;
	const versions = rows.flatMap((row) => {
		const version = row.benchmark_id.match(/^aa-intelligence-index-v([1-9]\d*)$/)?.[1];
		return version && count(row.benchmark_id) > 0 ? [Number(version)] : [];
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

/** Count actual scored models, not source variants or stale benchmark totals. */
export async function fetchArtificialAnalysisCoverage(client: ReturnType<typeof getDataClient>, rows: Benchmark[]) {
	const ids = rows.filter((row) => isArtificialAnalysisEntry(row.benchmark_id)).map((row) => row.benchmark_id);
	const coverage: CoverageRow[] = [];
	if (!ids.length) return coverage;
	const now = new Date().toISOString();
	for (let offset = 0; ; offset += 500) {
		const { data, error } = await client.from("v2_benchmark_results")
			.select("benchmark_id,model_slug,model:v2_models!inner(hidden)")
			.in("benchmark_id", ids)
			.or(`effective_to.is.null,effective_to.gt.${now}`)
			.not("score_numeric", "is", null)
			.eq("model.hidden", false)
			.order("result_id")
			.range(offset, offset + 499);
		if (error) throw error;
		coverage.push(...(data ?? []));
		if ((data ?? []).length < 500) return coverage;
	}
}
