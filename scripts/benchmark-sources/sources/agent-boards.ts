import { htmlTable, htmlText, jsonAfter, nextFlight, parseNumber } from "../parse";
import type { BenchmarkDefinition, BenchmarkSource, SourceContext, SourceObservation } from "../types";
import { withClaudeFamily } from "./labels";

/** Agentic, professional-work and safety leaderboards. */

const percent = (id: string, name: string, url: string, category: string, description: string, higherIsBetter = true): BenchmarkDefinition => ({ id, name, url, category, type: "percentage", higherIsBetter, unit: "%", description });

/** Scripts a page loads, as absolute URLs. */
function pageScripts(html: string, base: string, pattern: RegExp): string[] {
	return [...new Set(html.match(pattern) ?? [])].map((path) => new URL(path, base).toString());
}

/** The first of `scripts` whose text contains `marker`. */
async function scriptWith(ctx: SourceContext, scripts: string[], marker: string): Promise<string | undefined> {
	for (const script of scripts) {
		const js = await ctx.fetchText(script).catch(() => "");
		if (js.includes(marker)) return js;
	}
	return undefined;
}

// Andon Labs -------------------------------------------------------------------------------------------------------

const ANDON = "https://andonlabs.com/evals";

/** Vending-Bench 2's table: rank, "Gemini 4 Neon New", "$16,843.41 ± $972". The ± is a standard error. */
export function parseVendingBench2(html: string): SourceObservation[] {
	const [header, ...rows] = htmlTable(html);
	if (header?.[1] !== "Model" || !/money balance/i.test(header[2] ?? "")) throw new Error("Vending-Bench 2 table columns changed.");
	return rows.flatMap((cells) => {
		const value = parseNumber(cells[2]?.split("±")[0]);
		const label = (cells[1] ?? "").replace(/\s+New$/, "");
		if (!label || value === null || /^human\b/i.test(label)) return [];
		return [{ benchmarkId: "vending-bench-2", label, value, note: `Standard error ${cells[2].split("±")[1]?.trim() ?? "not given"}` }];
	});
}

/** Blueprint-Bench 2's table: rank ("T2" for ties), model, score from 0 (random baseline) to 1. "Human*" is the baseline. */
export function parseBlueprintBench2(html: string): SourceObservation[] {
	const [header, ...rows] = htmlTable(html);
	if (header?.[1] !== "Model" || header[2] !== "Score") throw new Error("Blueprint-Bench 2 table columns changed.");
	return rows.flatMap((cells) => {
		const value = parseNumber(cells[2]?.replace(/\*+$/, ""));
		const label = cells[1] ?? "";
		if (!label || value === null || /^human/i.test(label)) return [];
		return [{ benchmarkId: "blueprint-bench-2", label, value }];
	});
}

/** Butter-Bench's chart data, compiled into a page script: `{model:\`Gemini 2.5 Pro\`,score:.4,color:…}`. */
export function parseButterBench(js: string): SourceObservation[] {
	return [...js.matchAll(/\{model:`([^`]+)`,score:([\d.]+),color:`var\(--color-([\w-]+)\)`\}/g)].flatMap(([, model, score, color]) => (color === "human" ? [] : [{
		benchmarkId: "butter-bench",
		label: model,
		value: Number(score) * 100,
	}]));
}

export const andonLabs: BenchmarkSource = {
	id: "andonlabs",
	name: "Andon Labs evals",
	publisher: "Andon Labs",
	url: ANDON,
	attribution: "Andon Labs (andonlabs.com)",
	minRows: 34,
	benchmarks: [
		{ id: "vending-bench-2", name: "Vending-Bench 2", url: `${ANDON}/vending-bench-2`, category: "agents", type: "numerical", higherIsBetter: true, unit: "USD", description: "The agent runs a simulated vending machine business for a year, dealing with suppliers, inventory, pricing and refunds. Money balance at the end of the year, averaged across runs." },
		{ id: "blueprint-bench-2", name: "Blueprint-Bench 2", url: `${ANDON}/blueprint-bench-2`, category: "vision", type: "numerical", higherIsBetter: true, unit: "score", description: "From photos of an apartment the model draws its floor plan, which is compared with the real plan's room connectivity. Score from 0 (random baseline) to 1 (perfect)." },
		percent("butter-bench", "Butter-Bench", `${ANDON}/butter-bench`, "agents", "The model controls a robot doing delivery tasks in a household setting, such as passing the butter. Share of tasks completed."),
	],
	async fetch(ctx) {
		const [vending, blueprint, butter] = await Promise.all(["vending-bench-2", "blueprint-bench-2", "butter-bench"].map((slug) => ctx.fetchText(`${ANDON}/${slug}`)));
		const butterJs = await scriptWith(ctx, pageScripts(butter, "https://andonlabs.com/", /\/?_app\/immutable\/[\w./-]+\.js/g), "{model:`");
		if (!butterJs) throw new Error("Butter-Bench scores are no longer in the page's scripts.");
		return [...parseVendingBench2(vending), ...parseBlueprintBench2(blueprint), ...parseButterBench(butterJs)];
	},
};

