import { describe, expect, it } from "vitest";
import { intelligenceValueResults, latestIndexVersion } from "./artificialAnalysis";

const intelligenceId = "aa-intelligence-index-v4";
const costId = "aa-intelligence-index-cost-v4";
const row = (benchmark_id: string, score_numeric: number | null, source = "source-high", version = "4.3") => ({
	benchmark_id, score_numeric, model_slug: "test/model", variant: "high", result_key: null,
	other_info: `Example; Artificial Analysis ID ${source}; Intelligence Index v${version}`,
	source_link: "https://artificialanalysis.ai/models/example", updated_at: "2026-10-01T10:00:00Z",
});

describe("Artificial Analysis intelligence value", () => {
	it("uses the imported dataset version rather than a standalone manual patch version", () => {
		expect(latestIndexVersion([row(intelligenceId, 50), { other_info: "Artificial Analysis Intelligence Index v4.3.2; High reasoning" }])).toBe("4.3");
	});
	it("pairs the same model, source configuration, version and import snapshot", () => {
		const intelligence = row(intelligenceId, 50);
		const cost = row(costId, 100);
		expect(intelligenceValueResults([intelligence, cost], intelligenceId, costId)).toEqual([expect.objectContaining({ score_numeric: 2, intelligence_score: 50, evaluation_cost: 100 })]);
		for (const mismatch of [
			{ ...cost, model_slug: "test/other" }, { ...cost, variant: "low" },
			{ ...cost, updated_at: "2026-09-01T10:00:00Z" },
			row(costId, 1, "other-source"), row(costId, 1, "source-high", "4.1.1"),
		]) expect(intelligenceValueResults([intelligence, mismatch], intelligenceId, costId)).toEqual([]);
	});
	it("excludes zero cost and undefined or invalid ratios", () => {
		for (const score of [0, -1, null, NaN, Infinity]) expect(intelligenceValueResults([row(intelligenceId, score), row(costId, 100)], intelligenceId, costId)).toEqual([]);
		for (const cost of [0, -1, null, NaN, Infinity]) expect(intelligenceValueResults([row(intelligenceId, 50), row(costId, cost)], intelligenceId, costId)).toEqual([]);
	});
});
