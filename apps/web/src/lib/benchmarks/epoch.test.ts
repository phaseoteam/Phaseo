import { selectEpochLeaderboardEntries } from "./epoch";

const entries = Array.from({ length: 100 }, (_, index) => ({
	model_id: `model-${index + 1}`,
	rank: index + 1,
	score: 200 - index,
	other_info: `95% CI ${199 - index}-${201 - index}`,
}));

test.each([
	["model-1", 1],
	["model-6", 1],
	["model-7", 2],
	["model-41", 36],
	["model-100", 89],
	["missing", 1],
	[undefined, 1],
] as const)("preserves the displayed neighbour window for %s", (modelId, firstRank) => {
	const selected = selectEpochLeaderboardEntries(entries, modelId);
	expect(selected.map(entry => entry.rank)).toEqual(Array.from({ length: 12 }, (_, index) => firstRank + index));
	expect(selected[0]).toBe(entries[firstRank - 1]);
});

test("compacting before client rendering preserves the same entries for every rank", () => {
	for (const entry of entries) {
		const compact = selectEpochLeaderboardEntries(entries, entry.model_id);
		expect(selectEpochLeaderboardEntries(compact, entry.model_id)).toEqual(compact);
		expect(compact).toContain(entry);
	}
	expect(entries).toHaveLength(100);
	expect(entries[99].rank).toBe(100);
});

test.each([0, 1, 7, 12])("keeps all entries of a short leaderboard (%s)", count => {
	const short = entries.slice(0, count);
	expect(selectEpochLeaderboardEntries(short, "model-7")).toEqual(short);
});
