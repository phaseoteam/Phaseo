import type { BenchmarkSource, SourceObservation } from "../types";

const SITE = "https://chessbenchllm.onrender.com";
const API = `${SITE}/api/leaderboard`;

type Player = {
	player_id: string;
	rating: number;
	confidence_low?: number;
	confidence_high?: number;
	games_played?: number;
	is_anchor?: boolean;
	is_engine?: boolean;
	retired?: boolean;
	avg_cost_per_game?: number;
	fide_estimate?: number;
};

export function parseChessLlmBenchmark(players: Player[]): SourceObservation[] {
	if (!Array.isArray(players)) throw new Error("Chess LLM Benchmark format changed: expected an array of players.");
	return players
		// Engines and rating anchors are reference players; retired players no longer play.
		.filter((player) => !player.is_anchor && !player.is_engine && !player.retired && player.player_id && Number.isFinite(player.rating))
		.map((player) => ({
			benchmarkId: "chess-llm-benchmark",
			// "gemini-4-carbon (medium)": the effort sits in brackets, which the matcher splits off.
			label: player.player_id,
			value: player.rating,
			ciLow: player.confidence_low,
			ciHigh: player.confidence_high,
			costUsd: player.avg_cost_per_game,
			note: player.games_played ? `${player.games_played} games` : undefined,
		}));
}

export const chessLlmBenchmark: BenchmarkSource = {
	id: "chess-llm-benchmark",
	name: "Chess LLM Benchmark",
	publisher: "Chess LLM Benchmark",
	url: SITE,
	attribution: "Chess LLM Benchmark (chessbenchllm.onrender.com)",
	minRows: 85,
	benchmarks: [
		{
			id: "chess-llm-benchmark",
			name: "Chess LLM Benchmark (rating)",
			url: SITE,
			category: "games",
			type: "numerical",
			higherIsBetter: true,
			unit: "rating",
			description: "Models play chess against calibrated engine anchors and other LLMs, receiving the position, board and move history and answering with one move. Glicko-2 rating calibrated to approximate Lichess Classical ratings, with a 95% interval and cost per game.",
		},
	],
	async fetch(ctx) {
		return parseChessLlmBenchmark(await ctx.fetchJson<Player[]>(API));
	},
};
