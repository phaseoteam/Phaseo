import { parseCsv, parseNumber } from "../parse";
import type { BenchmarkSource, SourceObservation } from "../types";

const PAGE = "https://maxim-saplin.github.io/llm_chess/";
// The page's own data file: a CSV in a template literal.
const DATA = "https://raw.githubusercontent.com/maxim-saplin/llm_chess/main/docs/data.js";

export function parseLlmChess(js: string): SourceObservation[] {
	const csv = js.match(/const\s+data\s*=\s*`([\s\S]*?)`/)?.[1];
	if (!csv) throw new Error("LLM Chess format changed: expected `const data = \\`…\\``.");
	const rows = parseCsv(csv.trim());
	if (!rows.length || !("Player" in rows[0]) || !("elo" in rows[0])) throw new Error("LLM Chess format changed: expected Player and elo columns.");
	return rows.flatMap((row): SourceObservation[] => {
		const value = parseNumber(row.elo);
		// The board leaves Elo empty for players with no anchored games or a 100% win/loss record.
		if (value === null || !row.Player) return [];
		const margin = parseNumber(row.elo_moe_95);
		// "@q4_k_m", "@bf16": the quantisation a local model ran at.
		const [label, quantisation] = row.Player.split("@");
		return [{
			benchmarkId: "llm-chess",
			label: label.trim(),
			value,
			ciLow: margin !== null ? value - margin : undefined,
			ciHigh: margin !== null ? value + margin : undefined,
			costUsd: parseNumber(row.average_game_cost) || undefined,
			durationSeconds: parseNumber(row.average_time_per_game_seconds) ?? undefined,
			note: [quantisation ? `quantisation ${quantisation}` : null, row.total_games ? `${row.total_games} games` : null].filter(Boolean).join(", ") || undefined,
		}];
	});
}

export const llmChess: BenchmarkSource = {
	id: "llm-chess",
	name: "LLM Chess Leaderboard",
	publisher: "Maxim Saplin",
	url: PAGE,
	attribution: "LLM Chess Leaderboard by Maxim Saplin (github.com/maxim-saplin/llm_chess)",
	minRows: 110,
	benchmarks: [
		{
			id: "llm-chess",
			name: "LLM Chess (Elo)",
			url: PAGE,
			category: "games",
			type: "numerical",
			higherIsBetter: true,
			unit: "Elo",
			description: "The model plays chess as Black against a random player and the Komodo Dragon engine through a move-by-move tool loop. Estimated Elo anchored to Dragon's skill levels and a calibrated random player, with a 95% interval.",
		},
	],
	async fetch(ctx) {
		return parseLlmChess(await ctx.fetchText(DATA));
	},
};
