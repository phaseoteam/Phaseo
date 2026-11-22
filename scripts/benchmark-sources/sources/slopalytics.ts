import { withClaudePrefix } from "./labels";
import type { BenchmarkSource, SourceObservation } from "../types";

const SITE = "https://slopalytics.com";
const DATA = `${SITE}/data/t3-usage.json`;

type ModelDay = { day: string; harness: string; model: string; turns: number };
type MetricDay = {
	day: string;
	harness: string;
	model: string;
	timedTurns: number;
	durationMs: number;
	tokenTurns: number;
	output: number;
	pricedTurns: number;
	estimatedCost: number;
};
type Data = { schemaVersion: number; start?: string; endExclusive?: string; models: ModelDay[]; metrics: MetricDay[] };

// Buckets that aren't one model.
const NOT_A_MODEL = new Set(["unreported model", "other models"]);
// Every day is scaled to 100,000 turns, so the sums below are in those units; below this a per-turn average is a handful of turns.
const MIN_TURNS = 100;

/**
 * T3 Code's own usage telemetry over the published window (about 30 days). Each day is scaled to 100,000 turns across all
 * harnesses, so a model's share is its summed turns over everyone's, and per-turn figures are ratios of summed totals.
 * The file breaks usage down by harness but not by reasoning effort, so rows carry neither.
 */
export function parseSlopalytics(data: Data): SourceObservation[] {
	if (data?.schemaVersion !== 4 || !Array.isArray(data.models) || !Array.isArray(data.metrics)) throw new Error("Slopalytics format changed: expected schemaVersion 4 with models[] and metrics[].");
	const observedOn = data.endExclusive ? new Date(Date.parse(data.endExclusive) - 86_400_000).toISOString().slice(0, 10) : undefined;
	const note = data.start && data.endExclusive ? `T3 Code turns ${data.start} to ${observedOn}` : undefined;
	const totalTurns = data.models.reduce((sum, row) => sum + row.turns, 0);
	const turns = new Map<string, number>();
	for (const row of data.models) turns.set(row.model, (turns.get(row.model) ?? 0) + row.turns);
	const totals = new Map<string, { timed: number; ms: number; tokenTurns: number; output: number; priced: number; cost: number }>();
	for (const row of data.metrics) {
		const total = totals.get(row.model) ?? { timed: 0, ms: 0, tokenTurns: 0, output: 0, priced: 0, cost: 0 };
		total.timed += row.timedTurns ?? 0;
		total.ms += row.durationMs ?? 0;
		total.tokenTurns += row.tokenTurns ?? 0;
		total.output += row.output ?? 0;
		total.priced += row.pricedTurns ?? 0;
		total.cost += row.estimatedCost ?? 0;
		totals.set(row.model, total);
	}
	const out: SourceObservation[] = [];
	for (const [label, count] of turns) {
		if (NOT_A_MODEL.has(label.toLowerCase()) || !totalTurns) continue;
		const common = { label: withClaudePrefix(label), observedOn, note };
		out.push({ ...common, benchmarkId: "t3-code-usage-share", value: (count / totalTurns) * 100 });
		const total = totals.get(label);
		if (!total) continue;
		if (total.timed >= MIN_TURNS) out.push({ ...common, benchmarkId: "t3-code-minutes-per-turn", value: total.ms / total.timed / 60_000 });
		if (total.tokenTurns >= MIN_TURNS) out.push({ ...common, benchmarkId: "t3-code-output-tokens-per-turn", value: total.output / total.tokenTurns });
		if (total.priced >= MIN_TURNS) out.push({ ...common, benchmarkId: "t3-code-cost-per-turn", value: total.cost / total.priced });
	}
	return out;
}

const WINDOW = "over the rolling window Slopalytics publishes (30 days when added) of T3 Code release-build telemetry, all harnesses";

export const slopalytics: BenchmarkSource = {
	id: "slopalytics",
	name: "Slopalytics T3 Code usage",
	publisher: "Slopalytics",
	url: SITE,
	attribution: "Slopalytics, T3 Code release-build telemetry (slopalytics.com)",
	minRows: 60,
	benchmarks: [
		{
			id: "t3-code-usage-share",
			name: "T3 Code usage share",
			url: SITE,
			category: "usage",
			type: "percentage",
			higherIsBetter: true,
			unit: "%",
			description: `Share of completed turns in T3 Code, the coding-agent app, that ran on each model, ${WINDOW}. Each day counts equally; heavy users' runaway days are excluded.`,
		},
		{
			id: "t3-code-minutes-per-turn",
			name: "T3 Code minutes per turn",
			url: SITE,
			category: "usage",
			type: "numerical",
			higherIsBetter: false,
			unit: "minutes",
			description: `Average wall-clock minutes a T3 Code turn took on each model, ${WINDOW}.`,
		},
		{
			id: "t3-code-output-tokens-per-turn",
			name: "T3 Code output tokens per turn",
			url: SITE,
			category: "usage",
			type: "numerical",
			higherIsBetter: false,
			unit: "tokens",
			description: `Average output tokens per T3 Code turn on each model, ${WINDOW}.`,
		},
		{
			id: "t3-code-cost-per-turn",
			name: "T3 Code cost per turn",
			url: SITE,
			category: "usage",
			type: "numerical",
			higherIsBetter: false,
			unit: "USD",
			description: `Estimated API-equivalent cost per T3 Code turn on each model from its token usage and list prices, not billed spend, ${WINDOW}. Unknown and mixed models are not priced.`,
		},
	],
	async fetch(ctx) {
		return parseSlopalytics(await ctx.fetchJson<Data>(DATA));
	},
};
