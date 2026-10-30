import {
	buildBenchmarkMetadataDescription,
	buildBenchmarkMetadataTitle,
} from "./metadata";

describe("benchmark metadata", () => {
	it("adds benchmark and leaderboard intent to a short benchmark name", () => {
		expect(buildBenchmarkMetadataTitle("HMMT")).toBe(
			"HMMT Benchmark Leaderboard",
		);
	});

	it("does not repeat benchmark when it is already in the name", () => {
		expect(buildBenchmarkMetadataTitle("SWE-bench Benchmark")).toBe(
			"SWE-bench Benchmark Leaderboard",
		);
	});

	it("describes the visible leaderboard content without a volatile winner", () => {
		expect(buildBenchmarkMetadataDescription("IFEval", 1_245)).toBe(
			"Compare 1,245 model scores on the IFEval benchmark leaderboard. Review rankings, historical results, evaluation methodology, and available sources on Phaseo.",
		);
	});

	it("does not repeat benchmark in the description", () => {
		expect(buildBenchmarkMetadataDescription("SWE-bench Benchmark", 10)).toContain(
			"the SWE-bench Benchmark leaderboard",
		);
	});
});
