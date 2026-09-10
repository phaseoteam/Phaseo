import type { BenchmarkPage, BenchmarkResult } from "@/lib/fetchers/benchmarks/types";
import type { PublicBenchmarkRanking, PublicBenchmarkRankingEntry } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { parseBenchmarkScore } from "@/lib/benchmarks/scoreFormat";

export const artificialAnalysisMetrics = [
  { id: "aa-intelligence-index-v4", key: "intelligence", label: "Intelligence", description: "Overall model capability" },
  { id: "aa-coding-index-v4", key: "coding", label: "Coding", description: "Software engineering capability" },
  { id: "aa-agentic-index-v4", key: "agentic", label: "Agentic", description: "Multi-step task performance" },
  { id: "aa-intelligence-index-cost-v4", key: "cost", label: "Evaluation cost", description: "Full Intelligence Index evaluation · USD" },
] as const;

export function artificialAnalysisMetricsForBenchmark(benchmarkId: string) {
  const version = benchmarkId.match(/-v(\d+)$/)?.[1] ?? "4";
  return artificialAnalysisMetrics.map((metric) => ({
    ...metric,
    id: metric.id.replace(/-v\d+$/, `-v${version}`),
  }));
}

const artificialAnalysisBenchmarkPattern = /^aa-(?:intelligence|coding|agentic)-index(?:-cost)?-v\d+$/;

export function isArtificialAnalysisBenchmark(id: string) {
  return artificialAnalysisBenchmarkPattern.test(id);
}

export function isArtificialAnalysisCostBenchmark(id: string) {
  return /^aa-intelligence-index-cost-v\d+$/.test(id);
}

export function artificialAnalysisMetricKey(id: string) {
  if (isArtificialAnalysisCostBenchmark(id)) return "cost";
  return id.match(/^aa-(intelligence|coding|agentic)-index-v\d+$/)?.[1] ?? null;
}
export function formatArtificialAnalysisScore(id: string, score: number) {
  return new Intl.NumberFormat("en-US", isArtificialAnalysisCostBenchmark(id)
    ? { style: "currency", currency: "USD", maximumFractionDigits: 2 }
    : { maximumFractionDigits: 2 }).format(score);
}
export function artificialAnalysisVersion(info?: string | null) {
	return info?.match(/Intelligence Index v([\d.]+)/)?.[1] ?? null;
}

export function applyArtificialAnalysisOrganisationColours(
	rankings: PublicBenchmarkRanking[],
	colours: ReadonlyMap<string, string | null>,
) {
	return rankings.map((ranking) => ({
		...ranking,
		entries: ranking.entries.map((entry) => ({
			...entry,
			organisation_colour: entry.organisation_colour ?? (entry.organisation_id ? colours.get(entry.organisation_id) ?? null : null),
		})),
	}));
}

function latestArtificialAnalysisVersion(results: BenchmarkResult[]) {
  const versions = [...new Set(results.map((result) => artificialAnalysisVersion(typeof result.other_info === "string" ? result.other_info : null)))].filter((version): version is string => Boolean(version));
  return versions.sort((left, right) => right.localeCompare(left, "en", { numeric: true }))[0] ?? null;
}

function candidateFromResult(result: BenchmarkResult, score: number): PublicBenchmarkRankingEntry {
  return {
    model_id: result.model_id,
    model_name: result.model?.name ?? result.model_id,
    organisation_id: result.model?.organisation?.organisation_id ?? null,
    organisation_name: result.model?.organisation?.name ?? result.model?.organisation?.display_name ?? null,
    organisation_colour: result.model?.organisation?.colour ?? null,
    release_date: result.model?.release_date ?? result.model?.announcement_date ?? null,
    other_info: typeof result.other_info === "string" ? result.other_info : null,
    source_link: result.source_link ?? null,
    updated_at: result.updated_at ?? result.created_at ?? null,
    score,
    rank: result.rank ?? 0,
  };
}

export function buildArtificialAnalysisRanking(benchmark: BenchmarkPage): PublicBenchmarkRanking {
  const lowerIsBetter = isArtificialAnalysisCostBenchmark(benchmark.id);
  const latestVersion = latestArtificialAnalysisVersion(benchmark.results);
  const bestByModel = new Map<string, PublicBenchmarkRankingEntry>();

  for (const result of benchmark.results) {
    if (latestVersion && artificialAnalysisVersion(typeof result.other_info === "string" ? result.other_info : null) !== latestVersion) continue;
    const score = parseBenchmarkScore(result.score);
    if (score == null) continue;

    const candidate = candidateFromResult(result, score);
    const current = bestByModel.get(result.model_id);
    if (!current || (lowerIsBetter ? candidate.score < current.score : candidate.score > current.score)) bestByModel.set(result.model_id, candidate);
  }

  const entries = [...bestByModel.values()].sort((left, right) => (lowerIsBetter ? left.score - right.score : right.score - left.score) || left.model_name.localeCompare(right.model_name));
  let previousScore: number | null = null;
  let previousRank = 0;
  entries.forEach((entry, index) => {
    if (previousScore !== entry.score) {
      previousRank = index + 1;
      previousScore = entry.score;
    }
    entry.rank = previousRank;
  });

  return {
    benchmark_id: benchmark.id,
    name: benchmark.name ?? benchmark.id,
    category: benchmark.category,
    benchmark_type: benchmark.type ?? null,
    lower_is_better: lowerIsBetter,
    total_models: entries.length,
    entries,
  };
}
