import { parseCsv, parseNumber } from "../parse";
import type { BenchmarkSource, SourceObservation } from "../types";

/**
 * The UGI Leaderboard (DontPlanToEnd) keeps its data as a CSV in its Hugging Face Space. Most rows are community
 * fine-tunes and merges; only foundation models (`Is Foundation`) can be catalogue models, so only those are read.
 */
const PAGE = "https://huggingface.co/spaces/DontPlanToEnd/UGI-Leaderboard";
const DATA = `${PAGE}/resolve/main/ugi-leaderboard-data.csv`;

const MEASURES = [
	{ id: "ugi", column: "UGI 🏆" },
	{ id: "ugi-willingness", column: "W/10 👍" },
	{ id: "ugi-natint", column: "NatInt 💡" },
	{ id: "ugi-writing", column: "Writing ✍️" },
] as const;

/** "openai/gpt-oss-20b (reasoning=low)", "anthropic/claude-opus-4-20250514 (thinking=disabled)". */
export function splitUgiName(name: string): { label: string; effort?: string } {
	const match = name.match(/^(.*?)\s*\((reasoning|thinking)=([^)]+)\)\s*$/i);
	if (!match) return { label: name.trim() };
	const setting = match[3].toLowerCase().trim();
	const effort = match[2].toLowerCase() === "reasoning" ? setting : /^(disabled|false|off)$/.test(setting) ? "none" : "thinking";
	return { label: match[1].trim(), effort };
}

function isoDate(value: string | undefined): string | undefined {
	const match = value?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
	return match ? `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}` : undefined;
}

export function parseUgi(csv: string): SourceObservation[] {
	const rows = parseCsv(csv.replace(/^﻿/, ""));
	if (!rows.length || !("author/model_name" in rows[0]) || !MEASURES.every((measure) => measure.column in rows[0])) throw new Error("UGI format changed: expected author/model_name and the four score columns.");
	return rows.flatMap((row) => {
		if ((row["Is Foundation"] ?? "").toLowerCase() !== "true") return [];
		const { label, effort } = splitUgiName(row["author/model_name"]);
		const observedOn = isoDate(row["Test Date"]);
		return MEASURES.flatMap((measure) => {
			const value = parseNumber(row[measure.column]);
			return value === null ? [] : [{ benchmarkId: measure.id, label, effort, value, observedOn, url: row["Model Link"] || undefined }];
		});
	});
}

const score = { url: PAGE, type: "numerical", unit: "points", higherIsBetter: true } as const;

export const ugi: BenchmarkSource = {
	id: "ugi",
	name: "UGI Leaderboard",
	publisher: "DontPlanToEnd",
	url: PAGE,
	attribution: "UGI Leaderboard by DontPlanToEnd (Hugging Face)",
	minRows: 900,
	benchmarks: [
		{ id: "ugi", name: "UGI", category: "safety", ...score, description: "Private questions on sensitive topics, combining uncensored knowledge with willingness to follow controversial instructions. UGI score." },
		{ id: "ugi-willingness", name: "UGI Willingness", category: "safety", ...score, unit: "/10", description: "Private prompts measuring how far the model follows challenging instructions before refusing or deviating. Willingness score out of 10." },
		{ id: "ugi-natint", name: "UGI NatInt", category: "knowledge", ...score, description: "Private questions on general knowledge and reasoning across textbook, popular-culture and world-model topics. NatInt score." },
		{ id: "ugi-writing", name: "UGI Writing", category: "creativity", ...score, description: "The model writes to prompts and is scored on intelligence, style, repetition and length adherence, informed by human preferences. Writing score." },
	],
	async fetch(ctx) {
		return parseUgi(await ctx.fetchText(DATA));
	},
};
