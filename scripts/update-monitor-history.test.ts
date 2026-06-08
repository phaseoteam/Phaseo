import assert from "node:assert/strict";
import { testingExports } from "./update-monitor-history";

function main() {
  const before = [
    {
      benchmark_id: "aider-polyglot",
      other_info: "With Thinking, Pass @ 1, Diff Method",
      score: 88,
    },
    {
      benchmark_id: "aider-polyglot",
      other_info: "Without Thinking, Pass @ 1, Diff Method",
      score: 26.7,
    },
  ];
  const after = [
    {
      benchmark_id: "aider-polyglot",
      other_info: "With Thinking, Pass @ 1, Diff Method",
      score: 90,
    },
    {
      benchmark_id: "aider-polyglot",
      other_info: "Without Thinking, Pass @ 1, Diff Method",
      score: 26.7,
    },
  ];

  assert.deepEqual(testingExports.diffBenchmarks(before, after, "benchmarks"), [
    {
      field: "benchmarks.aider-polyglot[With Thinking, Pass @ 1, Diff Method].score",
      before: 88,
      after: 90,
    },
  ]);

  assert.deepEqual(testingExports.diffBenchmarks(before, before, "benchmarks"), []);

  console.log("update-monitor-history tests passed");
}

main();
