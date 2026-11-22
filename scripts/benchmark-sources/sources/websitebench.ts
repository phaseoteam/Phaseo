import { parseCsv, parseNumber } from "../parse";
import type { BenchmarkSource, SourceObservation } from "../types";

const SITE = "https://website-bench.com/";
const CSV = `${SITE}data/leaderboard.csv`;

export function parseWebsitebench(csv: string): SourceObservation[] {
	const rows = parseCsv(csv);
	if (!rows.length || !("model" in rows[0]) || !("overall" in rows[0])) throw new Error("WebsiteBench format changed: expected model and overall columns.");
	return rows.flatMap((row): SourceObservation[] => {
		const value = parseNumber(row.overall);
		if (value === null || !row.model) return [];
		const tokens = parseNumber(row.tokens_millions);
		return [{
			benchmarkId: "websitebench",
			label: row.model,
			value,
			costUsd: parseNumber(row.cost) ?? undefined,
			note: tokens !== null ? `${Math.round(tokens)}M tokens and ${Math.round(parseNumber(row.turns) ?? 0)} turns per task` : undefined,
		}];
	});
}

export const websitebench: BenchmarkSource = {
	id: "websitebench",
	name: "WebsiteBench",
	publisher: "TIGER-AI-Lab",
	url: SITE,
	attribution: "WebsiteBench by TIGER-AI-Lab (website-bench.com)",
	minRows: 5,
	benchmarks: [
		{
			id: "websitebench",
			name: "WebsiteBench",
			url: SITE,
			category: "agents",
			type: "percentage",
			higherIsBetter: true,
			unit: "%",
			description: "An agent explores a production website through a browser and rebuilds a full-stack version that matches its appearance and behaviour. Pass rate on the hidden tests over 70 tasks, with mean cost per task.",
		},
	],
	async fetch(ctx) {
		return parseWebsitebench(await ctx.fetchText(CSV));
	},
};
