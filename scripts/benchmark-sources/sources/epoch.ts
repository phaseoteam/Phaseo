import { splitEffort } from "../match";
import { parseCsv, parseNumber } from "../parse";
import type { BenchmarkDefinition, BenchmarkSource, SourceContext, SourceObservation } from "../types";

/**
 * Epoch AI's Benchmarking Hub export: one CSV with every run Epoch has made, across its own tasks and its re-runs of
 * public benchmarks. Three sources read it: the hub's tasks, Furniture Assembly and FrontierMath.
 */
const ORIGIN = "https://epoch.ai";
const DATA = `${ORIGIN}/data/benchmarks.csv`;
const ATTRIBUTION = "Epoch AI Benchmarking Hub (epoch.ai), CC BY 4.0";

type Task = { task: string; definition: BenchmarkDefinition };

function definition(id: string, name: string, page: string, category: string, description: string): BenchmarkDefinition {
	return { id, name, url: page ? `${ORIGIN}/benchmarks/${page}` : `${ORIGIN}/benchmarks`, category, type: "percentage", higherIsBetter: true, unit: "%", description };
}

const TASKS: Task[] = [
	{ task: "Chess Puzzles", definition: definition("epoch-chess-puzzles", "Chess Puzzles (Epoch AI)", "chess-puzzles", "reasoning", "The model finds the best move in chess positions that have one correct line. Share of puzzles solved, run by Epoch AI.") },
	{ task: "EBR-bench", definition: definition("epoch-ebr-bench", "EBR-bench (Epoch AI)", "ebr-bench", "agents", "The model plays scenarios of the Earthborne Rangers card game. Share of the scenario score reached, run by Epoch AI.") },
	{ task: "MATH level 5", definition: definition("math-level-5-epoch", "MATH Level 5 (Epoch AI run)", "math-level-5", "math", "Level 5, the hardest tier, of the MATH competition problems. Accuracy, run by Epoch AI.") },
	{ task: "MirrorCode", definition: definition("epoch-mirrorcode", "MirrorCode (Epoch AI)", "mirrorcode", "code", "The model reimplements an existing program from its behaviour. Share of the program's tests passed, run by Epoch AI.") },
	{ task: "Mystery Game Puzzles", definition: definition("epoch-mystery-game-puzzles", "Mystery Game Puzzles (Epoch AI)", "mystery-game-puzzles", "reasoning", "The model works out the hidden rules of puzzle games by playing them. Share of puzzles solved, run by Epoch AI.") },
	{ task: "OEIS Open", definition: definition("epoch-oeis-open", "OEIS Open (Epoch AI)", "", "math", "Open problems about integer sequences from the OEIS. Share solved, as graded by Epoch AI's proof scorer.") },
	{ task: "OEIS Open Lite", definition: definition("epoch-oeis-open-lite", "OEIS Open Lite (Epoch AI)", "", "math", "The Lite split of OEIS Open: open problems about integer sequences from the OEIS. Share solved, as graded by Epoch AI's proof scorer.") },
	{ task: "SpireClimb", definition: definition("epoch-spireclimb", "SpireClimb (Epoch AI)", "spireclimb", "agents", "The model plays Slay the Spire, choosing cards and routes up the spire. Share of the climb completed, run by Epoch AI.") },
	{ task: "GPQA diamond", definition: definition("gpqa-diamond-epoch", "GPQA Diamond (Epoch AI run)", "gpqa-diamond", "knowledge", "Graduate-level multiple-choice questions in biology, physics and chemistry, diamond subset. Accuracy, run by Epoch AI.") },
	{ task: "OTIS Mock AIME 2024-2025", definition: definition("otis-mock-aime-epoch", "OTIS Mock AIME 2024–2025 (Epoch AI run)", "otis-mock-aime-2024-2025", "math", "Problems from the OTIS mock AIME exams of 2024 and 2025, each with an integer answer. Accuracy, run by Epoch AI.") },
	{ task: "SimpleQA Verified", definition: definition("simpleqa-verified-epoch", "SimpleQA Verified (Epoch AI run)", "simple-qa-verified", "knowledge", "Short fact-seeking questions with verified answers. Share answered correctly, run by Epoch AI.") },
	{ task: "SWE-Bench verified", definition: definition("swe-bench-verified-epoch", "SWE-bench Verified (Epoch AI run)", "swe-bench-verified", "code", "The model resolves real GitHub issues from the human-verified SWE-bench subset. Share of issues resolved, run by Epoch AI with its own scaffold.") },
];

const FURNITURE: Task[] = [
	{ task: "Furniture Assembly", definition: definition("epoch-furniture-assembly", "Furniture Assembly (Epoch AI)", "furniture-assembly", "reasoning", "The model works out how to assemble pieces of furniture. Accuracy as scored by Epoch AI.") },
];

const FRONTIERMATH: Task[] = [
	{ task: "FrontierMath-Tiers-1-3-v2-Private", definition: definition("frontiermath-tiers-1-3", "FrontierMath Tiers 1–3", "frontiermath-tiers-1-3-v2", "math", "Unpublished research-level math problems with automatically checkable answers, tiers 1 to 3 (v2, private set). Share solved, run by Epoch AI.") },
	{ task: "FrontierMath-Tier-4-v2-Private", definition: definition("frontiermath-tier-4", "FrontierMath Tier 4", "frontiermath-tier-4-v2", "math", "The hardest FrontierMath problems, tier 4 (v2, private set): research-level math with automatically checkable answers. Share solved, run by Epoch AI.") },
	{ task: "FrontierMath-Erdos", definition: definition("frontiermath-erdos", "FrontierMath Erdős", "frontiermath-erdos", "math", "FrontierMath problems drawn from Erdős problems. Share solved, run by Epoch AI.") },
];

