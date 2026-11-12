import type { ModelBenchmark, ModelBenchmarkResult } from "@/lib/api/models";
import { aaConfigurations, aaRank, aaScoresFor, aaTileScore, configurationLabel, defaultConfiguration, formatAaScore, localScores, otherHighlights, summariseRankings } from "./benchmarks";

const info = (variant: string) => `Claude Haiku 5.5 (${variant}); Intelligence Index v4.3.2`;
const result = (benchmark_id: string, variant: string, score: number): ModelBenchmarkResult => ({ benchmark_id, variant, score, other_info: info(variant), source_link: null, result_key: `${benchmark_id}:${variant}` });

// The live Haiku 5.5 shape: five configurations; the cost highlight is the cheapest (Low) one.
const results = [
  ...([["low", 29.5], ["medium", 34.5], ["high", 37.8], ["xhigh", 41.2], ["max", 43.4]] as const).map(([variant, score]) => result("aa-intelligence-index-v4", variant, score)),
  ...([["low", 34.31], ["medium", 56.36], ["high", 94.07], ["xhigh", 157.58], ["max", 330.25]] as const).map(([variant, score]) => result("aa-intelligence-index-cost-v4", variant, score)),
];
const highlights: ModelBenchmark[] = [
  { benchmarkId: "aa-intelligence-index-v4", score: 43.4, rank: 45, totalModels: 694, isSelfReported: false, otherInfo: info("Max") },
  { benchmarkId: "aa-intelligence-index-cost-v4", score: 34.31, rank: 21, totalModels: 196, isSelfReported: false, otherInfo: info("Low") },
  { benchmarkId: "epoch-capabilities-index", score: 158.98, rank: 14, totalModels: 164, isSelfReported: false, otherInfo: "95% CI 156.59–162.07" },
  { benchmarkId: "gpqa-diamond", score: 71.2, isSelfReported: true },
];

describe("Artificial Analysis configurations", () => {
  test("orders configurations and opens on Max, as the website does", () => {
    const configurations = aaConfigurations(results);
    expect(configurations).toEqual(["low", "medium", "high", "xhigh", "max"]);
    expect(defaultConfiguration(configurations)).toBe("max");
    expect(defaultConfiguration(["low", "high"])).toBe("high");
    expect(configurationLabel("xhigh")).toBe("Extra high");
    expect(configurationLabel("none")).toBe("Non-reasoning");
  });

  test("every tile describes the selected configuration, not the highlights' mix", () => {
    // The old app listed the cost highlight (Low, $34.31) beside Max intelligence.
    const scores = aaScoresFor("max", results, highlights);
    expect(aaTileScore(scores, "intelligence")?.score).toBe(43.4);
    expect(aaTileScore(scores, "cost")?.score).toBe(330.25);
    expect(aaTileScore(scores, "coding")).toBeNull();
    expect(aaTileScore(aaScoresFor("low", results, highlights), "cost")?.score).toBe(34.31);
  });

  test("falls back to highlights when there are no per-configuration results", () => {
    expect(aaScoresFor("", [], highlights).map((item) => item.score)).toEqual([43.4, 34.31]);
  });

  test("formats evaluation cost in USD with two decimals and scores with one", () => {
    expect(formatAaScore("aa-intelligence-index-cost-v4", 330.25)).toBe("$330.25");
    expect(formatAaScore("aa-intelligence-index-cost-v4", 1234.5)).toBe("$1,234.50");
    expect(formatAaScore("aa-intelligence-index-v4", 43.4)).toBe("43.4");
  });
});

describe("ranks across evaluated configurations", () => {
  const summary = summariseRankings([
    {
      benchmark_id: "aa-intelligence-index-cost-v4",
      lower_is_better: true,
      entries: [
        { model_id: "a/cheap", score: 10, other_info: "Intelligence Index v4.3.2", configurations: [{ score: 10, variant: "low", other_info: null }, { score: 400, variant: "max", other_info: null }] },
        { model_id: "b/mid", score: 200, other_info: "Intelligence Index v4.3.2", configurations: [] },
        { model_id: "c/old", score: 1, other_info: "Intelligence Index v3.0", configurations: [] },
        { model_id: "anthropic/claude-haiku-5.5", score: 34.31, other_info: "Intelligence Index v4.3.2", configurations: [] },
      ],
    },
    { benchmark_id: "gpqa-diamond", lower_is_better: false, entries: [] },
  ]);

  test("keeps only Artificial Analysis benchmarks", () => {
    expect(Object.keys(summary)).toEqual(["aa-intelligence-index-cost-v4"]);
  });

  test("counts other models' configurations plus this model's own, on the same index version", () => {
    const local = localScores(results, "aa-intelligence-index-cost-v4", "4.3.2");
    expect(local).toEqual([34.31, 56.36, 94.07, 157.58, 330.25]);
    // Cheaper than $330.25: a/cheap low, b/mid, and four of Haiku's own (c/old is another index version).
    expect(aaRank(summary["aa-intelligence-index-cost-v4"], 330.25, "anthropic/claude-haiku-5.5", "4.3.2", local)).toEqual({ rank: 7, total: 8 });
    expect(aaRank(summary["aa-intelligence-index-cost-v4"], 34.31, "anthropic/claude-haiku-5.5", "4.3.2", local)).toEqual({ rank: 2, total: 8 });
  });

  test("has no rank without a summary or other models", () => {
    expect(aaRank(undefined, 1, "x/y", null, [])).toBeNull();
    expect(aaRank({ lowerIsBetter: false, entries: [{ modelId: "x/y", version: null, scores: [1] }] }, 1, "x/y", null, [])).toBeNull();
  });
});

test("other benchmarks exclude Artificial Analysis and Epoch", () => {
  expect(otherHighlights(highlights).map((item) => item.benchmarkId)).toEqual(["gpqa-diamond"]);
});
