import type { PeerBoardSource } from "@/models/compare-peers";

/** Models near the top of the main index, each paired with its closest rivals. */
const PAIR_LEADERS = 40;
const RIVALS_PER_MODEL = 3;

export type ComparePairModel = { id: string; name: string };
export type ComparePair = { models: [ComparePairModel, ComparePairModel] };

/**
 * The comparisons worth a page of their own: each of the leading models on the
 * main capability index against the next few models below it. A fixed, small
 * set keeps crawlers on pages people search for instead of every possible pair.
 * Each pair's ids are sorted, so one comparison has one URL.
 */
export function composeComparePairs(boards: PeerBoardSource[]): ComparePair[] {
	const board = boards.find((entry) => entry.benchmark_id.startsWith("aa-intelligence-index-v")) ?? boards[0];
	if (!board) return [];
	const leaders = [...board.entries].sort((left, right) => left.rank - right.rank).slice(0, PAIR_LEADERS);
	const seen = new Set<string>();
	const pairs: ComparePair[] = [];
	leaders.forEach((entry, index) => {
		for (const rival of leaders.slice(index + 1, index + 1 + RIVALS_PER_MODEL)) {
			const models = [
				{ id: entry.model_id, name: entry.model_name || entry.model_id },
				{ id: rival.model_id, name: rival.model_name || rival.model_id },
			].sort((left, right) => (left.id < right.id ? -1 : 1)) as [ComparePairModel, ComparePairModel];
			const key = `${models[0].id}|${models[1].id}`;
			if (seen.has(key)) continue;
			seen.add(key);
			pairs.push({ models });
		}
	});
	return pairs;
}
