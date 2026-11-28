import { parseCsv, parseNumber } from "../parse";
import type { BenchmarkSource, SourceObservation } from "../types";

/**
 * Sam Paech's EQ-Bench boards (eqbench.com). Each page ships its leaderboard as a CSV in a JavaScript template literal
 * (`leaderboardDataX = \`…\``); EQ-Bench 4 ships one JSON object. Names may carry flags: "*" new, "!" NSFW-capable.
 */
const ORIGIN = "https://eqbench.com";

/** The CSV inside `name = \`…\`` in a page script. */
export function templateCsv(script: string, variable: string): Array<Record<string, string>> {
	const match = script.match(new RegExp(`${variable}\\s*=\\s*\`([\\s\\S]*?)\``));
	if (!match) throw new Error(`EQ-Bench format changed: ${variable} not found.`);
	return parseCsv(match[1].trim());
}

const label = (name: string) => name.trim().replace(/^[!*]+/, "").trim();

type CsvBoard = { id: string; script: string; variable: string; column: string; ciLow?: string; ciHigh?: string; cost?: string; factor?: number; nameColumn?: string };

const CSV_BOARDS: CsvBoard[] = [
	{ id: "eqbench", script: "eqbench3.js", variable: "leaderboardDataEQBench3", column: "elo_norm", ciLow: "ci_low_norm", ciHigh: "ci_high_norm" },
	{ id: "creative-writing-v3", script: "creative_writing.js", variable: "leaderboardDataCreativeWritingV3", column: "elo_score" },
	{ id: "eqbench-longform-writing", script: "creative_writing_longform.js", variable: "leaderboardDataLongformV3", column: "overall_score_100" },
	{ id: "judgemark-v4", script: "judgemark-v4.js", variable: "leaderboardDataJudgemarkV4", column: "score", ciLow: "ci_low", ciHigh: "ci_high", cost: "cost", factor: 100, nameColumn: "model" },
	{ id: "spiral-bench", script: "spiral-bench.js", variable: "leaderboardDataDelusion", column: "score_0_100" },
	{ id: "buzzbench", script: "buzzbench.js", variable: "leaderboardDataBuzzbench", column: "score", ciLow: "c95_lower", ciHigh: "c95_upper", nameColumn: "model" },
];

export function parseEqbenchCsv(board: CsvBoard, script: string): SourceObservation[] {
	const factor = board.factor ?? 1;
	return templateCsv(script, board.variable).flatMap((row) => {
		const value = parseNumber(row[board.column]);
		const name = label(row[board.nameColumn ?? "model_name"] ?? "");
		if (value === null || !name) return [];
		const low = board.ciLow ? parseNumber(row[board.ciLow]) : null;
		const high = board.ciHigh ? parseNumber(row[board.ciHigh]) : null;
		return [{
			benchmarkId: board.id,
			label: name,
			value: value * factor,
			ciLow: low !== null ? low * factor : undefined,
			ciHigh: high !== null ? high * factor : undefined,
			costUsd: board.cost ? parseNumber(row[board.cost]) ?? undefined : undefined,
		}];
	});
}

type Eqbench4File = { generated_at?: string; models: Array<{ model: string; display?: string; elo: number; ci_low?: number; ci_high?: number }> };

export function parseEqbench4(script: string): SourceObservation[] {
	const start = script.indexOf("{");
	const end = script.lastIndexOf("}");
	if (start < 0 || end < start) throw new Error("EQ-Bench 4 format changed: no data object.");
	const file = JSON.parse(script.slice(start, end + 1)) as Eqbench4File;
	if (!Array.isArray(file.models)) throw new Error("EQ-Bench 4 format changed: expected models[].");
	const observedOn = file.generated_at?.slice(0, 10);
	return file.models
		.filter((model) => Number.isFinite(model.elo) && model.model)
		.map((model) => ({ benchmarkId: "eqbench-4", label: label(model.model), value: model.elo, ciLow: model.ci_low, ciHigh: model.ci_high, observedOn }));
}

const elo = { type: "numerical", unit: "Elo", higherIsBetter: true } as const;

export const eqbench: BenchmarkSource = {
	id: "eqbench",
	name: "EQ-Bench",
	publisher: "EQ-Bench (Sam Paech)",
	url: ORIGIN,
	attribution: "EQ-Bench by Sam Paech (eqbench.com)",
	minRows: 280,
	benchmarks: [
		{ id: "eqbench", name: "EQ-Bench 3", url: `${ORIGIN}/eqbench3.html`, category: "communication", ...elo, description: "The model handles multi-turn roleplay scenarios that test emotional intelligence, and an LLM judge compares transcripts pairwise. Normalised Elo with a confidence interval." },
		{ id: "eqbench-4", name: "EQ-Bench 4", url: `${ORIGIN}/`, category: "communication", ...elo, description: "The model holds multi-turn chats with simulated personas; a three-judge LLM panel compares transcripts blind and pairwise. Elo from a Bradley-Terry fit, with a confidence interval." },
		{ id: "creative-writing-v3", name: "EQ-Bench Creative Writing v3", url: `${ORIGIN}/creative_writing.html`, category: "creativity", ...elo, description: "The model writes short creative pieces from prompts; an LLM judge compares them pairwise with controls for length and slop. Elo score." },
		{ id: "eqbench-longform-writing", name: "EQ-Bench Longform Creative Writing", url: `${ORIGIN}/creative_writing_longform.html`, category: "creativity", type: "numerical", unit: "points", higherIsBetter: true, description: "The model plans and writes a novella over eight 1,000-word turns; an LLM judge scores every chapter and the whole piece on a rubric. Overall score out of 100." },
		{ id: "judgemark-v4", name: "Judgemark v4", url: `${ORIGIN}/judgemark-v4.html`, category: "general", type: "numerical", unit: "points", higherIsBetter: true, description: "The model acts as a judge, scoring a fixed set of creative-writing samples. Composite score for how well its scores separate and rank the writers, out of 100, with judging cost." },
		{ id: "spiral-bench", name: "Spiral-Bench", url: `${ORIGIN}/spiral-bench.html`, category: "safety", type: "numerical", unit: "points", higherIsBetter: true, description: "Simulated multi-turn chats with a user drifting into delusion; an LLM judge counts protective and risky behaviours such as pushback or sycophancy. Safety score out of 100." },
		{ id: "buzzbench", name: "BuzzBench", url: `${ORIGIN}/buzzbench.html`, category: "creativity", type: "numerical", unit: "points", higherIsBetter: true, description: "The model explains the humour in Never Mind the Buzzcocks introductions and predicts the audience's reaction; an LLM judge compares the answers with human-written gold responses. Score with a 95% interval." },
	],
	async fetch(ctx) {
		const [eqbench4, ...scripts] = await Promise.all([
			ctx.fetchText(`${ORIGIN}/eqbench4/eqbench4_data.js`),
			...CSV_BOARDS.map((board) => ctx.fetchText(`${ORIGIN}/${board.script}`)),
		]);
		return [...parseEqbench4(eqbench4), ...CSV_BOARDS.flatMap((board, index) => parseEqbenchCsv(board, scripts[index]))];
	},
};
