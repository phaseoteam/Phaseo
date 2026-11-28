import type { BenchmarkSource, SourceObservation } from "../types";

const SITE = "https://hearing-bench.adamholter.chatgpt.site/";
const DATA = `${SITE}results.json`;

type Model = {
	model: string;
	harness?: string;
	effort?: string | null;
	correct: number;
	near_misses?: number;
	output_tokens_per_clip?: number | null;
	cost_usd_per_run?: number | null;
	seconds_per_clip?: number | null;
	api_model_id?: string | null;
};
type Data = { clips: number; updated?: string; models: Model[] };

export function parseHearingbench(data: Data): SourceObservation[] {
	if (!Array.isArray(data?.models) || !data.clips) throw new Error("Hearing Bench format changed: expected clips and models[].");
	return data.models
		.filter((model) => model.model && Number.isFinite(model.correct))
		.map((model) => ({
			benchmarkId: "hearing-bench",
			// The API id names the vendor ("google/gemini-4-carbon"); the name is the fallback.
			label: model.api_model_id || model.model,
			effort: model.effort || undefined,
			harness: model.harness || undefined,
			value: (model.correct / data.clips) * 100,
			costUsd: model.cost_usd_per_run ?? undefined,
			durationSeconds: model.seconds_per_clip ?? undefined,
			outputTokens: model.output_tokens_per_clip ?? undefined,
			note: typeof model.near_misses === "number" ? `${model.correct} correct, ${model.near_misses} near misses of ${data.clips} clips` : undefined,
			observedOn: data.updated,
		}));
}

export const hearingbench: BenchmarkSource = {
	id: "hearingbench",
	name: "Hearing Bench",
	publisher: "Adam Holter",
	url: SITE,
	attribution: "Hearing Bench by Adam Holter (hearing-bench.adamholter.chatgpt.site)",
	minRows: 35,
	benchmarks: [
		{
			id: "hearing-bench",
			name: "Hearing Bench",
			url: SITE,
			category: "vision",
			type: "percentage",
			higherIsBetter: true,
			unit: "%",
			description: "The model sees a picture of a sound, never the audio, and has to say what the sound is: 100 clips across five tiers from everyday sounds to sentences. Share of clips named correctly, with cost per run of all clips and seconds and output tokens per clip.",
		},
	],
	async fetch(ctx) {
		return parseHearingbench(await ctx.fetchJson<Data>(DATA));
	},
};