// FrontierMemory ---------------------------------------------------------------------------------------------------

const FRONTIER_MEMORY = "https://frontiermemory.com/";

/** The unified table's rows carry `data-harness`; the model cell reads "Gemini 4 Neon [xhigh]". */
export function parseFrontierMemory(html: string): SourceObservation[] {
	const start = html.indexOf("unified-leaderboard");
	if (start < 0) throw new Error("FrontierMemory format changed: unified-leaderboard not found.");
	const table = html.slice(start, html.indexOf("</table>", start));
	return [...table.matchAll(/<tr data-harness="([^"]*)" data-dream-model="[^"]*">([\s\S]*?)<\/tr>/g)].flatMap(([, harness, row]) => {
		const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => htmlText(cell[1]));
		const [, model, score, cost] = cells;
		const value = parseNumber(score);
		if (!model || value === null) return [];
		const effort = model.match(/\[([^\]]+)\]\s*$/)?.[1];
		return [{ benchmarkId: "frontiermemory", label: withClaudeFamily(model.replace(/\s*\[[^\]]+\]\s*$/, "")), effort, harness: htmlText(harness), value, costUsd: parseNumber(cost) ?? undefined }];
	});
}

export const frontierMemory: BenchmarkSource = {
	id: "frontiermemory",
	name: "FrontierMemory",
	publisher: "FrontierMemory",
	url: FRONTIER_MEMORY,
	attribution: "FrontierMemory (frontiermemory.com)",
	minRows: 14,
	benchmarks: [percent("frontiermemory", "FrontierMemory", FRONTIER_MEMORY, "agents", "An agent writes memories from earlier work, then a task model uses them to complete later tasks. Score on the tasks, with cost per task; each row is a memory harness and model.")],
	async fetch(ctx) {
		return parseFrontierMemory(await ctx.fetchText(FRONTIER_MEMORY));
	},
};

// FrontierPhysics (BenchFlow) --------------------------------------------------------------------------------------

const FRONTIER_PHYSICS = "https://www.benchflow.ai/frontierphysics";

type PhysicsAgent = { model?: string; baseModel?: string; harness?: string; effort?: string | null; overall?: { avg3?: number; ci?: number }; cost?: { perRollout?: number }; minutes?: { perRollout?: number }; outputTokens?: { perRollout?: number } };

/** The leaderboard is a JSON module inside one of the page's scripts: `"agents":[{"rank":1,…}]`. */
export function parseFrontierPhysics(js: string): SourceObservation[] {
	const agents = jsonAfter<PhysicsAgent[]>(js, '"agents":[{"rank"');
	return agents.flatMap((agent) => {
		const label = agent.baseModel || agent.model;
		const value = agent.overall?.avg3;
		if (!label || typeof value !== "number") return [];
		const half = agent.overall?.ci;
		return [{
			benchmarkId: "frontierphysics",
			label,
			effort: agent.effort || undefined,
			harness: agent.harness,
			value,
			ciLow: typeof half === "number" ? Math.max(0, value - half) : undefined,
			ciHigh: typeof half === "number" ? Math.min(100, value + half) : undefined,
			costUsd: agent.cost?.perRollout,
			durationSeconds: typeof agent.minutes?.perRollout === "number" ? Math.round(agent.minutes.perRollout * 60) : undefined,
			outputTokens: agent.outputTokens?.perRollout,
		}];
	});
}

