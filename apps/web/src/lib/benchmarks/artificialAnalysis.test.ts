import { artificialAnalysisConfigurationRank, artificialAnalysisMetricsForBenchmark, artificialAnalysisVersion } from "./artificialAnalysis";

describe("Artificial Analysis benchmark helpers", () => {
	it("ignores sentence punctuation without merging index versions", () => {
		expect(artificialAnalysisVersion("Intelligence Index v4.3. Rounded headline score")).toBe("4.3");
		expect(artificialAnalysisVersion("Intelligence Index v4.1.1; historical")).toBe("4.1.1");
		expect(artificialAnalysisVersion("Intelligence Index v4.3.")).toBe("4.3");
	});
	it.each(["1..2", "4.3..1", "4.3beta", "4.3.2x"])("rejects the malformed version %s", (version) => {
		expect(artificialAnalysisVersion(`Intelligence Index v${version}`)).toBeNull();
	});
	it("counts every configuration, preserves ties, and reverses cost ordering", () => {
		const entries = [{ model_id: "test/model", model_name: "Test", organisation_id: null, organisation_name: null, score: 50, rank: 1,
			configurations: [50, 45, 45, 40].map((score) => ({ score, variant: null, result_key: String(score), other_info: null, source_link: null, updated_at: null })) }];
		expect(artificialAnalysisConfigurationRank(entries, 45, false)).toEqual({ rank: 2, total: 4 });
		expect(artificialAnalysisConfigurationRank(entries, 40, false)).toEqual({ rank: 4, total: 4 });
		expect(artificialAnalysisConfigurationRank(entries, 45, true)).toEqual({ rank: 2, total: 4 });
	});
	it("uses the benchmark route version for comparison metrics", () => {
		expect(artificialAnalysisMetricsForBenchmark("aa-intelligence-index-v5").map((metric) => metric.id)).toEqual([
			"aa-intelligence-index-v5",
			"aa-coding-index-v5",
			"aa-agentic-index-v5",
			"aa-intelligence-index-cost-v5",
		]);
	});
});
