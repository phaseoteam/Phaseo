import type { BenchmarkSource, SourceObservation } from "../types";

const SITE = "https://agi-pilled-bench.adamholter.chatgpt.site/";
const DATA = `${SITE}data.json`;

type Model = { id: string; name: string; effort?: string | null; harness?: string | null; family?: string | null; score: number; ci?: [number, number] | null; n_scored?: number };
type Data = { now?: number; models: Model[] };

export function parseAgiPilled(data: Data): SourceObservation[] {
	if (!Array.isArray(data?.models)) throw new Error("AGI-Pilled Bench format changed: expected models[].");
	return data.models
		.filter((model) => model.name && Number.isFinite(model.score))
		.map((model) => ({
			benchmarkId: "agi-pilled-bench",
			// The family is the vendor slug ("anthropic/claude-fable-5.2"); the name is the fallback.
			label: model.family || model.name,
			effort: model.effort || undefined,
			harness: model.harness || undefined,
			value: model.score,
			ciLow: model.ci?.[0],
			ciHigh: model.ci?.[1],
			note: model.n_scored ? `${model.n_scored} scored forecasts` : undefined,
		}));
}

export const agiPilled: BenchmarkSource = {
	id: "agi-pilled",
	name: "AGI-Pilled Bench",
	publisher: "Adam Holter",
	url: SITE,
	attribution: "AGI-Pilled Bench by Adam Holter (agi-pilled-bench.adamholter.chatgpt.site)",
	minRows: 26,
	benchmarks: [
		{
			id: "agi-pilled-bench",
			name: "AGI-Pilled Bench",
			url: SITE,
			category: "knowledge",
			type: "numerical",
			// The board ranks lower forecasts first: lower is "more AGI-pilled".
			higherIsBetter: false,
			unit: "years",
			description: "The model forecasts when AI will reach a set of milestones that it in fact already reached in 2026. Median forecast in years after 2026, with a 90% interval; lower is more AGI-pilled.",
		},
	],
	async fetch(ctx) {
		return parseAgiPilled(await ctx.fetchJson<Data>(DATA));
	},
};