export const frontierPhysics: BenchmarkSource = {
	id: "frontierphysics",
	name: "FrontierPhysics",
	publisher: "BenchFlow",
	url: FRONTIER_PHYSICS,
	attribution: "FrontierPhysics by BenchFlow (benchflow.ai)",
	minRows: 20,
	benchmarks: [percent("frontierphysics", "FrontierPhysics", FRONTIER_PHYSICS, "science", "Agents carry out end-to-end physics research tasks written by physicists, across theory, computation and experiment. Pass rate averaged over three trials, with a confidence interval; each row is one model in one harness.")],
	async fetch(ctx) {
		const html = await ctx.fetchText(FRONTIER_PHYSICS);
		const js = await scriptWith(ctx, pageScripts(html, "https://www.benchflow.ai/", /\/frontierphysics\/_next\/static\/[\w/.-]+\.js/g), '"agents":[{"rank"');
		if (!js) throw new Error("FrontierPhysics leaderboard is no longer in the page's scripts.");
		return parseFrontierPhysics(js);
	},
};

// FrontierBreach (PromptArmor) -------------------------------------------------------------------------------------

const FRONTIER_BREACH = "https://www.promptarmor.com/frontier-breach";

/** Each bar is `<li aria-label="GPT-6 Astra, OpenAI: 7.6% attack success rate, plus or minus 3.8">`; charts repeat models. */
export function parseFrontierBreach(html: string): SourceObservation[] {
	const seen = new Set<string>();
	return [...html.matchAll(/<li aria-label="([^"]+?), [^",:]+: ([\d.]+)% attack success rate, plus or minus ([\d.]+)"/g)].flatMap(([, model, rate, margin]) => {
		if (seen.has(model)) return [];
		seen.add(model);
		const value = Number(rate);
		return [{ benchmarkId: "frontier-breach", label: htmlText(model), effort: "medium", value, ciLow: Math.max(0, value - Number(margin)), ciHigh: Math.min(100, value + Number(margin)) }];
	});
}

export const frontierBreach: BenchmarkSource = {
	id: "frontier-breach",
	name: "FrontierBreach",
	publisher: "PromptArmor",
	url: FRONTIER_BREACH,
	attribution: "FrontierBreach by PromptArmor (promptarmor.com)",
	minRows: 13,
	benchmarks: [percent("frontier-breach", "FrontierBreach", FRONTIER_BREACH, "safety", "Indirect prompt-injection attacks hidden in the material an agent works with during realistic enterprise workflows. Attack success rate within five attempts, with a 95% interval, all models at medium effort. Lower is better.", false)],
	async fetch(ctx) {
		return parseFrontierBreach(await ctx.fetchText(FRONTIER_BREACH));
	},
};

// Frontier Design (Contra) -----------------------------------------------------------------------------------------

const FRONTIER_DESIGN = "https://contralabs.com/frontierdesign/leaderboard";
const FRONTIER_DESIGN_DATA = "https://contralabs.com/frontierdesign/data/fdb.js";

/** `fdb.js` is a JS literal; the overall standings are `{name:"…",org:"…",golden:!1,…,ranked:!0,elo:1931,ci:72,eloLo:…,eloHi:…}`. */
export function parseFrontierDesign(js: string): SourceObservation[] {
	const start = js.indexOf("standings:[");
	if (start < 0) throw new Error("Frontier Design format changed: standings not found.");
	const body = js.slice(start, js.indexOf("}]", start) + 2);
	return [...body.matchAll(/\{name:"([^"]+)",org:"[^"]*",golden:(!0|!1),[^{}]*?ranked:(!0|!1),elo:(\d+),ci:[\d.]+,eloLo:(\d+),eloHi:(\d+)/g)].flatMap(([, name, golden, ranked, elo, low, high]) => (
		// Golden rows are the human designers the models are compared with.
		golden === "!0" || ranked !== "!0" ? [] : [{ benchmarkId: "frontier-design", label: name, value: Number(elo), ciLow: Number(low), ciHigh: Number(high) }]
	));
}

export const frontierDesign: BenchmarkSource = {
	id: "frontier-design",
	name: "Frontier Design Benchmark",
	publisher: "Contra",
	url: FRONTIER_DESIGN,
	attribution: "Frontier Design Benchmark by Contra (contralabs.com)",
	minRows: 10,
	benchmarks: [{ id: "frontier-design", name: "Frontier Design Benchmark", url: FRONTIER_DESIGN, category: "creativity", type: "numerical", higherIsBetter: true, unit: "Elo", description: "Models design websites from real client briefs, and professional designers on Contra vote blind between pairs of results. Elo rating from those votes, with an interval." }],
	async fetch(ctx) {
		return parseFrontierDesign(await ctx.fetchText(FRONTIER_DESIGN_DATA));
	},
};

