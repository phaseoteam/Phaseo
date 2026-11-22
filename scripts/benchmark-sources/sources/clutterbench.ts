import type { BenchmarkSource, SourceObservation } from "../types";

const SITE = "https://clutterbench.adamholter.chatgpt.site/";
const DATA = `${SITE}data.json`;

type Variant = { n?: number; clutter?: number | null; usd?: number | null; sec?: number | null; out?: number | null };
type BoardRow = { model: string; name: string; effort?: string | null; raw?: Variant | null; simple?: Variant | null };
type Data = { builtAt?: string; models?: Record<string, { name: string; effort?: string | null }>; board: BoardRow[] };

const VARIANTS = [
	{ key: "raw", id: "clutterbench" },
	{ key: "simple", id: "clutterbench-simple" },
] as const;

export function parseClutterbench(data: Data): SourceObservation[] {
	if (!Array.isArray(data?.board)) throw new Error("ClutterBench format changed: expected board[].");
	const observedOn = data.builtAt?.slice(0, 10);
	return data.board.flatMap((row) => VARIANTS.flatMap(({ key, id }): SourceObservation[] => {
		const variant = row[key];
		if (!variant || typeof variant.clutter !== "number" || !row.name) return [];
		// The name carries the effort in brackets ("GPT-6.2 Sol (xhigh)"); the model map has it for rows that don't.
		const effort = row.effort ?? data.models?.[row.model]?.effort ?? undefined;
		return [{
			benchmarkId: id,
			label: row.name,
			effort: effort || undefined,
			value: variant.clutter,
			costUsd: variant.usd ?? undefined,
			durationSeconds: variant.sec ?? undefined,
			outputTokens: variant.out ?? undefined,
			note: variant.n ? `${variant.n} graphics` : undefined,
			observedOn,
		}];
	}));
}

export const clutterbench: BenchmarkSource = {
	id: "clutterbench",
	name: "ClutterBench",
	publisher: "Adam Holter",
	url: SITE,
	attribution: "ClutterBench by Adam Holter (github.com/adamholter/clutterbench)",
	minRows: 70,
	benchmarks: [
		{
			id: "clutterbench",
			name: "ClutterBench",
			url: SITE,
			category: "creative",
			type: "percentage",
			higherIsBetter: false,
			unit: "%",
			description: "Running as an agent, the model reads a blog post and builds one 1200×1200 graphic for it in HTML, told only to make it tasteful. A grader labels every element; the score is the share of the graphic the grader would cut as clutter.",
		},
		{
			id: "clutterbench-simple",
			name: "ClutterBench (simple prompt)",
			url: SITE,
			category: "creative",
			type: "percentage",
			higherIsBetter: false,
			unit: "%",
			description: "As ClutterBench, but the prompt adds plain instructions to show one idea, once, with nothing extra. The score is the share of the graphic the grader would cut as clutter.",
		},
	],
	async fetch(ctx) {
		return parseClutterbench(await ctx.fetchJson<Data>(DATA));
	},
};
