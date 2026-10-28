import { describe, expect, it } from "vitest";
import { composeComparePeers, type PeerBoardSource } from "@/models/compare-peers";

function board(id: string, count: number): PeerBoardSource {
	return {
		benchmark_id: id,
		name: id,
		source: "artificial-analysis",
		lower_is_better: false,
		// Out of order on purpose: the board must sort by rank itself.
		entries: Array.from({ length: count }, (_, index) => ({
			model_id: `lab/model-${count - index}`,
			model_name: `Model ${count - index}`,
			organisation_id: "lab",
			score: 100 - (count - index),
			rank: count - index,
		})),
	};
}

describe("composeComparePeers", () => {
	it("lists the leaders, then compared models further down, in rank order", () => {
		const [result] = composeComparePeers([board("aa-intelligence-index-v5", 40)], ["lab/model-3", "lab/model-22"]);

		expect(result).toMatchObject({ id: "aa-intelligence-index-v5", total: 40, lowerIsBetter: false });
		expect(result!.entries.map((entry) => entry.rank)).toEqual([1, 2, 3, 4, 5, 22]);
		expect(result!.entries.at(-1)).toEqual({ modelId: "lab/model-22", name: "Model 22", labId: "lab", score: 78, rank: 22 });
	});

	it("drops boards none of the compared models are ranked on", () => {
		const boards = composeComparePeers([board("aa-coding-index-v5", 10), board("epoch-capabilities-index", 3)], ["lab/model-2"]);

		expect(boards.map((entry) => entry.id)).toEqual(["aa-coding-index-v5", "epoch-capabilities-index"]);
		expect(composeComparePeers([board("aa-coding-index-v5", 10)], ["other/model"])).toEqual([]);
	});
});