// Corpo-Bench (local-bench.ai) -------------------------------------------------------------------------------------

const CORPO = "https://local-bench.ai/";

/** The Corpo Index board: one `<a class="row">` per configuration with name, cost, hours and index. */
export function parseCorpoBench(html: string): SourceObservation[] {
	const board = html.match(/<section[^>]*data-board="corpo"[\s\S]*?<\/section>/)?.[0];
	if (!board) throw new Error("Corpo-Bench format changed: corpo board not found.");
	return [...board.matchAll(/<a class="row\b[^"]*" href="\/models\/[^"]+"[^>]*>([\s\S]*?)<\/a>/g)].flatMap(([, row]) => {
		const name = htmlText(row.match(/<span class="nm">([\s\S]*?)<\/span>/)?.[1] ?? "");
		const value = parseNumber(htmlText(row.match(/<span class="num">([\s\S]*?)<\/span>/)?.[1] ?? ""));
		// "Qwen3.8-27B · Qwen Code local: RTX 5090, 4-bit": quantised local runs aren't the served model.
		if (!name || value === null || /\blocal:/i.test(name)) return [];
		const [model, harness] = name.split(" · ");
		const effort = model.match(/\((\w+) effort\)\s*$/)?.[1];
		const cost = htmlText(row.match(/<span class="cst">([\s\S]*?)<\/span>/)?.[1] ?? "").match(/^\$([\d.,]+)/)?.[1];
		const hours = parseNumber(htmlText(row.match(/<span class="hrs">([\s\S]*?)<span/)?.[1] ?? ""));
		return [{
			benchmarkId: "corpo-bench",
			// "Tencent Hy4", "Z.ai GLM 5.3 Flash": the board prefixes some models with their lab.
			label: withClaudeFamily(model.replace(/\s*\(\w+ effort\)\s*$/, "").replace(/[^\w)]+$/u, "").replace(/^(Tencent|Z\.ai|Meta|ricursiveAI)\s+/i, "").trim()),
			effort,
			harness: harness?.trim() || undefined,
			value,
			costUsd: cost ? parseNumber(cost) ?? undefined : undefined,
			durationSeconds: hours !== null ? hours * 3600 : undefined,
		}];
	});
}

export const corpoBench: BenchmarkSource = {
	id: "corpo-bench",
	name: "Corpo-Bench",
	publisher: "local-bench.ai",
	url: CORPO,
	attribution: "Corpo-Bench by local-bench.ai",
	minRows: 15,
	benchmarks: [{ id: "corpo-bench", name: "Corpo-Bench (Corpo Index)", url: CORPO, category: "agents", type: "numerical", higherIsBetter: true, unit: "index", description: "Complex, long-horizon corporate work done by an agent. Corpo Index, with cost and hours per run." }],
	async fetch(ctx) {
		return parseCorpoBench(await ctx.fetchText(CORPO));
	},
};

// GDPx (SemiAnalysis) ----------------------------------------------------------------------------------------------

const GDPX = "https://gdpx.semianalysis.com/";

type GdpxModel = { name: string; harness?: string; reasoning?: string };

/** The page renders the leaderboard: `text-[15px] font-medium">Claude Fable 5.2</span>…>16.4<!-- -->%`. */
export function parseGdpx(html: string, models: GdpxModel[] = []): SourceObservation[] {
	const byName = new Map(models.map((model) => [model.name, model]));
	return [...html.matchAll(/text-\[15px\] font-medium">([^<]+)<\/span>[\s\S]*?>(\d+(?:\.\d+)?)<!-- -->%/g)].map(([, name, score]) => {
		const model = byName.get(htmlText(name));
		// "Highest" names each model's top setting, whatever the provider calls it.
		const effort = model?.reasoning && model.reasoning !== "Highest" ? model.reasoning.toLowerCase() : undefined;
		return { benchmarkId: "gdpx", label: htmlText(name), effort, harness: model?.harness, value: Number(score) };
	});
}

