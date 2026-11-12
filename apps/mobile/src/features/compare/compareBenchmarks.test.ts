import { benchmarkBestIndex, sharedBenchmarks } from "./compareBenchmarks";

const result = (benchmark_id: string, score: number, ascending_order: boolean, is_self_reported = false) => ({
  benchmark_id,
  score: String(score),
  is_self_reported,
  benchmark: { id: benchmark_id, name: benchmark_id, category: null, ascending_order },
});

describe("sharedBenchmarks", () => {
  test("keeps each model's best score and marks the highest when higher is better", () => {
    // `ascending_order` is true for index scores such as AA-Index, false for ranks and costs.
    const [index] = sharedBenchmarks([
      { benchmark_results: [result("aa-index", 45.8, true), result("aa-index", 52.7, true)] },
      { benchmark_results: [result("aa-index", 57.6, true)] },
    ]);
    expect(index!.scores).toEqual([52.7, 57.6]);
    expect(benchmarkBestIndex(index!)).toBe(1);
  });

  test("marks the lowest when lower is better", () => {
    const [rank] = sharedBenchmarks([
      { benchmark_results: [result("arena-rank", 3, false), result("arena-rank", 5, false)] },
      { benchmark_results: [result("arena-rank", 4, false)] },
    ]);
    expect(rank!.scores).toEqual([3, 4]);
    expect(benchmarkBestIndex(rank!)).toBe(0);
  });

  test("marks no winner on lab-reported scores, ties or a model without a score", () => {
    const benchmarks = sharedBenchmarks([
      { benchmark_results: [result("agents-last-exam", 59.3, true, true), result("tie", 70, true)] },
      { benchmark_results: [result("agents-last-exam", 39.5, true, true), result("tie", 70, true)] },
      undefined,
    ]);
    expect(benchmarks.map((benchmark) => [benchmark.name, benchmarkBestIndex(benchmark)])).toEqual([["agents-last-exam", -1], ["tie", -1]]);
  });
});
