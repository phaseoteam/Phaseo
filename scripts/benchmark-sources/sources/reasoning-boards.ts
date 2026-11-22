import { htmlText, jsonAfter, parseNumber } from "../parse";
import type { BenchmarkSource, SourceObservation } from "../types";
import { isoDate, withClaudeFamily, withoutDefaultEffort } from "./labels";

/** Single-board reasoning, knowledge and perception leaderboards. */

// SimpleBench ------------------------------------------------------------------------------------------------------

const SIMPLEBENCH = "https://simple-bench.com/";

/** `leaderboard-data.js`: a JS array of `{ rank, model, score, organization, dateAdded }` with unquoted keys. */
export function parseSimpleBench(js: string): SourceObservation[] {
	const body = js.match(/leaderboardData\s*=\s*\[([\s\S]*?)\n\];/)?.[1];
	if (!body) throw new Error("SimpleBench format changed: leaderboardData not found.");
	return [...body.matchAll(/\{([^{}]*)\}/g)].flatMap(([, entry]) => {
		const field = (key: string) => entry.match(new RegExp(`\\b${key}\\s*:\\s*(?:"([^"]*)"|'([^']*)')`))?.slice(1).find((value) => value !== undefined);
		const model = field("model");
		const value = parseNumber(field("score"));
		// Human baselines are marked with an asterisk.
		if (!model || value === null || model.endsWith("*") || /human/i.test(model)) return [];
		return [{ benchmarkId: "simplebench", label: model, value, observedOn: field("dateAdded") }];
	});
}

export const simpleBench: BenchmarkSource = {
	id: "simplebench",
	name: "SimpleBench",
	publisher: "SimpleBench",
	url: SIMPLEBENCH,
	attribution: "SimpleBench (simple-bench.com)",
	minRows: 70,
	benchmarks: [{ id: "simplebench", name: "SimpleBench", url: SIMPLEBENCH, category: "reasoning", type: "percentage", higherIsBetter: true, unit: "%", description: "Multiple-choice questions on spatio-temporal reasoning, social intelligence and trick questions that people without special training answer better than models. Accuracy averaged over five runs." }],
	async fetch(ctx) {
		const html = await ctx.fetchText(SIMPLEBENCH);
		const script = html.match(/src="([^"]*leaderboard-data\.js[^"]*)"/)?.[1] ?? "static/js/leaderboard-data.js";
		return parseSimpleBench(await ctx.fetchText(new URL(script, SIMPLEBENCH).toString()));
	},
};

// SimpleQA Verified (Kaggle) --------------------------------------------------------------------------------------

const SIMPLEQA = "https://www.kaggle.com/benchmarks/deepmind/simpleqa-verified";
const SIMPLEQA_API = "https://www.kaggle.com/api/v1/benchmarks/deepmind/simpleqa-verified/leaderboard";

type KaggleResult = { value?: number; confidenceInterval?: number; hasConfidenceInterval?: boolean };
type KaggleRow = {
	modelVersionName?: string;
	candidateClass?: string;
	agentName?: string;
	harnessName?: string;
	taskResults?: Array<{ result?: { numericResult?: KaggleResult; evaluationDate?: string } }>;
};

export function parseKaggleLeaderboard(json: { rows?: KaggleRow[] }, benchmarkId: string): SourceObservation[] {
	if (!Array.isArray(json?.rows)) throw new Error("Kaggle leaderboard format changed: expected rows[].");
	return json.rows.flatMap((row) => {
		const result = row.taskResults?.[0]?.result;
		const value = result?.numericResult?.value;
		// Agent and harness entries wrap a model in a system; only plain model versions are catalogue models.
		if (!row.modelVersionName || typeof value !== "number" || (row.candidateClass && row.candidateClass !== "modelVersion") || row.agentName) return [];
		const half = result?.numericResult?.hasConfidenceInterval ? result.numericResult.confidenceInterval : undefined;
		return [{
			benchmarkId,
			label: row.modelVersionName,
			harness: row.harnessName || undefined,
			value: value * 100,
			ciLow: typeof half === "number" ? Math.max(0, (value - half) * 100) : undefined,
			ciHigh: typeof half === "number" ? Math.min(100, (value + half) * 100) : undefined,
			observedOn: result?.evaluationDate?.slice(0, 10),
		}];
	});
}

