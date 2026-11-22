import { parseCsv, parseNumber } from "../parse";
import type { BenchmarkSource, SourceObservation } from "../types";

const SITE = "https://benchmarks.duellab.org/";
const CSV = `${SITE}leaderboard.csv`;
// "Reasoning Variants": one ranked row per model and reasoning setting.
const TRACK = "full_freedom/mixed";

/** DuelLab's reasoning levels as effort ids; settings that aren't an effort level ("Reasoning enabled", "Default") give none. */
export function duelLabEffort(level: string): string | undefined {
	const text = level.toLowerCase().replace(/\(.*?\)/g, "").trim();
	if (/^(reasoning|thinking) disabled$/.test(text) || text === "none") return "none";
	const word = text.match(/^(minimal|low|medium|high|xhigh|max)\b/);
	return word?.[1];
}

export function parseDuelLab(csv: string): SourceObservation[] {
	const rows = parseCsv(csv);
	if (!rows.length || !("track_id" in rows[0]) || !("score" in rows[0])) throw new Error("DuelLab format changed: expected track_id and score columns.");
	return rows.flatMap((row): SourceObservation[] => {
		if (row.row_kind !== "track" || row.track_id !== TRACK || row.ranking_status !== "ranked") return [];
		const value = parseNumber(row.score);
		if (value === null || !row.model_display_name) return [];
		const level = row.reasoning_level ?? "";
		const effort = duelLabEffort(level);
		return [{
			benchmarkId: "duellab-gamebench-2",
			label: row.model_display_name,
			effort,
			value,
			costUsd: parseNumber(row.codegen_cost_usd_mean) ?? undefined,
			note: !effort && level ? level : undefined,
			observedOn: row.last_measured_at?.slice(0, 10) || undefined,
		}];
	});
}

export const duellab: BenchmarkSource = {
	id: "duellab",
	name: "DuelLab GameBench 2",
	publisher: "DuelLab",
	url: SITE,
	attribution: "GameBench 2 by DuelLab (benchmarks.duellab.org)",
	minRows: 190,
	benchmarks: [
		{
			id: "duellab-gamebench-2",
			name: "DuelLab GameBench 2",
			url: SITE,
			category: "games",
			type: "numerical",
			higherIsBetter: true,
			unit: "score",
			description: "The model writes game-playing programs for eight games such as Go, Chess and Shogi, and the programs play rated matches against each other. Mean score across games per model and reasoning setting, where each failed program generation counts as 0, with code-generation cost per program.",
		},
	],
	async fetch(ctx) {
		return parseDuelLab(await ctx.fetchText(CSV));
	},
};
