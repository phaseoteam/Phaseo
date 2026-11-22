import type { BenchmarkSource, SourceObservation } from "../types";

const SITE = "https://khalil-bench.adamholter.chatgpt.site/";
const DATA = `${SITE}data.json`;

type BoardRow = { model: string; n: number; score: number };
type Data = { meta?: { built_at_et?: string }; board: BoardRow[] };

export function parseKhalilbench(data: Data): SourceObservation[] {
	if (!Array.isArray(data?.board)) throw new Error("Khalil Bench format changed: expected board[].");
	const observedOn = data.meta?.built_at_et?.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
	return data.board
		.filter((row) => row.model && Number.isFinite(row.score))
		.map((row) => ({
			benchmarkId: "khalil-bench",
			label: row.model,
			value: row.score,
			note: `${row.n} verdict${row.n === 1 ? "" : "s"}`,
			observedOn,
		}));
}

export const khalilbench: BenchmarkSource = {
	id: "khalilbench",
	name: "Khalil Bench",
	publisher: "Adam Holter",
	url: SITE,
	attribution: "Khalil Bench by Adam Holter, verdicts by @kamkmgamer (khalil-bench.adamholter.chatgpt.site)",
	minRows: 17,
	benchmarks: [
		{
			id: "khalil-bench",
			name: "Khalil Bench",
			url: SITE,
			category: "creative",
			type: "numerical",
			higherIsBetter: true,
			unit: "points",
			description: "Adam Holter posts model tests (frontend, games, SVG drawings and more) and one reader, Khalil, replies with a verdict. Each verdict gets a severity from -2 to +2, turned into 0 to 100 points; a model's score is the average of its points.",
		},
	],
	async fetch(ctx) {
		return parseKhalilbench(await ctx.fetchJson<Data>(DATA));
	},
};