export const simpleQa: BenchmarkSource = {
	id: "simpleqa",
	name: "SimpleQA Verified",
	publisher: "Google DeepMind (Kaggle Benchmarks)",
	url: SIMPLEQA,
	attribution: "SimpleQA Verified by Google DeepMind, on Kaggle Benchmarks",
	minRows: 33,
	benchmarks: [{ id: "simpleqa-verified", name: "SimpleQA Verified", url: SIMPLEQA, category: "knowledge", type: "percentage", higherIsBetter: true, unit: "%", description: "Short fact-seeking questions whose reference answers were verified by people. Share answered correctly, with a confidence interval." }],
	async fetch(ctx) {
		return parseKaggleLeaderboard(await ctx.fetchJson<{ rows?: KaggleRow[] }>(SIMPLEQA_API), "simpleqa-verified");
	},
};

// LisanBench -------------------------------------------------------------------------------------------------------

const LISAN = "https://lisanbench.com/";
const LISAN_DATA = "https://lisanbench.com/data/core.json";

type LisanModel = { id: string; full?: string; label: string; coverage?: { words?: number; coverage_complete?: boolean } };
type LisanAggregate = { model: string; sum_chain_avg: number; sum_chain_avg_ci?: [number, number]; estimated_cost_usd?: number; output_tokens?: number; coverage?: { words?: number; complete?: boolean } };
type LisanFile = { metadata?: { num_words?: number }; models: LisanModel[]; aggregated: LisanAggregate[] };

/** "anthropic/claude-opus-4.6:thinking-high" → label "anthropic/claude-opus-4.6", effort "high"; "thinking-16k" is a budget. */
export function lisanModel(id: string): { label: string; effort?: string } {
	const [label, mode = ""] = id.split(":");
	const setting = mode.match(/^thinking-(.+)$/)?.[1];
	if (!setting) return { label };
	return { label, effort: /^\d+k$/.test(setting) ? `${setting} thinking` : setting };
}

export function parseLisanBench(file: LisanFile): SourceObservation[] {
	if (!Array.isArray(file?.models) || !Array.isArray(file.aggregated)) throw new Error("LisanBench format changed: expected models[] and aggregated[].");
	const words = file.metadata?.num_words ?? 50;
	const models = new Map(file.models.map((model) => [model.id, model]));
	return file.aggregated.flatMap((row) => {
		const model = models.get(row.model);
		// Runs that skipped some starting words aren't comparable with the full 50-word total.
		if (!model || !Number.isFinite(row.sum_chain_avg) || (row.coverage?.words ?? words) < words || row.coverage?.complete === false) return [];
		const { label, effort } = lisanModel(model.full ?? model.id);
		return [{
			benchmarkId: "lisanbench",
			label,
			effort,
			value: row.sum_chain_avg,
			ciLow: row.sum_chain_avg_ci?.[0],
			ciHigh: row.sum_chain_avg_ci?.[1],
			costUsd: row.estimated_cost_usd,
			note: model.label,
		}];
	});
}

export const lisanBench: BenchmarkSource = {
	id: "lisanbench",
	name: "LisanBench",
	publisher: "LisanBench",
	url: LISAN,
	attribution: "LisanBench (lisanbench.com)",
	minRows: 123,
	benchmarks: [{ id: "lisanbench", name: "LisanBench", url: LISAN, category: "reasoning", type: "numerical", higherIsBetter: true, unit: "words", description: "From each of 50 starting words, the model builds the longest chain it can of valid English words, each one edit from the last and none repeated. Valid chain length summed over the 50 words, averaged over three trials, with a 95% interval." }],
	async fetch(ctx) {
		return parseLisanBench(await ctx.fetchJson<LisanFile>(LISAN_DATA));
	},
};

// ShadowBench (Hugging Face dataset) ------------------------------------------------------------------------------

const SHADOW = "https://perpetualresearch.si/shadowbench/";
const SHADOW_ROWS = "https://datasets-server.huggingface.co/first-rows?dataset=perpetual-research%2Fshadowbench&config=leaderboard&split=results";

type ShadowRow = { kind?: string; model?: string; model_name?: string; effort?: string | null; score?: number; ci_low?: number; ci_high?: number; cost_usd_per_episode?: number | null; minutes_per_episode?: number | null };

