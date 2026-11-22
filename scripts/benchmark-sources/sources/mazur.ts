import { parseNumber } from "../parse";
import type { BenchmarkDefinition, BenchmarkSource, SourceObservation } from "../types";

/**
 * Lech Mazur's benchmarks each publish their leaderboard as a Markdown table in the repo README. The table to read is
 * the first one after a heading or line matching `after`, and the score is the column whose header matches `column`.
 */
const RAW = "https://raw.githubusercontent.com/lechmazur";

type Board = BenchmarkDefinition & { repo: string; branch?: string; after?: RegExp; column: RegExp; ciColumn?: RegExp };

/** Rows of the first Markdown table at or after the first line matching `after`, as header → cell maps. */
export function markdownTable(markdown: string, after?: RegExp): Array<Record<string, string>> {
	const lines = markdown.split(/\r?\n/);
	let index = after ? lines.findIndex((line) => after.test(line)) : 0;
	if (index < 0) throw new Error(`No line matches ${after}.`);
	while (index < lines.length && !(lines[index].trim().startsWith("|") && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1] ?? ""))) index += 1;
	if (index >= lines.length) throw new Error("No Markdown table found.");
	const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
	const header = cells(lines[index]);
	const rows: Array<Record<string, string>> = [];
	for (let row = index + 2; row < lines.length && lines[row].trim().startsWith("|"); row += 1) {
		const values = cells(lines[row]);
		rows.push(Object.fromEntries(header.map((key, column) => [key, values[column] ?? ""])));
	}
	return rows;
}

