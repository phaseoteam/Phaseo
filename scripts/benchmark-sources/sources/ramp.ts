import { parseCsv, parseNumber } from "../parse";
import type { BenchmarkSource, SourceObservation } from "../types";

/**
 * Ramp Labs. SWE-Bench v2 publishes one CSV row per model × harness × task: v2.0 runs every model in the bash-only
 * mini-swe-agent harness, v2.1 in its vendor's native harness. Resolve rate is resolved tasks over tasks attempted.
 * Ramp Accounting Bench has no data file; its per-model metrics are an object literal in the page's JS chunk.
 */

const LABS = "https://labs.ramp.com";
const SWE_PAGE = `${LABS}/swebench`;
const SWE_DATA = { "ramp-swe-bench-v2-bash": `${LABS}/swebench/v2/data/results.csv`, "ramp-swe-bench-v2": `${LABS}/swebench/v2/data/v21/results.csv` } as const;
const ACCOUNTING_PAGE = `${LABS}/ramp-accounting-bench`;

const EFFORT = /-(none|minimal|low|medium|high|xhigh|max)$/;

export function parseRampSwe(benchmarkId: string, csv: string): SourceObservation[] {
	const rows = parseCsv(csv);
	if (!rows.length || !("resolved" in rows[0]) || !("model" in rows[0])) throw new Error(`Ramp ${benchmarkId}: results.csv format changed.`);
	const runs = new Map<string, { model: string; harness: string; tasks: Map<string, { resolved: boolean; cost?: number; seconds?: number; tokens?: number }>; latest: string }>();
	for (const row of rows) {
		if (!row.model || !row.instance_id) continue;
		const key = `${row.model}\u0000${row.harness}`;
		const run = runs.get(key) ?? { model: row.model, harness: row.harness, tasks: new Map(), latest: "" };
		const resolved = /^(true|1)$/i.test(row.resolved);
		// A task can be retried; it counts as resolved if any attempt resolved it.
		const previous = run.tasks.get(row.instance_id);
		run.tasks.set(row.instance_id, {
			resolved: resolved || previous?.resolved === true,
			cost: parseNumber(row.agent_cost_usd) ?? previous?.cost,
			seconds: parseNumber(row.agent_elapsed) ?? previous?.seconds,
			// Ramp's completion count already includes reasoning tokens; its dashboard reports it alone as output tokens.
			tokens: parseNumber(row.agent_completion_tokens) ?? previous?.tokens,
		});
		if (row.timestamp > run.latest) run.latest = row.timestamp;
		runs.set(key, run);
	}
	const mean = (values: Array<number | undefined>) => {
		const numbers = values.filter((value): value is number => typeof value === "number");
		return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : undefined;
	};
	return [...runs.values()].map((run) => {
		const tasks = [...run.tasks.values()];
		const name = run.model.split("/").pop()!;
		const effort = name.match(EFFORT)?.[1];
		return {
			benchmarkId,
			label: effort ? name.slice(0, -effort.length - 1) : name,
			effort,
			harness: run.harness || undefined,
			value: (100 * tasks.filter((task) => task.resolved).length) / tasks.length,
			costUsd: mean(tasks.map((task) => task.cost)),
			durationSeconds: mean(tasks.map((task) => task.seconds)),
			outputTokens: mean(tasks.map((task) => task.tokens)),
			observedOn: /^\d{4}-\d{2}-\d{2}/.test(run.latest) ? run.latest.slice(0, 10) : undefined,
			note: `${tasks.length} tasks`,
		};
	});
}