export function parseShadowBench(json: { rows?: Array<{ row: ShadowRow }>; truncated?: boolean }): SourceObservation[] {
	if (!Array.isArray(json?.rows)) throw new Error("ShadowBench format changed: expected rows[].");
	if (json.truncated) throw new Error("ShadowBench leaderboard no longer fits in one page of rows.");
	return json.rows.flatMap(({ row }) => {
		// "reference" rows are baselines (a featureless blob, blind search, hands at rest).
		if (row.kind !== "model" || !row.model_name || typeof row.score !== "number") return [];
		return [{
			benchmarkId: "shadowbench",
			label: row.model_name,
			effort: row.effort || undefined,
			value: row.score,
			ciLow: row.ci_low,
			ciHigh: row.ci_high,
			costUsd: row.cost_usd_per_episode ?? undefined,
			durationSeconds: typeof row.minutes_per_episode === "number" ? Math.round(row.minutes_per_episode * 60) : undefined,
		}];
	});
}

export const shadowBench: BenchmarkSource = {
	id: "shadowbench",
	name: "ShadowBench",
	publisher: "Perpetual Research",
	url: SHADOW,
	attribution: "ShadowBench by Perpetual Research (Hugging Face dataset perpetual-research/shadowbench)",
	minRows: 11,
	benchmarks: [{ id: "shadowbench", name: "ShadowBench", url: SHADOW, category: "vision", type: "numerical", higherIsBetter: true, unit: "score", description: "The model poses two 3D hands between a lamp and a screen, one tool call at a time, until their shadow matches an animal from a nineteenth-century hand-shadow book. Score from 0 to 100 for how closely the shadow matches, over 20 targets, with a confidence interval." }],
	async fetch(ctx) {
		return parseShadowBench(await ctx.fetchJson(SHADOW_ROWS));
	},
};

// Penalty Bench ----------------------------------------------------------------------------------------------------

const PENALTY = "https://wenhaochai.com/blogs/penalty-bench.html";

type PenaltyLeader = { name: string; vendor?: string; harness?: string; acc: number; ci?: [number, number]; n?: number };

export function parsePenaltyBench(html: string): SourceObservation[] {
	const leaders = jsonAfter<PenaltyLeader[]>(html, "const LEADER=");
	return leaders.flatMap((leader) => {
		// Referee rows are the human baselines.
		if (leader.vendor === "referee" || !leader.harness || !Number.isFinite(leader.acc)) return [];
		return [{
			benchmarkId: "penaltybench",
			label: withClaudeFamily(withoutDefaultEffort(leader.name)),
			harness: leader.harness,
			value: leader.acc,
			ciLow: leader.ci?.[0],
			ciHigh: leader.ci?.[1],
		}];
	});
}

export const penaltyBench: BenchmarkSource = {
	id: "penaltybench",
	name: "Penalty Bench",
	publisher: "Wenhao Chai",
	url: PENALTY,
	attribution: "Penalty Bench by Wenhao Chai (wenhaochai.com)",
	minRows: 10,
	benchmarks: [{ id: "penaltybench", name: "Penalty Bench", url: PENALTY, category: "vision", type: "percentage", higherIsBetter: true, unit: "%", description: "An agent watches football match clips and decides, as a referee would, whether each incident is a penalty. Balanced accuracy over the clips, with a confidence interval; each row is one model in its own agent harness." }],
	async fetch(ctx) {
		return parsePenaltyBench(await ctx.fetchText(PENALTY));
	},
};

// ZeroBench --------------------------------------------------------------------------------------------------------

const ZEROBENCH = "https://zerobench.github.io/";

export function parseZeroBench(html: string): SourceObservation[] {
	const start = html.indexOf('id="sortableTable"');
	if (start < 0) throw new Error("ZeroBench format changed: sortableTable not found.");
	const table = html.slice(start, html.indexOf("</table>", start));
	return [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].flatMap(([, row]) => {
		const cells = [...row.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)];
		const pass1 = parseNumber(cells[1]?.[1].match(/data-sort="([^"]+)"/)?.[1]);
		if (cells.length < 5 || pass1 === null) return [];
		const cost = parseNumber(cells[4]?.[1].match(/data-sort="([^"]+)"/)?.[1]);
		return [{ benchmarkId: "zerobench", label: htmlText(cells[0][2]), value: pass1, costUsd: cost ?? undefined }];
	});
}

