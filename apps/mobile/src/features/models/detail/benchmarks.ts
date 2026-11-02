import type { BenchmarkRanking, ModelBenchmark, ModelBenchmarkResult } from "@/lib/api/models";
import { isEpochCapabilitiesIndex, parseEpochConfidenceInterval } from "@phaseo/app-kit/benchmarks/epoch";

export { isEpochCapabilitiesIndex, parseEpochConfidenceInterval };

// Ported from apps/web lib/benchmarks/artificialAnalysis.ts (its `@/` imports don't resolve from the app).

export const AA_METRICS = [
  { id: "aa-intelligence-index-v4", key: "intelligence", label: "Intelligence" },
  { id: "aa-coding-index-v4", key: "coding", label: "Coding" },
  { id: "aa-agentic-index-v4", key: "agentic", label: "Agentic" },
  { id: "aa-intelligence-index-cost-v4", key: "cost", label: "Evaluation cost" },
] as const;

export type AaMetricKey = (typeof AA_METRICS)[number]["key"];

export const isArtificialAnalysisBenchmark = (id: string) => /^aa-(?:intelligence|coding|agentic)-index(?:-cost)?-v\d+$/.test(id);
export const isArtificialAnalysisCost = (id: string) => /^aa-intelligence-index-cost-v\d+$/.test(id);

export function aaMetricKey(id: string): AaMetricKey | null {
  if (isArtificialAnalysisCost(id)) return "cost";
  return (id.match(/^aa-(intelligence|coding|agentic)-index-v\d+$/)?.[1] as AaMetricKey | undefined) ?? null;
}

/** "4.3.2" from "…; Intelligence Index v4.3.2; …". */
export function aaVersion(info?: string | null) {
  return info?.match(/Intelligence Index v(\d+(?:\.\d+)*)(?=$|[\s;]|[.!?](?=$|\s))/)?.[1] ?? null;
}

const CONFIGURATION_ORDER = ["none", "low", "medium", "high", "xhigh", "max"];

const CONFIGURATION_LABELS: Record<string, string> = {
  default: "Default", none: "Non-reasoning", minimal: "Minimal", low: "Low", medium: "Medium", high: "High",
  xhigh: "Extra high", max: "Max", reasoning: "Reasoning", thinking: "Reasoning", fast: "Fast", standard: "Standard",
};

/** The website's configuration names (Max, Extra high, Non-reasoning…); unknown ones keep their identifier. */
export function configurationLabel(variant: string | null | undefined) {
  const code = variant?.toLowerCase() || "default";
  return CONFIGURATION_LABELS[code] ?? variant ?? "";
}

/** Evaluated configurations, from no reasoning up to Max. */
export function aaConfigurations(results: ModelBenchmarkResult[]) {
  const variants = new Set(results.filter((result) => isArtificialAnalysisBenchmark(result.benchmark_id) && result.score != null).map((result) => result.variant).filter((value): value is string => Boolean(value)));
  return [...variants].sort((a, b) => {
    const ai = CONFIGURATION_ORDER.indexOf(a);
    const bi = CONFIGURATION_ORDER.indexOf(b);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.localeCompare(b);
  });
}

/** The website opens on Max when it was evaluated, else the highest configuration. */
export function defaultConfiguration(configurations: string[]) {
  return configurations.includes("max") ? "max" : configurations.at(-1) ?? "";
}

export type AaScore = { benchmarkId: string; score: number | null; otherInfo: string | null; sourceLink: string | null };

/**
 * Scores for one configuration, so every tile (including evaluation cost) describes the same setup.
 * Without per-configuration results the highlights are used, as on the website.
 */
