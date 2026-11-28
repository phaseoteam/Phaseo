import { jsonAfter, nextFlight } from "../parse";
import type { BenchmarkSource, SourceObservation } from "../types";

const SITE = "https://boardbench.dev";
// The board's scale changes between releases; a new release needs a new benchmark id.
const VERSION = "0.2";

type Point = { slug: string; className?: string; effort?: string; label?: string; qualityPct: number; costUsd?: number };

/** BoardBench has no data file: the home page's "Quality vs cost" chart carries every model's overall score. */
export function parseBoardbench(html: string): SourceObservation[] {
	// The footer's release picker marks the current release: <span aria-current="true">boardbench-0.2</span>.
	const current = html.match(/aria-current="true"[^>]*>\s*boardbench-(\d+(?:\.\d+)*)/i)?.[1];
	if (current !== VERSION) throw new Error(`BoardBench current release is ${current ?? "unknown"}, expected ${VERSION}; add a benchmark for the new release.`);
	const points = jsonAfter<Point[]>(nextFlight(html), /"points":\[/);
	if (!Array.isArray(points)) throw new Error("BoardBench format changed: expected a points array.");
	return points
		.filter((point) => (point.className || point.label) && Number.isFinite(point.qualityPct))
		.map((point) => ({
			benchmarkId: "boardbench-0-2",
			label: point.className || point.label!,
			effort: point.effort || undefined,
			value: point.qualityPct,
		}));
}

export const boardbench: BenchmarkSource = {
	id: "boardbench",
	name: "BoardBench",
	publisher: "BoardBench",
	url: SITE,
	attribution: "BoardBench (boardbench.dev)",
	minRows: 5,
	benchmarks: [
		{
			id: "boardbench-0-2",
			name: "BoardBench 0.2",
			url: SITE,
			category: "games",
			type: "percentage",
			higherIsBetter: true,
			unit: "%",
			description: "Models play 30 unseen puzzles across ten board games: Xiangqi, Chess, Go, Backgammon, Shogi, Scrabble, Kalah, Gomoku, Othello and Connect Four. Overall score from 0 to 100.",
		},
	],
	async fetch(ctx) {
		return parseBoardbench(await ctx.fetchText(SITE));
	},
};