export const zeroBench: BenchmarkSource = {
	id: "zerobench",
	name: "ZeroBench",
	publisher: "ZeroBench",
	url: ZEROBENCH,
	attribution: "ZeroBench (zerobench.github.io)",
	minRows: 44,
	benchmarks: [{ id: "zerobench", name: "ZeroBench", url: ZEROBENCH, category: "vision", type: "percentage", higherIsBetter: true, unit: "%", description: "100 hard visual reasoning questions about images, built so that current multimodal models fail them. Pass@1 on the main questions." }],
	async fetch(ctx) {
		return parseZeroBench(await ctx.fetchText(ZEROBENCH));
	},
};

// BabyVision (UniPat AI) -------------------------------------------------------------------------------------------

const BABYVISION = "https://unipat.ai/benchmarks/BabyVision";

export function parseBabyVision(html: string): SourceObservation[] {
	return [...html.matchAll(/<tr>\s*<td class="bv-lb-rank[^"]*">[^<]*<\/td>([\s\S]*?)<\/tr>/g)].flatMap(([, row]) => {
		const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => cell[1]);
		const value = parseNumber(htmlText(row.match(/<td class="bv-lb-score">([\s\S]*?)<\/td>/)?.[1] ?? ""));
		// The human row is a baseline, tagged in the model cell.
		if (!cells[0] || value === null || cells[0].includes("bv-lb-type-human")) return [];
		const name = htmlText(cells[0].replace(/<span class="bv-lb-model-type[\s\S]*?<\/span>/, ""));
		// "(with tools)", "(with Python tools)": the run could call tools.
		const tools = name.match(/\s*\((with (?:[\w ]+ )?tools)\)\s*$/i);
		return [{
			benchmarkId: "babyvision",
			label: withClaudeFamily(tools ? name.slice(0, tools.index) : name),
			harness: tools?.[1].toLowerCase(),
			value,
			observedOn: isoDate(htmlText(cells[3] ?? "")),
		}];
	});
}

export const babyVision: BenchmarkSource = {
	id: "unipat-babyvision",
	name: "BabyVision",
	publisher: "UniPat AI",
	url: BABYVISION,
	attribution: "BabyVision by UniPat AI (unipat.ai)",
	minRows: 17,
	benchmarks: [{ id: "babyvision", name: "BabyVision", url: BABYVISION, category: "vision", type: "percentage", higherIsBetter: true, unit: "%", description: "Visual tasks that young children can do without language, such as tracking, spatial perception and pattern recognition. Accuracy; runs where the model may use tools are listed separately." }],
	async fetch(ctx) {
		return parseBabyVision(await ctx.fetchText(BABYVISION));
	},
};

// HoneyBench (Goodhart Labs) ---------------------------------------------------------------------------------------

const HONEYBENCH = "https://goodhartlabs.com/honeybench";

export function parseHoneyBench(html: string): SourceObservation[] {
	const version = html.match(/HoneyBench (v\d+(?:\.\d+)*)/)?.[1];
	return [...html.matchAll(/<summary aria-label="([^"]+?), overall hack rate ([\d.]+)% of scored runs[^"]*?80% confidence interval ([\d.]+)[–-]([\d.]+)%/g)].map((match) => ({
		benchmarkId: "honeybench",
		label: withClaudeFamily(htmlText(match[1])),
		value: Number(match[2]),
		ciLow: Number(match[3]),
		ciHigh: Number(match[4]),
		note: version ? `HoneyBench ${version}; 80% interval` : "80% interval",
	}));
}

export const honeyBench: BenchmarkSource = {
	id: "honeybench",
	name: "HoneyBench",
	publisher: "Goodhart Labs",
	url: HONEYBENCH,
	attribution: "HoneyBench by Goodhart Labs (goodhartlabs.com)",
	minRows: 13,
	benchmarks: [{ id: "honeybench", name: "HoneyBench", url: HONEYBENCH, category: "safety", type: "percentage", higherIsBetter: false, unit: "%", description: "Agentic tasks that leave room to game the grader. Overall hack rate: the share of scored runs where the model hacked the task instead of solving it, with an 80% interval. Lower is better." }],
	async fetch(ctx) {
		return parseHoneyBench(await ctx.fetchText(HONEYBENCH));
	},
};