export function aaScoresFor(configuration: string, results: ModelBenchmarkResult[], highlights: ModelBenchmark[]): AaScore[] {
  const selected = configuration
    ? results.filter((result) => isArtificialAnalysisBenchmark(result.benchmark_id) && result.score != null && result.variant === configuration)
      .map((result) => ({ benchmarkId: result.benchmark_id, score: result.score ?? null, otherInfo: result.other_info ?? null, sourceLink: result.source_link ?? null }))
    : [];
  if (selected.length) return selected;
  return highlights.filter((item) => isArtificialAnalysisBenchmark(item.benchmarkId) && item.score != null)
    .map((item) => ({ benchmarkId: item.benchmarkId, score: item.score ?? null, otherInfo: item.otherInfo ?? null, sourceLink: item.sourceLink ?? null }));
}

/** The score shown in a tile: the newest index version of that metric. */
export function aaTileScore(scores: AaScore[], key: AaMetricKey) {
  return scores.filter((item) => aaMetricKey(item.benchmarkId) === key).sort((a, b) => b.benchmarkId.localeCompare(a.benchmarkId, "en", { numeric: true }))[0] ?? null;
}

export type RankSummary = { lowerIsBetter: boolean; entries: { modelId: string; version: string | null; scores: number[] }[] };

/** Keeps only what ranks need from `/rankings/benchmarks`: every model's configuration scores per AA benchmark. */
export function summariseRankings(rankings: BenchmarkRanking[]): Record<string, RankSummary> {
  return Object.fromEntries(rankings.filter((ranking) => isArtificialAnalysisBenchmark(ranking.benchmark_id)).map((ranking) => [ranking.benchmark_id, {
    lowerIsBetter: ranking.lower_is_better,
    entries: ranking.entries.map((entry) => ({
      modelId: entry.model_id,
      version: aaVersion(entry.other_info),
      scores: entry.configurations?.length ? entry.configurations.map((configuration) => configuration.score) : [entry.score],
    })),
  }]));
}

/**
 * Rank among every evaluated configuration of every model on the same index version, counting this
 * model's own configurations (artificialAnalysisSummaryRank). Ties share a rank.
 */
export function aaRank(summary: RankSummary | undefined, score: number, modelId: string, version: string | null, localScores: number[]) {
  if (!summary) return null;
  const entries = summary.entries.filter((entry) => !version || !entry.version || entry.version === version);
  const others = entries.filter((entry) => entry.modelId !== modelId);
  if (!others.length) return null;
  const own = localScores.length ? localScores : entries.find((entry) => entry.modelId === modelId)?.scores ?? [score];
  const scores = [...others.flatMap((entry) => entry.scores), ...own];
  return { rank: 1 + scores.filter((value) => (summary.lowerIsBetter ? value < score : value > score)).length, total: scores.length };
}

/** This model's own scores for a benchmark on one index version (all its configurations). */
export function localScores(results: ModelBenchmarkResult[], benchmarkId: string, version: string | null) {
  return results
    .filter((result) => result.benchmark_id === benchmarkId && result.score != null && (!version || !aaVersion(result.other_info) || aaVersion(result.other_info) === version))
    .map((result) => result.score!);
}

/** "43.4", and "$330.25" for evaluation cost (USD, two decimals), as the website formats tiles. */
export function formatAaScore(benchmarkId: string, score: number) {
  if (isArtificialAnalysisCost(benchmarkId)) {
    return `$${score.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return score.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Highlights that aren't Artificial Analysis or Epoch: the website lists these under "Other benchmarks". */
export function otherHighlights(highlights: ModelBenchmark[]) {
  return highlights.filter((item) => !isArtificialAnalysisBenchmark(item.benchmarkId) && !isEpochCapabilitiesIndex(item.benchmarkId));
}

/** The website's inline Epoch chart: twelve entries around this model. */
export function epochNeighbours<T extends { modelId: string }>(entries: T[], modelId: string) {
  const index = entries.findIndex((entry) => entry.modelId === modelId);
  const start = index < 0 ? 0 : Math.min(Math.max(0, index - 5), Math.max(0, entries.length - 12));
  return entries.slice(start, start + 12);
}
