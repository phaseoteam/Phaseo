import { describe, expect, it } from "vitest";
import { composeComparePairs } from "@/models/compare-pairs";
import type { PeerBoardSource } from "@/models/compare-peers";

function board(id: string, ids: string[]): PeerBoardSource {
	return {
		benchmark_id: id,
		name: id,
		source: "artificial-analysis",
		lower_is_better: false,
		entries: ids.map((modelId, index) => ({ model_id: modelId, model_name: modelId.toUpperCase(), organisation_id: null, score: 90 - index, rank: index + 1 })),
	};
}

describe("composeComparePairs", () => {
	it("pairs each leader with the next three models on the intelligence index, ids sorted, no repeats", () => {
		const pairs = composeComparePairs([
			board("aa-coding-index-v4", ["x/ignored", "y/ignored"]),
			board("aa-intelligence-index-v4", ["d/one", "c/two", "b/three", "a/four", "e/five"]),
		]);

		expect(pairs.map((pair) => pair.models.map((model) => model.id).join(" vs "))).toEqual([
			"c/two vs d/one", "b/three vs d/one", "a/four vs d/one",
			"b/three vs c/two", "a/four vs c/two", "c/two vs e/five",
			"a/four vs b/three", "b/three vs e/five",
			"a/four vs e/five",
		]);
		expect(pairs[0]!.models[0]).toEqual({ id: "c/two", name: "C/TWO" });
	});

	it("returns nothing without a board", () => {
		expect(composeComparePairs([])).toEqual([]);
	});
});
