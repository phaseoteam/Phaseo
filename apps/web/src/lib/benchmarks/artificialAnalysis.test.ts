import { artificialAnalysisMetricsForBenchmark } from "./artificialAnalysis";

describe("Artificial Analysis benchmark helpers", () => {
	it("uses the benchmark route version for comparison metrics", () => {
		expect(artificialAnalysisMetricsForBenchmark("aa-intelligence-index-v5").map((metric) => metric.id)).toEqual([
			"aa-intelligence-index-v5",
			"aa-coding-index-v5",
			"aa-agentic-index-v5",
			"aa-intelligence-index-cost-v5",
		]);
	});
});
