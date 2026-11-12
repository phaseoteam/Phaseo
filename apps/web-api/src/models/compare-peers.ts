/** How many leaders each board lists above the compared models. */
const LEADERS = 5;

type RankedEntry = {
	model_id: string;
	model_name?: string | null;
	organisation_id?: string | null;
	score: number;
	rank: number;
};

export type PeerBoardSource = {
	benchmark_id: string;
	name: string;
	source: "artificial-analysis" | "epoch";
	lower_is_better: boolean;
	entries: RankedEntry[];
};

export type ComparePeerEntry = { modelId: string; name: string; labId: string | null; score: number; rank: number };

export type ComparePeerBoard = {
	id: string;
	name: string;
	source: "artificial-analysis" | "epoch";
	lowerIsBetter: boolean;
	/** Every model on the board, so a rank reads "4 of 312". */
	total: number;
	/** The leaders, then any compared model outside them, in rank order. */
	entries: ComparePeerEntry[];
};

function toEntry(entry: RankedEntry): ComparePeerEntry {
	return { modelId: entry.model_id, name: entry.model_name || entry.model_id, labId: entry.organisation_id ?? null, score: entry.score, rank: entry.rank };
}

/**
 * The compared models in context: each board's leaders plus wherever the
 * compared models sit. Boards none of the compared models appear on are left
 * out, so the section only shows ranks it can explain.
 */
export function composeComparePeers(boards: PeerBoardSource[], modelIds: string[]): ComparePeerBoard[] {
	const selected = new Set(modelIds);
	return boards.flatMap((board) => {
		const ranked = [...board.entries].sort((left, right) => left.rank - right.rank);
		if (!ranked.some((entry) => selected.has(entry.model_id))) return [];
		const shown = ranked.filter((entry, index) => index < LEADERS || selected.has(entry.model_id));
		return [{
			id: board.benchmark_id,
			name: board.name,
			source: board.source,
			lowerIsBetter: board.lower_is_better,
			total: ranked.length,
			entries: shown.map(toEntry),
		}];
	});
}
