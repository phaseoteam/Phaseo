import type { BenchmarkPage, BenchmarkResult } from "@/lib/fetchers/benchmarks/types";
import type { PublicBenchmarkRanking, PublicBenchmarkRankingEntry, PublicIntelligenceValue, PublicIntelligenceValueEntry } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { parseBenchmarkScore } from "@/lib/benchmarks/scoreFormat";

export const artificialAnalysisMetrics = [
  { id: "aa-intelligence-index-v4", key: "intelligence", label: "Intelligence", description: "Overall model capability" },
  { id: "aa-coding-index-v4", key: "coding", label: "Coding", description: "Software engineering capability" },
  { id: "aa-agentic-index-v4", key: "agentic", label: "Agentic", description: "Multi-step task performance" },
  { id: "aa-intelligence-index-cost-v4", key: "cost", label: "Evaluation Cost", description: "Full Intelligence Index evaluation · USD" },
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

const artificialAnalysisOrganisationColours: Readonly<Record<string, string>> = {
	"spacex-ai": "#736cd3",
};

export function artificialAnalysisChartColour(
	organisationId: string | null | undefined,
	value: string | null | undefined,
	fallback = "#6b7280",
) {
	const override = organisationId ? artificialAnalysisOrganisationColours[organisationId] : null;
	if (override) return override;
	return value && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
}

export function formatArtificialAnalysisScore(id: string, score: number, locale = "en-US") {
  return new Intl.NumberFormat(locale, isArtificialAnalysisCostBenchmark(id)
    ? { style: "currency", currency: "USD", maximumFractionDigits: 2 }
    : { maximumFractionDigits: 2 }).format(score);
}
export function formatArtificialAnalysisValue(value: number, locale = "en-US") {
	return new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumSignificantDigits: 3 }).format(value);
}
export function artificialAnalysisValueKey(entry: PublicIntelligenceValueEntry) {
	return entry.configuration_id ?? JSON.stringify([entry.model_id, entry.variant, entry.other_info, entry.updated_at]);
}
export function artificialAnalysisValueLabel(entry: PublicIntelligenceValueEntry, resolveLabel?: (variant: string) => string) {
	if (resolveLabel) return resolveLabel(entry.variant ?? "default");
	const variant = entry.variant?.replace(/[-_]/g, " ") ?? "default";
	return variant.replace(/\b\w/g, (character) => character.toUpperCase());
}
export function artificialAnalysisVersion(info?: string | null) {
	return info?.match(/Intelligence Index v(\d+(?:\.\d+)*)(?=$|[\s;]|[.!?](?=$|\s))/)?.[1] ?? null;
}

/** Derive value on the server even when the deployed API predates its value field. */
export function buildArtificialAnalysisValue(benchmarks: PublicBenchmarkRanking[]): PublicIntelligenceValue {
	const intelligence = benchmarks.find((benchmark) => artificialAnalysisMetricKey(benchmark.benchmark_id) === "intelligence");
	const cost = benchmarks.find((benchmark) => artificialAnalysisMetricKey(benchmark.benchmark_id) === "cost");
	const key = (model: string, configuration: NonNullable<PublicBenchmarkRankingEntry["configurations"]>[number]) => {
		const source = configuration.other_info?.match(/Artificial Analysis ID ([\w-]+)(?:;|$)/)?.[1];
		const version = artificialAnalysisVersion(configuration.other_info);
		return source && version && configuration.updated_at ? JSON.stringify([model, source, version, configuration.variant, configuration.updated_at]) : null;
	};
	const costs = new Map<string, number>();
	const conflictingCosts = new Set<string>();
	for (const entry of cost?.entries ?? []) for (const configuration of entry.configurations ?? []) {
		const identity = key(entry.model_id, configuration);
		if (identity) {
			if (costs.has(identity) && costs.get(identity) !== configuration.score) conflictingCosts.add(identity);
			else costs.set(identity, configuration.score);
		}
	}
	const entries: PublicIntelligenceValueEntry[] = [];
	for (const entry of intelligence?.entries ?? []) {
		for (const configuration of entry.configurations ?? []) {
			const identity = key(entry.model_id, configuration);
			const evaluationCost = identity && !conflictingCosts.has(identity) ? costs.get(identity) : undefined;
			if (evaluationCost == null || !Number.isFinite(evaluationCost) || evaluationCost <= 0 || !Number.isFinite(configuration.score) || configuration.score <= 0) continue;
			const ratio = evaluationCost / configuration.score;
			if (!Number.isFinite(ratio)) continue;
			entries.push({ ...entry, configurations: undefined, configuration_id: identity!, variant: configuration.variant, score: ratio, intelligence_score: configuration.score, evaluation_cost: evaluationCost, other_info: configuration.other_info, source_link: configuration.source_link, updated_at: configuration.updated_at });
		}
	}
	entries.sort((a, b) => a.score - b.score || b.intelligence_score - a.intelligence_score);
	entries.forEach((entry) => { entry.rank = entries.findIndex((other) => other.score === entry.score) + 1; });
	return { benchmark_id: intelligence?.benchmark_id ?? "aa-intelligence-index-v4", entries };
}

/** Rank the evaluated configurations, including ties, rather than one best score per model. */
export function artificialAnalysisConfigurationRank(entries: PublicBenchmarkRankingEntry[], score: number, lowerIsBetter: boolean) {
	const scores = entries.flatMap((entry) => entry.configurations?.length ? entry.configurations.map((configuration) => configuration.score) : [entry.score]);
	return {
		rank: 1 + scores.filter((value) => lowerIsBetter ? value < score : value > score).length,
		total: scores.length,
	};
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
  const imported = results.filter((result) => typeof result.other_info === "string" && /Artificial Analysis ID [\w-]+(?:;|$)/.test(result.other_info));
  const versions = [...new Set((imported.length ? imported : results).map((result) => artificialAnalysisVersion(typeof result.other_info === "string" ? result.other_info : null)))].filter((version): version is string => Boolean(version));
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
