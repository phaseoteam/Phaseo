import { parseCsv, parseNumber } from "../parse";
import type { BenchmarkSource, SourceObservation } from "../types";

const PAGE = "https://petergpt.github.io/bullshit-benchmark/viewer/index.v2.html";
const CSV = "https://raw.githubusercontent.com/petergpt/bullshit-benchmark/main/data/v2/latest/leaderboard.csv";
const EFFORTS = new Set(["none", "minimal", "low", "medium", "high", "xhigh", "max"]);

export function parseBsbench(csv: string): SourceObservation[] {
	const rows = parseCsv(csv);
	if (!rows.length || !("model" in rows[0]) || !("green_rate" in rows[0])) throw new Error("BullshitBench format changed: expected model and green_rate columns.");
	return rows.flatMap((row): SourceObservation[] => {
		const rate = parseNumber(row.green_rate);
		if (rate === null || !row.model) return [];
		// "anthropic/claude-opus-4.8@reasoning=xhigh": the reasoning setting is also its own column.
		const label = row.model.split("@")[0];
		const reasoning = (row.reasoning ?? "").toLowerCase();
		return [{
			benchmarkId: "bullshit-benchmark-v2",
			label,
			effort: EFFORTS.has(reasoning) ? reasoning : undefined,
			value: rate * 100,
			note: reasoning && !EFFORTS.has(reasoning) ? `reasoning: ${reasoning}` : undefined,
		}];
	});
}

export const bsbench: BenchmarkSource = {
	id: "bsbench",
	name: "BullshitBench",
	publisher: "petergpt",
	url: PAGE,
	attribution: "BullshitBench by petergpt (github.com/petergpt/bullshit-benchmark)",
	minRows: 160,
	benchmarks: [
		{
			id: "bullshit-benchmark-v2",
			name: "BullshitBench v2",
			url: PAGE,
			category: "reasoning",
			type: "percentage",
			higherIsBetter: true,
			unit: "%",
			description: "The model answers 100 questions with broken premises across software, finance, legal, medical and physics, built with 13 nonsense techniques. A three-judge panel grades each answer; the score is the share of all attempts with clear pushback that rejects the premise.",
		},
	],
	async fetch(ctx) {
		return parseBsbench(await ctx.fetchText(CSV));
	},
};
