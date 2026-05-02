import {
	benchmarkOrderFromAscending,
	compareBenchmarkScores,
	compareBenchmarkScoresForBenchmark,
	getLowerIsBetter,
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
