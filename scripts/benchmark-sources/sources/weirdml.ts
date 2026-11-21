import { parseCsv, parseNumber } from "../parse";
import type { BenchmarkSource, SourceObservation } from "../types";

const V2_PAGE = "https://htihle.github.io/weirdml_v2.html";
const V2_CSV = "https://htihle.github.io/data/weirdml_data.csv";
const V3_PAGE = "https://htihle.github.io/weirdml.html";
const V3_JSON = "https://htihle.github.io/assets/data/weirdml_v3.json";

type V3Model = {
	id: string;
	name: string;
	slug?: string;
	agent?: string;
	reasoning_effort?: string;
	synthetic?: boolean;
	score: number;
	interval?: [number, number];
	mean_api_cost_usd?: number;
	mean_output_tokens?: number;
	release_date?: string;
};
type V3File = { schema_version: number; mode?: string; generated?: string; models: V3Model[] };

export function parseWeirdmlV3(file: V3File): SourceObservation[] {
	if (file?.schema_version !== 1 || !Array.isArray(file.models)) throw new Error("WeirdML v3 format changed: expected schema_version 1 with models[].");
	if (file.mode && file.mode !== "real") throw new Error(`WeirdML v3 data is in "${file.mode}" mode.`);
	const observedOn = file.generated?.slice(0, 10);
	return file.models
		.filter((model) => !model.synthetic && Number.isFinite(model.score))
		.map((model) => ({
			benchmarkId: "weirdml-v3",
			// The slug names the model without the effort suffix the display name carries.
			label: model.slug ?? model.name,
			effort: model.reasoning_effort || undefined,
			harness: model.agent?.replace(/_/g, " "),
			value: model.score * 100,
			ciLow: model.interval ? model.interval[0] * 100 : undefined,
			ciHigh: model.interval ? model.interval[1] * 100 : undefined,
			costUsd: model.mean_api_cost_usd,
			outputTokens: model.mean_output_tokens ? Math.round(model.mean_output_tokens) : undefined,
			observedOn,
		}));
}

export function parseWeirdmlV2(csv: string): SourceObservation[] {
	return parseCsv(csv).flatMap((row) => {
		const accuracy = parseNumber(row.avg_acc);
		if (accuracy === null) return [];
		const error = parseNumber(row.avg_acc_standard_error);
		// internal_model_name is "model:effort"; the display name repeats the effort in brackets.
		const [, effort] = (row.internal_model_name ?? "").split(":");
		return [{
			benchmarkId: "weirdml",
			label: row.model_slug || row.display_name,
			effort: effort || undefined,
			value: accuracy * 100,
			ciLow: error !== null ? (accuracy - 1.96 * error) * 100 : undefined,
			ciHigh: error !== null ? (accuracy + 1.96 * error) * 100 : undefined,
			costUsd: parseNumber(row.cost_per_run_usd) ?? undefined,
			outputTokens: parseNumber(row.mean_total_output_tokens) ?? undefined,
			observedOn: row.release_date || undefined,
		}];
	});
}

export const weirdml: BenchmarkSource = {
	id: "weirdml",
	name: "WeirdML",
	publisher: "Håvard Ihle",
	url: V3_PAGE,
	attribution: "WeirdML by Håvard Ihle (htihle.github.io)",
	minRows: 40,
	benchmarks: [
		{
			id: "weirdml",
			name: "WeirdML v2",
			url: V2_PAGE,
			category: "code",
			type: "percentage",
			higherIsBetter: true,
			unit: "%",
			description: "The model writes code to solve unusual machine-learning tasks on small, strange datasets, then improves it from feedback over several attempts. Average accuracy across the tasks.",
		},
		{
			id: "weirdml-v3",
			name: "WeirdML v3",
			url: V3_PAGE,
			category: "agents",
			type: "percentage",
			higherIsBetter: true,
			unit: "%",
			description: "A coding agent works through 11 hand-made machine-learning and data-analysis tasks with unfamiliar data, unclear goals or little data. Overall effective score with a 95% interval.",
		},
	],
	async fetch(ctx) {
		const [csv, v3] = await Promise.all([ctx.fetchText(V2_CSV), ctx.fetchJson<V3File>(V3_JSON)]);
		return [...parseWeirdmlV2(csv), ...parseWeirdmlV3(v3)];
	},
};
