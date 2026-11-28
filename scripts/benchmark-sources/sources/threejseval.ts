import type { BenchmarkSource, SourceObservation } from "../types";

const PAGE = "https://threejseval.com/ranking";
const API = "https://threejseval.com/api/ranking";

type Model = { modelId: string; label: string; rating: number; battles?: number };
type File = { computedAt?: string; models: Model[] };

export function parseThreejsEval(file: File): SourceObservation[] {
	if (!Array.isArray(file?.models)) throw new Error("threejseval format changed: expected models[].");
	const observedOn = file.computedAt?.slice(0, 10);
	return file.models
		.filter((model) => (model.modelId || model.label) && Number.isFinite(model.rating))
		.map((model) => ({
			benchmarkId: "threejseval",
			// The id names the vendor ("claude-fable-5-2-high"); the label drops it ("Fable 5.2 High").
			label: model.modelId || model.label,
			value: model.rating,
			note: model.battles ? `${model.battles} battles` : undefined,
			observedOn,
		}));
}

export const threejsEval: BenchmarkSource = {
	id: "threejseval",
	name: "threejseval",
	publisher: "threejseval",
	url: PAGE,
	attribution: "threejseval arena (threejseval.com)",
	minRows: 25,
	benchmarks: [
		{
			id: "threejseval",
			name: "threejseval Arena",
			url: PAGE,
			category: "code",
			type: "numerical",
			higherIsBetter: true,
			unit: "Elo",
			description: "AI coding agents build Three.js scenes from the same prompts, and people vote between two scenes without seeing which model made them. Elo from the blind votes.",
		},
	],
	async fetch(ctx) {
		return parseThreejsEval(await ctx.fetchJson<File>(API));
	},
};
