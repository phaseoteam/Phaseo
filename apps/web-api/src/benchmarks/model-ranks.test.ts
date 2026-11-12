import { describe, expect, it } from "vitest";
import { benchmarkRankInputs, modelBenchmarkRanks, type EpochLeaderboard } from "./model-ranks";

type Summary = { lower_is_better: boolean; entries: Array<{ model_id: string | null; version: string | null; scores: number[] }> };

/** The model page's rank rule (apps/web artificialAnalysisSummaryRank), used as the oracle. */
function rank(summary: Summary, score: number, modelId: string, version: string | null, localScores: number[]) {
	const entries = summary.entries.filter((entry) => !version || !entry.version || entry.version === version);
	const others = entries.filter((entry) => entry.model_id !== modelId);
	if (!others.length) return null;
	const current = localScores.length ? localScores : entries.find((entry) => entry.model_id === modelId)?.scores ?? [score];
	const scores = [...others.flatMap((entry) => entry.scores), ...current];
	return { rank: 1 + scores.filter((value) => summary.lower_is_better ? value < score : value > score).length, total: scores.length };
}

const info = (version: string) => `Artificial Analysis ID src; Intelligence Index v${version}`;
const rankings = [
	{
		benchmark_id: "aa-intelligence-index-v4",
		lower_is_better: false,
		entries: [
			{ model_id: "a/top", score: 70, other_info: info("4.3"), configurations: [{ score: 70 }, { score: 61 }] },
			{ model_id: "a/current", score: 60, other_info: info("4.3"), configurations: [{ score: 60 }, { score: 52 }] },
			{ model_id: "b/tied", score: 60, other_info: info("4.3"), configurations: [{ score: 60 }] },
			{ model_id: "c/older", score: 65, other_info: info("4.2"), configurations: [{ score: 65 }] },
			{ model_id: "d/unversioned", score: 40, other_info: null },
		],
	},
	{
		benchmark_id: "aa-intelligence-index-cost-v4",
		lower_is_better: true,
		entries: [
			{ model_id: "a/top", score: 300, other_info: info("4.3"), configurations: [{ score: 300 }] },
			{ model_id: "b/tied", score: 900, other_info: info("4.3"), configurations: [{ score: 900 }, { score: 1200 }] },
		],
	},
];

function epochEntry(modelId: string, rank: number) {
	return { model_id: modelId, model_name: modelId, organisation_id: null, organisation_name: null, organisation_colour: null, release_date: null, score: 200 - rank, rank, other_info: null, source_link: null, updated_at: null };
}

const epoch: EpochLeaderboard = {
	benchmark_id: "epoch-capabilities-index",
	name: "Epoch Capabilities Index",
	category: null,
	benchmark_type: null,
	lower_is_better: false,
	total_models: 20,
	entries: Array.from({ length: 20 }, (_, index) => epochEntry(index === 15 ? "a/current" : `m/${index}`, index + 1)),
};

describe("model benchmark ranks", () => {
	it("pools other models' scores without changing any rank the model page computes", () => {
		const inputs = benchmarkRankInputs(rankings, epoch);
		const full = Object.fromEntries(inputs.artificial_analysis.map((ranking) => [ranking.benchmark_id, ranking]));
		const pooled = modelBenchmarkRanks(inputs, "a/current").artificial_analysis;
		for (const [benchmarkId, summary] of Object.entries(full)) {
			for (const score of [0, 40, 52, 60, 61, 65, 70, 300, 900, 1000]) {
				for (const version of [null, "4.3", "4.2", "9.9"]) {
					for (const localScores of [[], [score], [60, 52]]) {
						expect(rank(pooled[benchmarkId], score, "a/current", version, localScores)).toEqual(rank(summary, score, "a/current", version, localScores));
					}
				}
			}
		}
	});

	it("keeps the model's own entry and one pooled entry per index version", () => {
		const ranks = modelBenchmarkRanks(benchmarkRankInputs(rankings, null), "a/current");
		expect(ranks.artificial_analysis["aa-intelligence-index-v4"]).toEqual({
			lower_is_better: false,
			entries: [
				{ model_id: "a/current", version: "4.3", scores: [60, 52] },
				{ model_id: null, version: "4.3", scores: [60, 61, 70] },
				{ model_id: null, version: "4.2", scores: [65] },
				{ model_id: null, version: null, scores: [40] },
			],
		});
		expect(ranks.artificial_analysis["aa-intelligence-index-cost-v4"].entries).toEqual([{ model_id: null, version: "4.3", scores: [300, 900, 1200] }]);
		expect(ranks.epoch).toBeNull();
	});

	it("returns the twelve Epoch entries around the model, as the model page shows them", () => {
		const window = (modelId: string) => modelBenchmarkRanks(benchmarkRankInputs([], epoch), modelId).epoch?.entries.map((entry) => entry.rank);
		expect(window("a/current")).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
		expect(window("m/2")).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
		expect(window("m/7")).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
		expect(window("not/ranked")).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
		expect(modelBenchmarkRanks(benchmarkRankInputs([], epoch), "a/current").epoch).toMatchObject({ benchmark_id: "epoch-capabilities-index", total_models: 20 });
	});
});
