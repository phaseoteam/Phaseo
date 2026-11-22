import { load } from "js-yaml";
import type { BenchmarkSource, SourceObservation } from "../types";

const PAGE = "https://metr.org/time-horizons/";
const DATA = "https://metr.org/assets/benchmark_results_1_1.yaml";

type Estimate = { estimate?: number; ci_low?: number; ci_high?: number };
type MetrModel = { metrics?: { p50_horizon_length?: Estimate; p80_horizon_length?: Estimate }; release_date?: string | Date };
type MetrFile = { benchmark_name?: string; results?: Record<string, MetrModel> };

/** "claude_3_5_sonnet_20240620_inspect" → "claude-3-5-sonnet-20240620": the suffix names METR's harness, not the model. */
export function metrLabel(key: string): string {
	return key.replace(/_inspect$/, "").replace(/_/g, "-");
}

export function parseMetr(text: string): SourceObservation[] {
	const file = load(text) as MetrFile;
	if (!file?.results || typeof file.results !== "object") throw new Error("METR benchmark results format changed: expected results{}.");
	return Object.entries(file.results).flatMap(([key, model]) => {
		const observations: SourceObservation[] = [];
		for (const [benchmarkId, metric] of [["metr-time-horizon-50", model.metrics?.p50_horizon_length], ["metr-time-horizon-80", model.metrics?.p80_horizon_length]] as const) {
			if (typeof metric?.estimate !== "number" || !Number.isFinite(metric.estimate)) continue;
			observations.push({
				benchmarkId,
				label: metrLabel(key),
				value: metric.estimate,
				ciLow: metric.ci_low,
				ciHigh: metric.ci_high,
				note: file.benchmark_name,
			});
		}
		return observations;
	});
}

const DESCRIPTION = "Software, research and reasoning tasks that take human experts from seconds to many hours. METR fits how success falls with the human time a task takes";

export const metr: BenchmarkSource = {
	id: "metr",
	name: "METR time horizons",
	publisher: "METR",
	url: PAGE,
	attribution: "METR (metr.org)",
	minRows: 31,
	benchmarks: [
		{ id: "metr-time-horizon-50", name: "METR time horizon (50%)", url: PAGE, category: "agents", type: "numerical", higherIsBetter: true, unit: "minutes", description: `${DESCRIPTION}; the score is the human task length, in minutes, at which the agent succeeds 50% of the time, with a 95% interval.` },
		{ id: "metr-time-horizon-80", name: "METR time horizon (80%)", url: PAGE, category: "agents", type: "numerical", higherIsBetter: true, unit: "minutes", description: `${DESCRIPTION}; the score is the human task length, in minutes, at which the agent succeeds 80% of the time, with a 95% interval.` },
	],
	async fetch(ctx) {
		return parseMetr(await ctx.fetchText(DATA));
	},
};