/** Inference providers Epoch names in a display name: "(Together, max)". These aren't part of the model or its setup. */
const PROVIDERS = /^(together|fireworks|deepinfra|openrouter|groq|cerebras|baseten|novita|nebius|bedrock|vertex|azure|replicate|hyperbolic|sambanova)$/i;

/**
 * "Gemini 4 Neon (xhigh)": the display name carries the effort the model id ends with. A two-part suffix names a
 * provider ("(Together, max)", dropped) or a configuration Epoch runs separately ("(with fallback, max)", "(pro, max)",
 * "(Apr 2026, high)"), which is kept as `config` so it isn't merged with the standalone run.
 */
export function epochLabel(name: string): { label: string; config?: string } {
	const match = name.match(/\s*\(([^(),]+), ([^(),]+)\)$/);
	if (!match) return { label: name };
	const label = `${name.slice(0, match.index)} (${match[2].trim()})`;
	const first = match[1].trim();
	return PROVIDERS.test(first) ? { label } : { label, config: first };
}

/**
 * The effort a run's model id ends with: "glm-5.2_max" → "max", "claude-haiku-4-5-20251001_32K" → "32k thinking".
 * The display name often omits it ("GLM-5.2" for the _max, _low and _none runs), so the id is what keeps runs apart.
 */
export function epochEffort(modelId: string): string | undefined {
	const suffix = modelId.includes("_") ? modelId.slice(modelId.lastIndexOf("_") + 1) : "";
	if (!suffix) return undefined;
	const budget = suffix.match(/^(\d+)k$/i);
	if (budget) return `${budget[1]}k thinking`;
	return splitEffort(`model (${suffix})`).effort ?? undefined;
}

/** Latest successful run per task × Epoch model id (the id carries the effort, e.g. "gpt-6_high"). */
export function parseEpochRuns(csv: string, tasks: Task[]): SourceObservation[] {
	const records = parseCsv(csv.replace(/^﻿/, ""));
	if (records.length && !("task" in records[0] && "model" in records[0] && "Best score (across scorers)" in records[0])) {
		throw new Error("Epoch benchmarks.csv format changed: expected task, model and Best score columns.");
	}
	const byTask = new Map(tasks.map((task) => [task.task, task.definition]));
	const latest = new Map<string, Record<string, string>>();
	for (const row of records) {
		if (row.Status !== "Success" || !row.model || !byTask.has(row.task)) continue;
		const key = `${row.task}\u0000${row.model}`;
		const previous = latest.get(key);
		if (!previous || (row.started_at ?? "") > (previous.started_at ?? "")) latest.set(key, row);
	}
	return [...latest.values()].flatMap((row) => {
		const score = parseNumber(row.mean_score) ?? parseNumber(row["Best score (across scorers)"]);
		if (score === null || score < 0 || score > 1) return [];
		const error = parseNumber(row.stderr);
		// The run's effort comes from its model id. The display name can leave it out, and "Unique display name" can
		// name a different one ("GPT-5 mini (medium)" for the _low id); an explicit effort outranks the label's.
		const { label, config } = epochLabel(row["Display name"] || row["Unique display name"] || row.model);
		const effort = epochEffort(row.model);
		return [{
			benchmarkId: byTask.get(row.task)!.id,
			label,
			...(effort ? { effort } : {}),
			...(config ? { config } : {}),
			value: score * 100,
			ciLow: error !== null ? Math.max(0, (score - 1.96 * error) * 100) : undefined,
			ciHigh: error !== null ? Math.min(100, (score + 1.96 * error) * 100) : undefined,
			observedOn: row.started_at?.slice(0, 10) || undefined,
			note: `Epoch AI run ${row.id_runs}`,
		}];
	});
}

const csvByContext = new WeakMap<SourceContext, Promise<string>>();
/** The three Epoch sources share one 4 MB download per run. */
function epochCsv(ctx: SourceContext): Promise<string> {
	let csv = csvByContext.get(ctx);
	if (!csv) {
		csv = ctx.fetchText(DATA);
		csvByContext.set(ctx, csv);
	}
	return csv;
}

function epochSource(id: string, name: string, url: string, tasks: Task[], minRows: number): BenchmarkSource {
	return {
		id,
		name,
		publisher: "Epoch AI",
		url,
		attribution: ATTRIBUTION,
		minRows,
		benchmarks: tasks.map((task) => task.definition),
		async fetch(ctx) {
			return parseEpochRuns(await epochCsv(ctx), tasks);
		},
	};
}

export const epochTasks = epochSource("epoch-tasks", "Epoch AI Benchmarking Hub", `${ORIGIN}/benchmarks`, TASKS, 796);
export const epochFurniture = epochSource("epoch-furniture", "Epoch AI Furniture Assembly", `${ORIGIN}/benchmarks/furniture-assembly`, FURNITURE, 25);
export const frontierMath = epochSource("frontiermath", "FrontierMath", `${ORIGIN}/benchmarks/frontiermath-tiers-1-3-v2`, FRONTIERMATH, 136);