/** "**GPT-6.2 Astra (high)**", "Qwen 4 Max (high)⁂", "[Model](link)" → plain label. */
export function cleanMarkdownLabel(cell: string): string {
	return cell
		.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
		.replace(/[*_`]/g, "")
		.replace(/[⁂†‡§¹²³⁴⁵⁶⁷⁸⁹⁰]+/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

const NON_MODEL = /\b(human|humans|baseline|random)\b/i;

export function parseMazurBoard(board: Pick<Board, "id" | "after" | "column" | "ciColumn">, markdown: string): SourceObservation[] {
	const rows = markdownTable(markdown, board.after);
	if (!rows.length) throw new Error(`${board.id}: empty table.`);
	const headers = Object.keys(rows[0]);
	const valueKey = headers.find((header) => board.column.test(header));
	const labelKey = headers.find((header) => /^(model|llm|model name)/i.test(header));
	if (!valueKey || !labelKey) throw new Error(`${board.id} format changed: no ${board.column} or model column in [${headers.join(", ")}].`);
	const ciKey = board.ciColumn ? headers.find((header) => board.ciColumn!.test(header)) : undefined;
	return rows.flatMap((row) => {
		const label = cleanMarkdownLabel(row[labelKey]);
		const value = parseNumber(row[valueKey].replace(/[*_]/g, ""));
		if (!label || value === null || NON_MODEL.test(label)) return [];
		// Intervals are written "4.223 to 4.379" or "1595-1619".
		const ci = ciKey ? row[ciKey].replace(/[*_]/g, "").match(/(-?[\d.]+)\s*(?:to|-|–)\s*(-?[\d.]+)/) : null;
		return [{ benchmarkId: board.id, label, value, ciLow: ci ? Number(ci[1]) : undefined, ciHigh: ci ? Number(ci[2]) : undefined }];
	});
}

const repo = (name: string) => `https://github.com/lechmazur/${name}`;
const BOARDS: Board[] = [
	{ repo: "writing", id: "creative-story-writing", name: "LLM Creative Story-Writing Benchmark", url: repo("writing"), category: "creativity", type: "numerical", unit: "points", higherIsBetter: true, after: /^###\s+Leaderboard/, column: /^Comparison score/i, ciColumn: /bootstrap interval/i, description: "The model writes short stories that must include ten required elements; LLM evaluators compare stories written to the same brief pairwise. Relative comparison score (zero is near the middle of the field) with a 95% bootstrap interval." },
	{ repo: "elimination_game", id: "elimination-game", name: "Elimination Game", url: repo("elimination_game"), category: "reasoning", type: "numerical", unit: "TrueSkill", higherIsBetter: true, column: /^(&mu;|μ)$/, description: "Eight models talk, form alliances and vote each other out over several rounds, then a jury picks the winner. TrueSkill rating (μ)." },
	{ repo: "divergent", id: "divergent-thinking", name: "LLM Divergent Thinking Creativity Benchmark", url: repo("divergent"), category: "creativity", type: "numerical", unit: "points", higherIsBetter: true, column: /^Score$/i, description: "The model lists 25 words as different as possible from each other and from 50 seed words, under starting-letter rules. Average LLM-judged divergence score (0–10)." },
	{ repo: "confabulations", branch: "master", id: "confabulations", name: "Confabulations", url: repo("confabulations"), category: "knowledge", type: "numerical", unit: "%", higherIsBetter: false, column: /^Weighted$/i, description: "Questions about provided documents, some of which have no answer in the text. Weighted mix of the confabulation rate (answering when no answer exists) and the non-response rate; lower is better." },
	{ repo: "nyt-connections", branch: "master", id: "nyt-connections", name: "NYT Connections (extended)", url: repo("nyt-connections"), category: "reasoning", type: "percentage", unit: "%", higherIsBetter: true, column: /^Score/i, description: "The model solves NYT Connections word-grouping puzzles, extended with extra trick words. Share of groups solved." },
	{ repo: "generalization", id: "thematic-generalisation-v2", name: "Thematic Generalization Benchmark v2", url: repo("generalization"), category: "reasoning", type: "percentage", unit: "%", higherIsBetter: true, after: /^###\s+Cross-family hard-subset leaderboard/i, column: /^Top-1 Accuracy/i, description: "From a few examples and anti-examples, the model infers a hidden theme and picks the one candidate that fits it. Top-1 accuracy on the cross-family hard subset." },
	{ repo: "step_game", id: "step-game", name: "Multi-Agent Step Race", url: repo("step_game"), category: "reasoning", type: "numerical", unit: "TrueSkill", higherIsBetter: true, after: /^##\s+LLM Step-Game Leaderboard/i, column: /^mu$/i, description: "Models race to a finish line by secretly choosing steps of 1, 3 or 5, where colliding choices cancel; they can talk and bluff between rounds. TrueSkill rating (μ)." },
	{ repo: "buyout_game", id: "buyout-game", name: "Buyout Game", url: repo("buyout_game"), category: "reasoning", type: "numerical", unit: "rating", higherIsBetter: true, after: /^##\s+Main Leaderboard/i, column: /^BT$/i, description: "Eight models play a money-driven elimination game with bargaining, transfers and hostile takeovers. Bradley-Terry rating." },
	{ repo: "debate", id: "llm-debate", name: "LLM Debate Benchmark", url: repo("debate"), category: "reasoning", type: "numerical", unit: "rating", higherIsBetter: true, after: /^##\s+Bradley-Terry leaderboard/i, column: /^BT$/i, description: "Models debate each other over several turns with sides swapped between matches, and LLM judges pick the winner. Bradley-Terry rating." },
	{ repo: "pact", id: "pact-negotiation", name: "PACT", url: repo("pact"), category: "reasoning", type: "numerical", unit: "rating", higherIsBetter: true, column: /^PACT Bilateral Rating$/i, ciColumn: /^Rating 95% CI$/i, description: "Two models bargain as buyer and seller over 20 rounds of a negotiation. PACT bilateral rating with a 95% interval." },
	{ repo: "persuasion", id: "llm-persuasion", name: "LLM Persuasion Benchmark", url: repo("persuasion"), category: "communication", type: "numerical", unit: "points", higherIsBetter: true, after: /^##\s+Main Leaderboard/i, column: /^Average Persuasion Strength$/i, description: "Over several turns, one model tries to change another model's stated position. Average persuasion strength." },
	{ repo: "sycophancy", id: "narrator-sycophancy", name: "LLM Sycophancy Benchmark", url: repo("sycophancy"), category: "safety", type: "percentage", unit: "%", higherIsBetter: false, after: /^##\s+Main Leaderboard/i, column: /^Sycophancy$/i, description: "The same dispute is told twice, once by each side, and the model is asked who is right. Sycophancy rate: share of pairs where it sides with whichever narrator is asking; lower is better." },
	{ repo: "pgg_bench", id: "pgg-bench", name: "PGG-Bench: Contribute & Punish", url: repo("pgg_bench"), category: "reasoning", type: "numerical", unit: "TrueSkill", higherIsBetter: true, column: /^μ$/, description: "Models play a repeated public-goods game where they choose how much to contribute and whom to punish. TrueSkill rating (μ)." },
	{ repo: "bazaar", id: "bazaar", name: "BAZAAR", url: repo("bazaar"), category: "reasoning", type: "numerical", unit: "TrueSkill", higherIsBetter: true, after: /^##\s+Multi-Pass TrueSkill Leaderboard/i, column: /^μ$/, description: "Models trade as buyers and sellers in a simulated double-auction market. Multi-pass TrueSkill rating (μ)." },
	{ repo: "translation", id: "round-trip-translation", name: "LLM Round-Trip Translation Benchmark", url: repo("translation"), category: "language", type: "numerical", unit: "points", higherIsBetter: true, column: /^Mean Score$/i, description: "The model translates English text into another language and back, and LLM judges rate how much meaning survives. Mean score (0–10)." },
];

export const mazur: BenchmarkSource = {
	id: "mazur",
	name: "Lech Mazur's benchmarks",
	publisher: "Lech Mazur",
	url: "https://github.com/lechmazur",
	attribution: "Benchmarks by Lech Mazur (github.com/lechmazur)",
	minRows: 430,
	benchmarks: BOARDS.map(({ repo: _repo, branch: _branch, after: _after, column: _column, ciColumn: _ciColumn, ...definition }) => definition),
	async fetch(ctx) {
		const readmes = await Promise.all(BOARDS.map((board) => ctx.fetchText(`${RAW}/${board.repo}/${board.branch ?? "main"}/README.md`)));
		return BOARDS.flatMap((board, index) => parseMazurBoard(board, readmes[index]));
	},
};