export const gdpx: BenchmarkSource = {
	id: "gdpx",
	name: "GDPx",
	publisher: "SemiAnalysis",
	url: GDPX,
	attribution: "GDPx by SemiAnalysis (gdpx.semianalysis.com)",
	minRows: 8,
	benchmarks: [percent("gdpx", "GDPx", GDPX, "professional", "Agents do economically valuable work built with specialised data partners across domains such as chip design, finance, law and biology. Score averaged across the domains; each row is one model in its own harness.")],
	async fetch(ctx) {
		const html = await ctx.fetchText(GDPX);
		const js = await scriptWith(ctx, pageScripts(html, GDPX, /\/_next\/static\/immutable\/chunks\/[\w.-]+\.js/g), `JSON.parse('{"updatedAt"`);
		const literal = js?.match(/JSON\.parse\('(\{"updatedAt"[\s\S]*?\})'\)/)?.[1];
		const data = literal ? (JSON.parse(literal.replace(/\\([\\'])/g, "$1")) as { models?: GdpxModel[] }) : undefined;
		return parseGdpx(html, data?.models);
	},
};

// Julius DeepFinance -----------------------------------------------------------------------------------------------

const DEEP_FINANCE = "https://www.juliusresearch.ai/deep-finance";

type FinanceResult = { model: string; reasoning?: string; score: number; ciLow?: number; ciHigh?: number; costPerTask?: number; tokensPerTask?: number };

export function parseDeepFinance(html: string): SourceObservation[] {
	const results = jsonAfter<FinanceResult[]>(nextFlight(html), '"results":[{');
	return results.flatMap((result) => (typeof result.score !== "number" ? [] : [{
		benchmarkId: "julius-deepfinance",
		label: result.model,
		effort: result.reasoning || undefined,
		value: result.score,
		ciLow: result.ciLow,
		ciHigh: result.ciHigh,
		costUsd: result.costPerTask,
	}]));
}

export const deepFinance: BenchmarkSource = {
	id: "julius-deepfinance",
	name: "DeepFinance",
	publisher: "Julius AI",
	url: DEEP_FINANCE,
	attribution: "DeepFinance by Julius Research (juliusresearch.ai)",
	minRows: 17,
	benchmarks: [percent("julius-deepfinance", "DeepFinance", DEEP_FINANCE, "finance", "Very long private-equity and investment-banking tasks over a data room, each taking a professional 20 to 30 hours. Mean rubric score, the share of rubric criteria satisfied, with a 95% bootstrap interval.")],
	async fetch(ctx) {
		return parseDeepFinance(await ctx.fetchText(DEEP_FINANCE));
	},
};

// ExploitBench -----------------------------------------------------------------------------------------------------

const EXPLOITBENCH = "https://exploitbench.ai/";

/**
 * The "Full leaderboard" table: the model cell reads "02 GPT 5.5 (Codex) AutoNudge 3000 t openai openai/gpt-5.5", ending
 * in the model id; "(Codex)" runs used the vendor CLI and AutoNudge runs were nudged to keep going.
 */
export function parseExploitBench(html: string): SourceObservation[] {
	const tables = (html.match(/<table/g) ?? []).map((_, index) => htmlTable(html, index));
	const table = tables.find(([header]) => header?.includes("Cap coverage"));
	if (!table) throw new Error("ExploitBench full leaderboard table not found.");
	const [header, ...rows] = table;
	const [model, coverage, episodes, spend] = ["Model", "Cap coverage", "Episodes", "Spend"].map((name) => header.indexOf(name));
	return rows.flatMap((cells) => {
		const value = parseNumber(cells[coverage]);
		const id = cells[model]?.split(" ").at(-1);
		if (!id?.includes("/") || value === null) return [];
		const harness = [/\(Codex\)/.test(cells[model]) ? "Codex CLI" : "ExploitBench runner", /AutoNudge/.test(cells[model]) ? "AutoNudge" : null].filter(Boolean).join(" + ");
		const total = parseNumber(cells[spend]);
		const count = parseNumber(cells[episodes]);
		return [{ benchmarkId: "exploitbench-cap", label: id, harness, value, costUsd: total !== null && count ? total / count : undefined }];
	});
}

export const exploitBench: BenchmarkSource = {
	id: "exploitbench",
	name: "ExploitBench",
	publisher: "ExploitBench (Carnegie Mellon University)",
	url: EXPLOITBENCH,
	attribution: "ExploitBench by Seunghyun Lee and David Brumley, Carnegie Mellon University (exploitbench.ai)",
	minRows: 12,
	benchmarks: [percent("exploitbench-cap", "ExploitBench (Cap%)", EXPLOITBENCH, "cybersecurity", "The model tries to exploit real V8 JavaScript engine bugs, climbing a ladder of 16 capabilities up to arbitrary code execution. Capability coverage: the share of capability flags reached across the bugs.")],
	async fetch(ctx) {
		return parseExploitBench(await ctx.fetchText(EXPLOITBENCH));
	},
};

// RWE-Bench (Xplore) -----------------------------------------------------------------------------------------------

const RWE = "https://xplore.ai/rwe-bench";
const RWE_DATA = "https://xplore.ai/js/rwe-data.js";

/** `rwe-data.js` lists one model per line: `{ name: 'Claude Fable 5.2', harness: 'Claude Code', effort: 'max', pass1: 62, lo: 55.2, … }`. */
export function parseRweBench(js: string): SourceObservation[] {
	const start = js.indexOf("models: [");
	if (start < 0) throw new Error("RWE-Bench format changed: models list not found.");
	const block = js.slice(start, js.indexOf("\n  ],", start));
	return block.split("\n").flatMap((line) => {
		const text = (key: string) => line.match(new RegExp(`\\b${key}:\\s*'([^']*)'`))?.[1];
		const number = (key: string) => parseNumber(line.match(new RegExp(`\\b${key}:\\s*(-?[\\d.]+)`))?.[1]);
		const name = text("name");
		const value = number("pass1");
		if (!name || value === null) return [];
		const hours = number("time");
		return [{
			benchmarkId: "rwe-bench",
			label: name,
			effort: text("effort"),
			harness: text("harness"),
			value,
			ciLow: number("lo") ?? undefined,
			ciHigh: number("hi") ?? undefined,
			costUsd: number("cost") ?? undefined,
			durationSeconds: hours !== null ? Math.round(hours * 3600) : undefined,
		}];
	});
}

export const rweBench: BenchmarkSource = {
	id: "rwebench",
	name: "RWE-Bench",
	publisher: "Xplore",
	url: RWE,
	attribution: "RWE-Bench by Xplore (xplore.ai)",
	minRows: 10,
	benchmarks: [percent("rwe-bench", "RWE-Bench", RWE, "professional", "Real engineering design work in electrical, aerospace and mechanical engineering, run several times per task in the model's own agent harness. A run passes when its design passes every check; average pass rate with a 95% interval.")],
	async fetch(ctx) {
		return parseRweBench(await ctx.fetchText(RWE_DATA));
	},
};

// SolidWorks-Bench (Markov Studios) --------------------------------------------------------------------------------

const SOLIDWORKS = "https://www.markovstudios.com/research/solidworks-bench";

export function parseSolidworksBench(html: string): SourceObservation[] {
	const tables = (html.match(/<table/g) ?? []).map((_, index) => htmlTable(html, index));
	const table = tables.find(([header]) => header?.includes("$ / machine") && header.includes("Reward"));
	if (!table) throw new Error("SolidWorks-Bench leaderboard table not found.");
	const effort = htmlText(html).match(/reasoning effort (none|minimal|low|medium|high|xhigh|max) for every model/i)?.[1]?.toLowerCase();
	const [header, ...rows] = table;
	const [model, cost, time, reward] = ["Model", "$ / machine", "Median time", "Reward"].map((name) => header.indexOf(name));
	return rows.flatMap((cells) => {
		const value = parseNumber(cells[reward]);
		if (!cells[model] || value === null) return [];
		const hours = parseNumber(cells[time]?.replace(/\s*h$/, ""));
		return [{
			benchmarkId: "solidworks-bench",
			label: withClaudeFamily(cells[model]),
			effort,
			value,
			costUsd: parseNumber(cells[cost]) ?? undefined,
			durationSeconds: hours !== null ? Math.round(hours * 3600) : undefined,
		}];
	});
}

export const solidworksBench: BenchmarkSource = {
	id: "solidworks-bench",
	name: "SolidWorks-Bench",
	publisher: "Markov Studios",
	url: SOLIDWORKS,
	attribution: "SolidWorks-Bench by Markov Studios (markovstudios.com)",
	minRows: 5,
	benchmarks: [{ id: "solidworks-bench", name: "SolidWorks-Bench", url: SOLIDWORKS, category: "3d", type: "numerical", higherIsBetter: true, unit: "score", description: "The model rebuilds real machines in SolidWorks, modelling custom parts and assembling them. Reward from 0 to 1 for geometry, assembly and practice, with cost per machine." }],
	async fetch(ctx) {
		return parseSolidworksBench(await ctx.fetchText(SOLIDWORKS));
	},
};
