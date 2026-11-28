import { describe, it, expect } from "vitest";
import {
	benchmarkOrderFromAscending,
	compareBenchmarkScores,
	compareBenchmarkScoresForBenchmark,
	formatBenchmarkScore,
	getLowerIsBetter,
	normalizeBenchmarkScoreValue,
} from "./scoreFormat";

describe("benchmark score ordering semantics", () => {
	it("treats ascending_order=true as higher-is-better", () => {
		expect(benchmarkOrderFromAscending(true)).toBe("higher");
		expect(getLowerIsBetter(null, true)).toBe(false);
		expect(compareBenchmarkScores(10, 20, true)).toBeGreaterThan(0);
		expect(compareBenchmarkScores(20, 10, true)).toBeLessThan(0);
	});

	it("treats ascending_order=false as lower-is-better", () => {
		expect(benchmarkOrderFromAscending(false)).toBe("lower");
		expect(getLowerIsBetter(null, false)).toBe(true);
		expect(compareBenchmarkScores(10, 20, false)).toBeLessThan(0);
		expect(compareBenchmarkScores(20, 10, false)).toBeGreaterThan(0);
	});

	it("defaults missing ordering metadata to higher-is-better", () => {
		expect(compareBenchmarkScores(10, 20, null)).toBeGreaterThan(0);
		expect(compareBenchmarkScores(20, 10, undefined)).toBeLessThan(0);
	});

	it("preserves higher-is-better fallback when ordering metadata is missing from a benchmark map", () => {
		const orderingByBenchmark = new Map<string, boolean | null>();

		expect(compareBenchmarkScoresForBenchmark(10, 20, "bench-missing", orderingByBenchmark)).toBeGreaterThan(0);
		expect(compareBenchmarkScoresForBenchmark(20, 10, "bench-missing", orderingByBenchmark)).toBeLessThan(0);
	});
});

describe("benchmark score scale", () => {
	it("never scales synced leaderboard results, which are stored in points", () => {
		for (const value of [0.21, 0.76, 1, 57]) {
			expect(normalizeBenchmarkScoreValue(value, true, "arc-prize")).toBe(value);
		}
		expect(formatBenchmarkScore({ value: 0.21, isPercentage: true, sourceId: "arc-prize" })).toBe("0.21%");
		expect(formatBenchmarkScore({ value: 0.76, isPercentage: true, sourceId: "arc-prize" })).toBe("0.76%");
		expect(formatBenchmarkScore({ value: 1, isPercentage: true, sourceId: "arc-prize" })).toBe("1%");
		expect(formatBenchmarkScore({ value: 57, isPercentage: true, sourceId: "arc-prize" })).toBe("57%");
	});

	it("keeps the fraction heuristic for hand-entered results", () => {
		expect(normalizeBenchmarkScoreValue(0.76, true, null)).toBe(76);
		expect(normalizeBenchmarkScoreValue(0.76, true)).toBe(76);
		expect(formatBenchmarkScore({ value: 0.76, isPercentage: true })).toBe("76%");
		expect(normalizeBenchmarkScoreValue(0.76, false)).toBe(0.76);
	});

	it("ranks sourced sub-1% scores below a legacy fraction", () => {
		const scores = [
			normalizeBenchmarkScoreValue(0.21, true, "arc-prize")!,
			normalizeBenchmarkScoreValue(0.76, true, null)!,
			normalizeBenchmarkScoreValue(57, true, "arc-prize")!,
			normalizeBenchmarkScoreValue(1, true, "arc-prize")!,
		].sort((a, b) => compareBenchmarkScores(a, b, true));
		expect(scores).toEqual([76, 57, 1, 0.21]);
	});

	it("does not scale an already normalized aggregate again", () => {
		expect(formatBenchmarkScore({ value: 0.5, isPercentage: true, normalized: true })).toBe("0.50%");
	});
});
