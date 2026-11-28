import { parseNumber } from "../parse";
import type { BenchmarkSource, SourceObservation } from "../types";

const PAGE = "https://dubesor.de/chess/chess-leaderboard";
const DATA = "https://dubesor.de/chess/chess-leaderboard-llm.txt";

// Reference players the file itself labels as not LLMs.
const BASELINES = /^(random-mover|maia\d*-\d+|stockfish.*)$/i;

/** The rows of the markdown table under the `## <heading>` section, keyed by the table's header line. */
function sectionTable(text: string, heading: RegExp): Array<Record<string, string>> {
	const lines = text.split(/\r?\n/);
	const start = lines.findIndex((line) => line.startsWith("## ") && heading.test(line));
	if (start < 0) throw new Error(`Dubesor chess: section ${heading} not found.`);
	const rows: string[][] = [];
	for (const line of lines.slice(start + 1)) {
		if (line.startsWith("## ")) break;
		if (!line.startsWith("|")) continue;
		const cells = line.slice(1, line.endsWith("|") ? -1 : undefined).split("|").map((cell) => cell.trim());
		if (cells.every((cell) => /^-+$/.test(cell))) continue;
		rows.push(cells);
	}
	const [header, ...body] = rows;
	if (!header) throw new Error(`Dubesor chess: section ${heading} has no table.`);
	return body.map((cells) => Object.fromEntries(header.map((key, index) => [key, cells[index] ?? ""])));
}

/** "1924 ±141" → value and 95% band; "-" → null. */
function elo(cell: string): { value: number; ciLow?: number; ciHigh?: number } | null {
	const match = cell.match(/^(-?\d+(?:\.\d+)?)(?:\s*±\s*(\d+(?:\.\d+)?))?$/);
	if (!match) return null;
	const value = Number(match[1]);
	const margin = match[2] ? Number(match[2]) : null;
	return margin === null ? { value } : { value, ciLow: value - margin, ciHigh: value + margin };
}

function modelLabel(cell: string): string {
	// "˟" marks a deprecated model.
	return cell.replace(/˟/g, "").trim();
}

/** "$1.66", "~$1.65" → USD; "17.16¢" → USD. */
function usd(cell: string): number | undefined {
	const cents = cell.match(/^~?(\d*\.?\d+)\s*¢$/);
	if (cents) return Number(cents[1]) / 100;
	return parseNumber(cell.replace(/^~/, "")) ?? undefined;
}

/** "45s", "5.1s" → seconds. */
function seconds(cell: string): number | undefined {
	const match = cell.match(/^(\d*\.?\d+)\s*s$/);
	return match ? Number(match[1]) : undefined;
}

export function parseDubesorChess(text: string): SourceObservation[] {
	const updated = text.match(/Last updated:\s*(\d{4}-\d{2}-\d{2})/)?.[1];
	const games = sectionTable(text, /Detailed Player Statistics.*Mixed Modes/i).flatMap((row): SourceObservation[] => {
		const label = modelLabel(row.Model ?? "");
		const rating = elo(row.Elo ?? "");
		if (!label || BASELINES.test(label) || !rating) return [];
		return [{
			benchmarkId: "dubesor-chess",
			label,
			...rating,
			costUsd: usd(row.Cost ?? ""),
			note: row.Games ? `${row.Games} games (W-D-L ${row["W-D-L"]})` : undefined,
			observedOn: updated,
		}];
	});
	const puzzles = sectionTable(text, /Puzzle Rating/i).flatMap((row): SourceObservation[] => {
		const label = modelLabel(row.Model ?? "");
		const rating = elo(row["Puzzle Elo"] ?? "");
		if (!label || BASELINES.test(label) || !rating) return [];
		return [{
			benchmarkId: "dubesor-chess-puzzles",
			label,
			...rating,
			costUsd: usd(row.Cost ?? ""),
			durationSeconds: seconds(row.Spd ?? ""),
			note: row.Puzzles ? `${row.Puzzles} puzzles` : undefined,
			observedOn: updated,
		}];
	});
	if (!games.length || !puzzles.length) throw new Error("Dubesor chess format changed: a leaderboard table is empty.");
	return [...games, ...puzzles];
}

export const dubesorChess: BenchmarkSource = {
	id: "dubesor-chess",
	name: "Dubesor AI Chess Leaderboard",
	publisher: "Dubesor",
	url: PAGE,
	attribution: "AI Chess Leaderboard by Dubesor (dubesor.de)",
	minRows: 230,
	benchmarks: [
		{
			id: "dubesor-chess",
			name: "Dubesor AI Chess (Elo)",
			url: PAGE,
			category: "games",
			type: "numerical",
			higherIsBetter: true,
			unit: "Elo",
			description: "Models play full chess games against other AI models, in reasoning and continuation modes. Elo across both modes, relative to this pool of models only, with cost per game.",
		},
		{
			id: "dubesor-chess-puzzles",
			name: "Dubesor AI Chess Puzzles (Elo)",
			url: PAGE,
			category: "games",
			type: "numerical",
			higherIsBetter: true,
			unit: "Elo",
			description: "Models solve puzzles from a fixed 500-puzzle Lichess set. Maximum-likelihood performance rating against the official Lichess puzzle ratings, counting only first-try solves.",
		},
	],
	async fetch(ctx) {
		return parseDubesorChess(await ctx.fetchText(DATA));
	},
};
