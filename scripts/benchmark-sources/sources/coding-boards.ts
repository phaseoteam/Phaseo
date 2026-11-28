import { htmlTable, htmlText, jsonAfter, nextFlight, parseNumber } from "../parse";
import type { BenchmarkDefinition, BenchmarkSource, SourceObservation } from "../types";
import { withClaudeFamily } from "./labels";

/** Software engineering, kernel and AI-research agent leaderboards. */

const percent = (id: string, name: string, url: string, category: string, description: string): BenchmarkDefinition => ({ id, name, url, category, type: "percentage", higherIsBetter: true, unit: "%", description });

// DeepSWE (Datacurve) ----------------------------------------------------------------------------------------------

const DEEPSWE = "https://deepswe.datacurve.ai/";
const DEEPSWE_DATA = "https://deepswe.datacurve.ai/artifacts/v1.1/leaderboard-live.json";

type DeepSweRow = { model: string; harness?: string; reasoning_effort?: string | null; pass_at_1?: number; ci_lo?: number; ci_hi?: number; mean_cost_usd?: number; mean_output_tokens?: number; mean_duration_seconds?: number };

export function parseDeepSwe(file: { generated_at?: string; rows?: DeepSweRow[] }): SourceObservation[] {
	if (!Array.isArray(file?.rows)) throw new Error("DeepSWE format changed: expected rows[].");
	return file.rows.flatMap((row) => (typeof row.pass_at_1 !== "number" ? [] : [{
		benchmarkId: "deepswe-v1.1",
		label: row.model,
		effort: row.reasoning_effort || undefined,
		harness: row.harness,
		value: row.pass_at_1 * 100,
		ciLow: typeof row.ci_lo === "number" ? row.ci_lo * 100 : undefined,
		ciHigh: typeof row.ci_hi === "number" ? row.ci_hi * 100 : undefined,
		costUsd: row.mean_cost_usd,
		outputTokens: typeof row.mean_output_tokens === "number" ? Math.round(row.mean_output_tokens) : undefined,
		durationSeconds: row.mean_duration_seconds,
		observedOn: file.generated_at?.slice(0, 10),
	}]));
}

export const deepSwe: BenchmarkSource = {
	id: "deepswe",
	name: "DeepSWE",
	publisher: "Datacurve",
	url: DEEPSWE,
	attribution: "DeepSWE by Datacurve (deepswe.datacurve.ai)",
	minRows: 42,
	benchmarks: [percent("deepswe-v1.1", "DeepSWE v1.1", DEEPSWE, "code", "Long-horizon software engineering tasks across many repositories and languages, each run in an isolated environment. Pass@1 over repeated rollouts, with a 95% interval; each row is a harness, model and reasoning effort.")],
	async fetch(ctx) {
		return parseDeepSwe(await ctx.fetchJson(DEEPSWE_DATA));
	},
};

// FrontierSWE ------------------------------------------------------------------------------------------------------

const FRONTIERSWE = "https://www.frontierswe.com/";

type FrontierSweEntry = { model: string; harness?: string; overall?: number; avgCostUsd?: number | null; avgDurationSeconds?: number | null };

/** The page's flight payload holds `"entries":{"abs":{"best":[…],"mean":[…],"worst":[…]}}`; the board ranks by the mean trial. */
export function parseFrontierSwe(html: string): SourceObservation[] {
	const entries = jsonAfter<{ abs?: { mean?: FrontierSweEntry[] } }>(nextFlight(html), '"entries":');
	if (!Array.isArray(entries.abs?.mean)) throw new Error("FrontierSWE format changed: expected entries.abs.mean[].");
	return entries.abs.mean.flatMap((entry) => (typeof entry.overall !== "number" ? [] : [{
		benchmarkId: "frontierswe",
		label: entry.model,
		harness: entry.harness,
		value: entry.overall,
		costUsd: entry.avgCostUsd ?? undefined,
		durationSeconds: entry.avgDurationSeconds ?? undefined,
	}]));
}

export const frontierSwe: BenchmarkSource = {
	id: "frontierswe",
	name: "FrontierSWE",
	publisher: "FrontierSWE",
	url: FRONTIERSWE,
	attribution: "FrontierSWE (frontierswe.com)",
	minRows: 16,
	benchmarks: [{ id: "frontierswe", name: "FrontierSWE", url: FRONTIERSWE, category: "code", type: "numerical", higherIsBetter: true, unit: "score", description: "Open-ended engineering tasks in implementation, performance and research, each with five trials and a 20-hour budget. Overall score of the mean trial across all tasks." }],
	async fetch(ctx) {
		return parseFrontierSwe(await ctx.fetchText(FRONTIERSWE));
	},
};

