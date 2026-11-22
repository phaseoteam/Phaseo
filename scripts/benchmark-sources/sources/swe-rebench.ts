import { jsonAfter, nextFlight } from "../parse";
import type { BenchmarkSource, SourceObservation } from "../types";

/**
 * SWE-rebench (Nebius) ships every model's results in the page's flight payload: for each model, resolved rate per
 * task window `"<from>:<to>"` (Unix ms). The board shows one window at a time; this source reads the widest window that
 * ends at the newest cut-off and still covers every model evaluated on the newest issues, which is the window the board
 * headlines. Agent products (Claude Code, Codex, Cursor, …) are skipped; only plain models in the fixed scaffold are read.
 */
const PAGE = "https://swe-rebench.com/";

type Stats = { resolvedRate: number; sem?: number; instanceCosts?: number };
type Item = { modelName: string; agentVersion?: string; meta?: { instance_type?: string }; rangeStats: { all?: Record<string, Stats> } };

export function headlineWindow(items: Item[]): string | null {
	const keys = items.flatMap((item) => Object.keys(item.rangeStats.all ?? {}));
	const end = Math.max(...keys.map((key) => Number(key.split(":")[1])).filter(Number.isFinite));
	if (!Number.isFinite(end)) return null;
	const models = (start: number) => items.filter((item) => item.rangeStats.all?.[`${start}:${end}`]).length;
	const starts = [...new Set(keys.filter((key) => Number(key.split(":")[1]) === end).map((key) => Number(key.split(":")[0])))].filter((start) => start < end).sort((a, b) => b - a);
	if (!starts.length) return null;
	const newest = models(starts[0]);
	// Widen the window while no model drops out.
	let chosen = starts[0];
	for (const start of starts) {
		if (models(start) < newest) break;
		chosen = start;
	}
	return `${chosen}:${end}`;
}

export function parseSweRebench(items: Item[]): SourceObservation[] {
	if (!Array.isArray(items) || !items.length || !items[0].rangeStats) throw new Error("SWE-rebench format changed: expected items[] with rangeStats.");
	const window = headlineWindow(items);
	if (!window) throw new Error("SWE-rebench format changed: no task windows.");
	const [from, to] = window.split(":").map((value) => new Date(Number(value)).toISOString().slice(0, 10));
	return items.flatMap((item) => {
		const stats = item.rangeStats.all?.[window];
		if (!stats || item.meta?.instance_type !== "model" || !Number.isFinite(stats.resolvedRate)) return [];
		const ci = typeof stats.sem === "number" && stats.sem > 0 ? 1.96 * stats.sem : null;
		return [{
			benchmarkId: "swe-rebench",
			label: item.modelName,
			value: stats.resolvedRate,
			ciLow: ci !== null ? stats.resolvedRate - ci : undefined,
			ciHigh: ci !== null ? stats.resolvedRate + ci : undefined,
			costUsd: typeof stats.instanceCosts === "number" && stats.instanceCosts > 0 ? stats.instanceCosts : undefined,
			harness: item.agentVersion === "text" ? "text-only scaffold" : undefined,
			observedOn: to,
			note: `issues from ${from} to ${to}`,
		}];
	});
}

export const sweRebench: BenchmarkSource = {
	id: "swe-rebench",
	name: "SWE-rebench",
	publisher: "Nebius",
	url: PAGE,
	attribution: "SWE-rebench by Nebius (swe-rebench.com)",
	minRows: 10,
	benchmarks: [
		{ id: "swe-rebench", name: "SWE-rebench", url: PAGE, category: "code", type: "percentage", higherIsBetter: true, unit: "%", description: "The model resolves fresh real GitHub issues, created after its release, inside one fixed minimal agent scaffold. Resolved rate (mean over runs) for the newest task window, with cost per problem." },
	],
	async fetch(ctx) {
		const flight = nextFlight(await ctx.fetchText(PAGE));
		return parseSweRebench(jsonAfter<Item[]>(flight, /"items":\[\{"modelId"/));
	},
};