/** Model entries in the accounting chunk: `{id:"…",displayName:"…",…,sourceModel:"…",…,metrics:{…passAt3:…,meanCriteriaAt3:…,costPerTask:…}}`. */
export function parseRampAccounting(source: string): SourceObservation[] {
	const meta = source.match(/\{name:"([^"]+)",version:"([^"]+)",taskCount:(\d+)/);
	if (!meta) throw new Error("Ramp Accounting Bench: benchmark metadata not found.");
	const observedOn = source.match(/latestCompletedAt:"(\d{4}-\d{2}-\d{2})/)?.[1];
	const observations: SourceObservation[] = [];
	for (const match of source.matchAll(/\{id:"[\w.-]+",displayName:"([^"]+)",provider:"[^"]*",sourceModel:"([^"]*)"[\s\S]*?metrics:\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g)) {
		const metric = (name: string) => parseNumber(match[3].match(new RegExp(`\\b${name}:(-?[\\d.]+(?:e-?\\d+)?)`))?.[1]);
		const passAt3 = metric("passAt3");
		const meanAt3 = metric("meanCriteriaAt3");
		const cost = metric("costPerTask") ?? undefined;
		const common = { label: match[1], costUsd: cost, observedOn, note: `${meta[1]}, ${meta[2]}` };
		if (passAt3 !== null) observations.push({ ...common, benchmarkId: "ramp-accounting-bench", value: passAt3 * 100 });
		if (meanAt3 !== null) observations.push({ ...common, benchmarkId: "ramp-accounting-bench-mean", value: meanAt3 * 100 });
	}
	if (!observations.length) throw new Error("Ramp Accounting Bench: no model entries found in the chunk.");
	return observations;
}

export const rampSwebench: BenchmarkSource = {
	id: "ramp-swebench",
	name: "Ramp SWE-Bench v2",
	publisher: "Ramp Labs",
	url: SWE_PAGE,
	attribution: "Ramp Labs (labs.ramp.com)",
	minRows: 25,
	benchmarks: [
		{ id: "ramp-swe-bench-v2", name: "Ramp SWE-Bench v2 (native harness)", url: SWE_PAGE, category: "coding", type: "percentage", higherIsBetter: true, unit: "%", description: "Agents complete engineering tasks rebuilt from pull requests by Ramp engineers in Ramp's private production code, each in its vendor's native coding harness (Codex, Claude Code, Antigravity and others). Resolve rate: share of the 500 tasks resolved, from Ramp's per-task results (v2.1 data)." },
		{ id: "ramp-swe-bench-v2-bash", name: "Ramp SWE-Bench v2 (bash harness)", url: SWE_PAGE, category: "coding", type: "percentage", higherIsBetter: true, unit: "%", description: "Agents complete engineering tasks rebuilt from pull requests by Ramp engineers in Ramp's private production code, every model in the same bash-only mini-swe-agent harness. Resolve rate: share of the 500 tasks resolved, from Ramp's per-task results (v2.0 data)." },
	],
	async fetch(ctx) {
		const entries = Object.entries(SWE_DATA) as Array<[keyof typeof SWE_DATA, string]>;
		const files = await Promise.all(entries.map(([, url]) => ctx.fetchText(url)));
		return entries.flatMap(([benchmarkId], index) => parseRampSwe(benchmarkId, files[index]));
	},
};

export const rampAccountingBench: BenchmarkSource = {
	id: "ramp-accounting-bench",
	name: "Ramp Accounting Bench",
	publisher: "Ramp Labs",
	url: ACCOUNTING_PAGE,
	attribution: "Ramp Labs (labs.ramp.com)",
	minRows: 22,
	benchmarks: [
		{ id: "ramp-accounting-bench", name: "Ramp Accounting Bench", url: ACCOUNTING_PAGE, category: "finance", type: "percentage", higherIsBetter: true, unit: "%", description: "Agents work 137 difficult accounting tasks across 22 simulated companies, using QuickBooks ledgers, bank statements, invoices, contracts, memos and reconciliation workbooks. Pass@3: share of tasks solved in at least one of three attempts." },
		{ id: "ramp-accounting-bench-mean", name: "Ramp Accounting Bench (Mean@3)", url: ACCOUNTING_PAGE, category: "finance", type: "percentage", higherIsBetter: true, unit: "%", description: "Ramp Accounting Bench reward (Mean@3): mean share of grading criteria met across the 137 tasks over three attempts." },
	],
	async fetch(ctx) {
		const html = await ctx.fetchText(ACCOUNTING_PAGE);
		const main = html.match(/\/assets\/main-[\w-]+\.js/)?.[0];
		if (!main) throw new Error("Ramp Accounting Bench: main bundle not found.");
		const mainJs = await ctx.fetchText(`${LABS}${main}`);
		const chunk = mainJs.match(/UnsettledAccountingBench-[\w-]+\.js/)?.[0];
		if (!chunk) throw new Error("Ramp Accounting Bench: page chunk not found in the main bundle.");
		return parseRampAccounting(await ctx.fetchText(`${LABS}/assets/${chunk}`));
	},
};