// FrontierCode (Cognition) -----------------------------------------------------------------------------------------

const FRONTIERCODE = "https://cognition.com/frontiercode";
const FRONTIERCODE_V1 = "https://cognition.com/data/frontiercode-leaderboard/data.json";
const FRONTIERCODE_V2 = "https://cognition.com/data/frontier-code-2.0/data.json";

type FrontierCodeCell = { new_score?: number | null; correct?: number | null; tokens?: number | null; cost?: number | null; duration_min?: number | null };
type FrontierCodeVersion = { harness?: Record<string, string>; data: Record<string, Record<string, Partial<Record<string, FrontierCodeCell>>>> };

/** `data[model][effort][subset]`; `new_score` is the score the board shows, 0–1. */
export function parseFrontierCode(version: FrontierCodeVersion, subsets: Record<string, string>): SourceObservation[] {
	if (!version?.data || typeof version.data !== "object") throw new Error("FrontierCode format changed: expected data{}.");
	return Object.entries(version.data).flatMap(([model, efforts]) => Object.entries(efforts).flatMap(([effort, cells]) => Object.entries(subsets).flatMap(([subset, benchmarkId]) => {
		const cell = cells?.[subset];
		if (typeof cell?.new_score !== "number") return [];
		return [{
			benchmarkId,
			label: model,
			effort: ["na", "none"].includes(effort) ? undefined : effort,
			harness: version.harness?.[model],
			value: cell.new_score * 100,
			costUsd: cell.cost ?? undefined,
			outputTokens: cell.tokens ?? undefined,
			durationSeconds: typeof cell.duration_min === "number" ? Math.round(cell.duration_min * 60) : undefined,
		}];
	})));
}

const FRONTIERCODE_DESCRIPTION = "An agent implements real changes in open-source repositories, and its work is graded on whether it would be merged. The board's score, 0 to 100, averaged over the tasks; each row is one model and reasoning effort in its own harness.";

export const frontierCode: BenchmarkSource = {
	id: "frontiercode",
	name: "FrontierCode",
	publisher: "Cognition",
	url: FRONTIERCODE,
	attribution: "FrontierCode by Cognition (cognition.com)",
	minRows: 244,
	benchmarks: [
		{ ...percent("frontiercode-1.1-main", "FrontierCode 1.1 (Main)", FRONTIERCODE, "code", `${FRONTIERCODE_DESCRIPTION} Version 1.1, main set of 100 tasks.`), type: "numerical", unit: "score" },
		{ ...percent("frontiercode-1.1-extended", "FrontierCode 1.1 (Extended)", FRONTIERCODE, "code", `${FRONTIERCODE_DESCRIPTION} Version 1.1, extended set of 150 tasks.`), type: "numerical", unit: "score" },
		{ ...percent("frontiercode-2.0", "FrontierCode 2.0", FRONTIERCODE, "code", `${FRONTIERCODE_DESCRIPTION} Version 2.0, 132 tasks.`), type: "numerical", unit: "score" },
	],
	async fetch(ctx) {
		const [v1, v2] = await Promise.all([ctx.fetchJson<{ v1_1?: FrontierCodeVersion }>(FRONTIERCODE_V1), ctx.fetchJson<FrontierCodeVersion>(FRONTIERCODE_V2)]);
		if (!v1?.v1_1) throw new Error("FrontierCode format changed: expected v1_1.");
		return [
			...parseFrontierCode(v1.v1_1, { main: "frontiercode-1.1-main", extended: "frontiercode-1.1-extended" }),
			...parseFrontierCode(v2, { main: "frontiercode-2.0" }),
		];
	},
};

// FrontierCS -------------------------------------------------------------------------------------------------------

const FRONTIERCS = "https://frontier-cs.org/";

/**
 * `fcs2-data.js` is minified code, so it is read, never run: models are `{id:"…",name:"…",short:"…",h:"<harness>",lab:"…"}`
 * literals and `PASS={id:[rate, passed, tasks],…}` holds each one's pass rate.
 */
