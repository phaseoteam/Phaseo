import { artificialAnalysisConfigurationRank, artificialAnalysisMetricsForBenchmark, artificialAnalysisVersion, buildArtificialAnalysisRanking, buildArtificialAnalysisValue, formatArtificialAnalysisValue } from "./artificialAnalysis";
import type { PublicBenchmarkRanking } from "@/lib/fetchers/frontend/fetchPublicCatalog";

describe("Artificial Analysis benchmark helpers", () => {
	it("derives preview value from existing API configurations without mixing reasoning settings", () => {
		const config = (score: number, variant: string, updated_at = "2026-10-01") => ({ score, variant, result_key: variant, updated_at, source_link: null, other_info: `Example ${variant}; Artificial Analysis ID source-${variant}; Intelligence Index v4.3.2` });
		const benchmark = (benchmark_id: string, configurations: ReturnType<typeof config>[]): PublicBenchmarkRanking => ({ benchmark_id, name: "Test", category: null, benchmark_type: null, total_models: 1, lower_is_better: false, entries: [{ model_id: "test/model", model_name: "Test", organisation_id: null, organisation_name: null, rank: 1, score: configurations[0].score, configurations }] });
		const intelligence = benchmark("aa-intelligence-index-v4", [config(50, "max"), config(40, "low")]);
		const cost = benchmark("aa-intelligence-index-cost-v4", [config(500, "max"), config(100, "low")]);
		for (const scores of [[100, 200], [200, 100], [0, 100], [100, 0]]) {
			expect(buildArtificialAnalysisValue([intelligence, benchmark(cost.benchmark_id, scores.map((score) => config(score, "low")))]).entries).toEqual([]);
		}
		expect(buildArtificialAnalysisValue([intelligence, benchmark(cost.benchmark_id, [config(100, "low"), config(100, "low")])]).entries[0].score).toBe(2.5);
		expect(buildArtificialAnalysisValue([intelligence, cost]).entries[0]).toMatchObject({ score: 2.5, intelligence_score: 40, evaluation_cost: 100, other_info: "Example low; Artificial Analysis ID source-low; Intelligence Index v4.3.2" });
		const configurations = buildArtificialAnalysisValue([intelligence, cost]).entries;
		expect(configurations.map((entry) => entry.variant)).toEqual(["low", "max"]);
		expect(new Set(configurations.map((entry) => entry.configuration_id)).size).toBe(2);
		expect(configurations[1]).toMatchObject({ score: 10, intelligence_score: 50, evaluation_cost: 500, rank: 2 });
		expect(buildArtificialAnalysisValue([intelligence, benchmark(cost.benchmark_id, [config(0, "low")])]).entries).toEqual([]);
		expect(buildArtificialAnalysisValue([intelligence, benchmark(cost.benchmark_id, [config(0, "low"), config(500, "max")])]).entries[0]).toMatchObject({ score: 10, intelligence_score: 50, evaluation_cost: 500 });
		expect(buildArtificialAnalysisValue([intelligence, benchmark(cost.benchmark_id, [config(1, "low", "old-snapshot")])]).entries).toEqual([]);
		expect(buildArtificialAnalysisValue([intelligence]).entries).toEqual([]);
	});
	it("keeps the imported rankings visible when a manual result has a newer patch version", () => {
		const results = [
			{ id: "imported", model_id: "test/imported", score: 50, is_self_reported: false, other_info: "Model; Artificial Analysis ID source-test; Intelligence Index v4.3" },
			{ id: "manual", model_id: "test/manual", score: 53, is_self_reported: false, other_info: "Artificial Analysis Intelligence Index v4.3.2; High reasoning" },
		];
		expect(buildArtificialAnalysisRanking({ id: "aa-intelligence-index-v4", name: null, category: null, ascending_order: true, total_models: 2, link: null, results }).entries.map((entry) => entry.model_id)).toEqual(["test/imported"]);
	});
	it("shows small positive ratios without rounding them to zero", () => {
		expect(formatArtificialAnalysisValue(0.001234)).toBe("$0.00123");
		expect(formatArtificialAnalysisValue(0)).toBe("$0");
	});
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
