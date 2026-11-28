import { withClaudePrefix } from "./labels";
import type { BenchmarkSource, SourceObservation } from "../types";

const SITE = "https://bughunt.productcompass.pm/";
const DATA = `${SITE}data/benchmark.json`;
const EFFORTS = new Set(["none", "minimal", "low", "medium", "high", "xhigh", "max"]);

type Run = {
	model: string;
	harness?: string;
	effort?: string | null;
	n_runs?: number;
	date?: string;
	fixed: number;
	cost_usd?: number | null;
	cost_kind?: string;
	wall_min?: number | null;
	superseded?: string | null;
};
type Data = { meta: { bug_count?: number; planted_total?: number }; runs: Run[] };

export function parseBughunt(data: Data): SourceObservation[] {
	if (!Array.isArray(data?.runs)) throw new Error("Bug Hunt Bench format changed: expected runs[].");
	return data.runs
		// Superseded rows are kept on the board as receipts; a newer mean replaces them.
		.filter((run) => !run.superseded && run.model && Number.isFinite(run.fixed))
		.map((run) => {
			const effort = (run.effort ?? "").toLowerCase();
			return {
				benchmarkId: "bughunt",
				label: withClaudePrefix(run.model),
				effort: EFFORTS.has(effort) ? effort : undefined,
				harness: run.harness || undefined,
				value: run.fixed,
				costUsd: run.cost_kind !== "unknown" ? run.cost_usd ?? undefined : undefined,
				durationSeconds: run.wall_min ? run.wall_min * 60 : undefined,
				note: [run.n_runs && run.n_runs > 1 ? `mean of ${run.n_runs} runs` : null, effort && !EFFORTS.has(effort) ? `effort: ${effort}` : null].filter(Boolean).join(", ") || undefined,
				observedOn: run.date,
			};
		});
}

export const bughunt: BenchmarkSource = {
	id: "bughunt",
	name: "Bug Hunt Bench",
	publisher: "Product Compass",
	url: SITE,
	attribution: "Bug Hunt Bench by Product Compass (bughunt.productcompass.pm)",
	minRows: 95,
	benchmarks: [
		{
			id: "bughunt",
			name: "Bug Hunt Bench",
			url: SITE,
			category: "code",
			type: "numerical",
			higherIsBetter: true,
			unit: "bugs of 105",
			description: "Each model works in its own agentic coding CLI with one prompt per repo to find and fix 105 real bugs planted in two production codebases. An independent judge grades the diff blind against an answer key the model never sees; the score is the number of planted bugs fixed, with cost and wall time.",
		},
	],
	async fetch(ctx) {
		return parseBughunt(await ctx.fetchJson<Data>(DATA));
	},
};