export function parseFrontierCs(js: string): SourceObservation[] {
	const models = [...js.matchAll(/\{id:"([^"]+)",name:"([^"]+)",short:"[^"]*",h:"([^"]*)",lab:"[^"]*"\}/g)];
	const pass = new Map([...(js.match(/\bPASS=\{([^{}]*)\}/)?.[1] ?? "").matchAll(/"?([\w-]+)"?:\[([-\d.,\s]+)\]/g)].map((entry) => [entry[1], entry[2].split(",").map(Number)]));
	if (!models.length || !pass.size) throw new Error("FrontierCS format changed: no models or PASS table.");
	return models.flatMap(([, id, name, harness]) => {
		const [rate, passed, tasks] = pass.get(id) ?? [];
		if (!Number.isFinite(rate)) return [];
		return [{ benchmarkId: "frontiercs-2", label: name, harness: harness || undefined, value: rate, note: `${passed} of ${tasks} tasks` }];
	});
}

export const frontierCs: BenchmarkSource = {
	id: "frontiercs",
	name: "FrontierCS",
	publisher: "FrontierCS",
	url: FRONTIERCS,
	attribution: "FrontierCS (frontier-cs.org)",
	minRows: 15,
	benchmarks: [percent("frontiercs-2", "FrontierCS 2", FRONTIERCS, "code", "An agent re-implements systems from computer-science research papers. A task passes only if the agent's implementation beats the original on every metric of the hidden workloads. Pass rate over the tasks; each row is one model in its own harness.")],
	async fetch(ctx) {
		const html = await ctx.fetchText(FRONTIERCS);
		const script = html.match(/<script[^>]*\bsrc="([^"]*fcs2-data\.js[^"]*)"/)?.[1];
		if (!script) throw new Error("FrontierCS page no longer loads fcs2-data.js.");
		return parseFrontierCs(await ctx.fetchText(new URL(script, FRONTIERCS).toString()));
	},
};

// CursorBench ------------------------------------------------------------------------------------------------------

const CURSORBENCH = "https://cursor.com/cursorbench";

/** The page's one table: Model ("Gemini 4 Neon Extra High"), Score, Cost / task, Tokens / task, Steps / task. */
export function parseCursorBench(html: string): SourceObservation[] {
	const version = html.match(/<h1\b[^>]*>\s*CursorBench\s+([\d.]+)\s*<\/h1>/)?.[1];
	if (version !== "4.1") throw new Error(`CursorBench is now version ${version ?? "unknown"}; add a benchmark for it.`);
	const [header, ...rows] = htmlTable(html);
	const column = (name: RegExp) => header.findIndex((cell) => name.test(cell));
	const [model, score, cost, tokens] = [/^Model$/, /^Score$/, /^Cost/, /^Tokens/].map(column);
	if ([model, score].some((index) => index < 0)) throw new Error("CursorBench table columns changed.");
	return rows.flatMap((cells) => {
		const value = parseNumber(cells[score]);
		if (!cells[model] || value === null) return [];
		return [{
			benchmarkId: "cursorbench-4.1",
			label: withClaudeFamily(cells[model]),
			value,
			costUsd: cost >= 0 ? parseNumber(cells[cost]) ?? undefined : undefined,
			outputTokens: tokens >= 0 ? parseNumber(cells[tokens]) ?? undefined : undefined,
		}];
	});
}

export const cursorBench: BenchmarkSource = {
	id: "cursorbench",
	name: "CursorBench",
	publisher: "Cursor",
	url: CURSORBENCH,
	attribution: "CursorBench by Cursor (cursor.com)",
	minRows: 32,
	benchmarks: [percent("cursorbench-4.1", "CursorBench 4.1", CURSORBENCH, "code", "Coding tasks taken from real use of Cursor's agent, run in Cursor's harness. Share of tasks solved, with cost, tokens and steps per task.")],
	async fetch(ctx) {
		return parseCursorBench(await ctx.fetchText(CURSORBENCH));
	},
};

// KernelBench (kernelbench.com) ------------------------------------------------------------------------------------

const KERNELBENCH = "https://kernelbench.com/";
const KERNELBENCH_DATA = "https://kernelbench.com/data/models.json";
const KERNEL_DECKS = { hard: "kernelbench-com-hard", cuda: "kernelbench-com-cuda", mega: "kernelbench-com-mega" } as const;

type KernelBlock = { harness?: string | null; effort?: string | null; passed?: number; total_problems?: number; perf?: number | null };
type KernelModel = { slug: string; name: string; benches?: Partial<Record<string, KernelBlock>> };

/**
 * `perf` is the board's mean normalised performance over the full deck (each problem against the best result on it).
 * The board renders straight from models.json; models with only retired-deck results (`legacy`) have no current deck
 * block and drop out on their own.
 */
export function parseKernelBench(file: { models?: KernelModel[] }): SourceObservation[] {
	if (!Array.isArray(file?.models)) throw new Error("kernelbench.com format changed: expected models[].");
	return file.models.flatMap((model) => Object.entries(KERNEL_DECKS).flatMap(([deck, benchmarkId]) => {
		const block = model.benches?.[deck];
		if (typeof block?.perf !== "number" || !block.harness) return [];
		return [{
			benchmarkId,
			label: model.name,
			effort: block.effort || undefined,
			harness: block.harness,
			value: block.perf * 100,
			note: `${block.passed ?? 0} of ${block.total_problems ?? "?"} problems passed audited and valid`,
		}];
	}));
}

const KERNEL_DESCRIPTION = "Coding agents write GPU kernels, one session per problem, and every run is audited for reward hacking. Mean performance over the full deck, each problem scored against the best result any model reached on it; failed, invalid or unaudited problems count as zero.";

export const kernelBench: BenchmarkSource = {
	id: "kernelbench-com",
	name: "KernelBench (kernelbench.com)",
	publisher: "kernelbench.com",
	url: KERNELBENCH,
	attribution: "KernelBench leaderboards (kernelbench.com)",
	minRows: 39,
	benchmarks: [
		percent("kernelbench-com-hard", "KernelBench Hard (kernelbench.com)", `${KERNELBENCH}#hard`, "code", `${KERNEL_DESCRIPTION} Hard deck.`),
		percent("kernelbench-com-cuda", "KernelBench CUDA (kernelbench.com)", `${KERNELBENCH}#cuda`, "code", `${KERNEL_DESCRIPTION} CUDA-only deck.`),
		percent("kernelbench-com-mega", "KernelBench Mega (kernelbench.com)", `${KERNELBENCH}#mega`, "code", `${KERNEL_DESCRIPTION} Megakernel deck.`),
	],
	async fetch(ctx) {
		// The home page now renders in the browser from this file and links only a few featured models.
		return parseKernelBench(await ctx.fetchJson<{ models?: KernelModel[] }>(KERNELBENCH_DATA));
	},
};

// LongTail-SWE (Nebius) --------------------------------------------------------------------------------------------

const LONGTAIL = "https://longtail-swe.com/";
const LANGUAGES = ["Clojure", "Dart", "Elixir", "Erlang", "F#", "Haskell", "Julia", "Kotlin", "Lua", "OCaml", "R", "Scala", "Swift"];
const languageId = (language: string) => `longtail-swe-${language.toLowerCase().replace("#", "sharp")}`;

/** "Opus 5.5<small>high</small>": the small tag holds the reasoning effort. */
function longtailModel(cell: string): { label: string; effort?: string } {
	const match = cell.match(/^([\s\S]*?)<small>([\s\S]*?)<\/small>/);
	const label = withClaudeFamily(htmlText(match ? match[1] : cell));
	const effort = match ? htmlText(match[2]) : undefined;
	return { label, effort: effort && effort !== "thinking" ? effort : undefined };
}

export function parseLongTail(html: string): SourceObservation[] {
	const observations: SourceObservation[] = [];
	for (const [, attributes, body] of html.matchAll(/<tr\b([^>]*data-p1="[^"]*"[^>]*)>([\s\S]*?)<\/tr>/g)) {
		const model = body.match(/<td class="l m">([\s\S]*?)<\/td>/)?.[1];
		const value = parseNumber(attributes.match(/data-p1="([^"]+)"/)?.[1]);
		const half = parseNumber(htmlText(body.match(/<span class="pm">([\s\S]*?)<\/span>/)?.[1] ?? "").replace("±", ""));
		if (!model || value === null) continue;
		observations.push({ benchmarkId: "longtail-swe", ...longtailModel(model), value, ciLow: half !== null ? value - half : undefined, ciHigh: half !== null ? value + half : undefined });
	}
	const start = html.indexOf('id="languages"');
	if (start >= 0) {
		const table = html.slice(start, html.indexOf("</table>", start));
		const [header, ...rows] = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((row) => [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/g)].map((cell) => cell[1]));
		const models = (header ?? []).slice(2).map(longtailModel);
		for (const cells of rows) {
			const language = htmlText(cells[0] ?? "");
			if (!LANGUAGES.includes(language)) continue;
			cells.slice(2).forEach((cell, index) => {
				const value = parseNumber(htmlText(cell));
				if (value !== null && models[index]) observations.push({ benchmarkId: languageId(language), ...models[index], value });
			});
		}
	}
	return observations;
}

export const longtailSwe: BenchmarkSource = {
	id: "longtail-swe",
	name: "LongTail-SWE",
	publisher: "Nebius",
	url: LONGTAIL,
	attribution: "LongTail-SWE by Nebius (longtail-swe.com)",
	minRows: 92,
	benchmarks: [
		percent("longtail-swe", "LongTail-SWE", LONGTAIL, "code", "Coding agents fix real GitHub issues in 13 programming languages that standard benchmarks leave out, all in the same SWE-agent-like scaffold. Pass@1, the mean over three attempts per task, with its spread."),
		...LANGUAGES.map((language) => percent(languageId(language), `LongTail-SWE: ${language}`, `${LONGTAIL}#languages`, "code", `The ${language} tasks of LongTail-SWE: coding agents fix real GitHub issues, all in the same SWE-agent-like scaffold. Pass@1 over three attempts per task.`)),
	],
	async fetch(ctx) {
		return parseLongTail(await ctx.fetchText(LONGTAIL));
	},
};

// PostTrainBench ---------------------------------------------------------------------------------------------------

const POSTTRAIN = "https://posttrainbench.com/?version=v1.1";
const POSTTRAIN_DATA = "https://posttrainbench.com/scores.json";

/** `aggregatedScores` is keyed by agent config, e.g. "gpt-5.4-high", "opus-4.8-max". */
export function parsePostTrainBench(file: { resultsVersion?: string; aggregatedScores?: Record<string, { avg?: number; std?: number; n?: number }> }): SourceObservation[] {
	if (file?.resultsVersion !== "v1.1" || !file.aggregatedScores) throw new Error(`PostTrainBench results are ${file?.resultsVersion ?? "missing"}; expected v1.1.`);
	return Object.entries(file.aggregatedScores).flatMap(([key, score]) => {
		if (typeof score.avg !== "number") return [];
		const [, model, effort] = key.match(/^(.*?)(?:-(none|minimal|low|medium|high|xhigh|max))?$/) ?? [];
		return [{ benchmarkId: "posttrainbench-v1.1", label: withClaudeFamily(model ?? key), effort, value: score.avg, note: `${score.n ?? "?"} runs, standard deviation ${score.std ?? "?"}` }];
	});
}

export const postTrainBench: BenchmarkSource = {
	id: "posttrainbench",
	name: "PostTrainBench",
	publisher: "PostTrainBench",
	url: POSTTRAIN,
	attribution: "PostTrainBench (posttrainbench.com)",
	minRows: 8,
	benchmarks: [percent("posttrainbench-v1.1", "PostTrainBench v1.1", POSTTRAIN, "agents", "An agent post-trains small base models within a fixed compute budget. Weighted average of the trained models' scores on downstream benchmarks, averaged over runs.")],
	async fetch(ctx) {
		return parsePostTrainBench(await ctx.fetchJson(POSTTRAIN_DATA));
	},
};

// FrontierRSI ------------------------------------------------------------------------------------------------------

const FRONTIER_RSI = "https://frontier-rsi.org/";

type RsiRow = { model: string; harness?: string; effort?: string; avg: number | null };
type RsiData = { tasks: Array<{ id: string; models: RsiRow[] }> };

/** `window.FRSI = {…}`. The board's score is the mean over every task of each model's average trial reward. */
export function parseFrontierRsi(js: string): SourceObservation[] {
	if (!/window\.FRSI\s*=/.test(js)) throw new Error("FrontierRSI format changed: window.FRSI not found.");
	const data = JSON.parse(js.slice(js.indexOf("{"), js.lastIndexOf("}") + 1)) as RsiData;
	if (!data.tasks?.length) throw new Error("FrontierRSI has no tasks.");
	const models = [...new Set(data.tasks.flatMap((task) => task.models.map((row) => row.model)))];
	return models.flatMap((model) => {
		const rows = data.tasks.map((task) => task.models.find((row) => row.model === model));
		// A model missing a task has no comparable score.
		if (rows.some((row) => typeof row?.avg !== "number")) return [];
		const value = (rows.reduce((total, row) => total + row!.avg!, 0) / rows.length) * 100;
		return [{ benchmarkId: "frontier-rsi", label: model, effort: rows[0]!.effort, harness: rows[0]!.harness, value, note: `Mean of two trials over ${rows.length} tasks` }];
	});
}

export const frontierRsi: BenchmarkSource = {
	id: "frontier-rsi",
	name: "FrontierRSI",
	publisher: "Abundant AI",
	url: FRONTIER_RSI,
	attribution: "FrontierRSI (frontier-rsi.org)",
	minRows: 5,
	benchmarks: [percent("frontier-rsi", "FrontierRSI", FRONTIER_RSI, "agents", "An agent does open-ended AI research and engineering on real GPUs: pre-training, agentic post-training, inference and serving, and GPU kernels. Each trial is scored against the best valid trial any model reached on the task; the score is the mean over tasks of two trials each.")],
	async fetch(ctx) {
		return parseFrontierRsi(await ctx.fetchText(`${FRONTIER_RSI}data.js`));
	},
};
