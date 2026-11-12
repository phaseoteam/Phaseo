import type { ComparedModel } from "@/lib/api/compare";

export type SharedBenchmark = { name: string; higherIsBetter: boolean; selfReported: boolean; scores: (number | null)[] };

/** Benchmarks at least two of the compared models report, with each model's best score. */
export function sharedBenchmarks(models: (Pick<ComparedModel, "benchmark_results"> | undefined)[]): SharedBenchmark[] {
  const byBenchmark = new Map<string, SharedBenchmark>();
  models.forEach((model, index) => {
    for (const result of model?.benchmark_results ?? []) {
      const score = Number(result.score);
      if (!Number.isFinite(score)) continue;
      // `ascending_order` true means a higher score ranks higher, as on the website.
      const entry = byBenchmark.get(result.benchmark_id) ?? { name: result.benchmark?.name ?? result.benchmark_id, higherIsBetter: result.benchmark?.ascending_order !== false, selfReported: false, scores: models.map(() => null) };
      const current = entry.scores[index];
      entry.scores[index] = current == null ? score : entry.higherIsBetter ? Math.max(current, score) : Math.min(current, score);
      entry.selfReported ||= Boolean(result.is_self_reported);
      byBenchmark.set(result.benchmark_id, entry);
    }
  });
  return [...byBenchmark.values()].filter((entry) => entry.scores.filter((score) => score != null).length >= 2).slice(0, 12);
}

/**
 * The one model with the best score, or -1. Labs report their own models with
 * their own settings and task sets, so lab-reported scores get no winner.
 */
export function benchmarkBestIndex(benchmark: SharedBenchmark): number {
  if (benchmark.selfReported) return -1;
  const present = benchmark.scores.filter((score): score is number => score != null);
  const target = benchmark.higherIsBetter ? Math.max(...present) : Math.min(...present);
  return present.filter((score) => score === target).length === 1 ? benchmark.scores.indexOf(target) : -1;
}
