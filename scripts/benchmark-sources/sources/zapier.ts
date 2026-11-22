import { parseNumber } from "../parse";
import type { BenchmarkSource, SourceObservation } from "../types";

/**
 * Zapier AutomationBench. zapier.com/benchmarks is a Framer page that server-renders only the top ten; the full table
 * (rank, label, score, cost per task) is an array literal in one of the page's hashed Framer modules, next to the
 * leaderboard version. There is no data file, so the module is found by its content rather than its name.
 */

const PAGE = "https://zapier.com/benchmarks";

export type ZapierBoard = { version: string; rows: Array<{ rank: number; label: string; score: number; cost: number | null }> };

/** The version string and leaderboard rows from a Framer module, or null when the module doesn't hold them. */
export function parseZapierModule(source: string): ZapierBoard | null {
	const table = source.match(/\b\w+=`(\d+\.\d+\.\d+)`,\w+=\[\[1,`/);
	if (!table) return null;
	const start = table.index! + table[0].length - "[[1,`".length;
	const rows: ZapierBoard["rows"] = [];
	// Cost cells carry footnote markers ("$1.70*", "$0.04‡").
	const row = /\[(\d+),`([^`]+)`,`([\d.]+)%`,`([^`]*)`\]/y;
	row.lastIndex = start + 1;
	for (;;) {
		const match = row.exec(source);
		if (!match) break;
		rows.push({ rank: Number(match[1]), label: match[2], score: Number(match[3]), cost: parseNumber(match[4].replace(/[^\d.]/g, "")) });
		if (source[row.lastIndex] !== ",") break;
		row.lastIndex += 1;
	}
	return rows.length ? { version: table[1], rows } : null;
}

/** "Claude Fable 5.2 (default fallbacks, Max)" → label + effort; combinations of two models are skipped. */
export function zapierObservations(board: ZapierBoard): SourceObservation[] {
	return board.rows.flatMap((row) => {
		const inside = row.label.match(/\(([^)]*)\)\s*$/)?.[1];
		const parts = inside?.split(",").map((part) => part.trim()) ?? [];
		// "(with Opus 5 Fallback)" means a second model finished refused steps: not one model's result.
		if (parts.some((part) => /^with\b/i.test(part))) return [];
		// Effort is a standard level, or a thinking mode such as "Between tools"; the fallback note is not an effort.
		const settings = parts.filter((part) => !/fallback/i.test(part)).map((part) => part.toLowerCase().replace(/^x-?high$/, "xhigh"));
		const effort = settings.find((part) => ["none", "minimal", "low", "medium", "high", "xhigh", "max"].includes(part)) ?? settings[0];
		const fallbacks = parts.some((part) => /fallback/i.test(part));
		const label = inside ? row.label.slice(0, row.label.lastIndexOf("(")).trim() : row.label;
		return [{
			benchmarkId: "automationbench",
			label,
			effort,
			value: row.score,
			costUsd: row.cost ?? undefined,
			note: [`AutomationBench ${board.version}`, fallbacks ? "run with the provider's default fallback model for refused steps" : null].filter(Boolean).join("; "),
		}];
	});
}

export const zapier: BenchmarkSource = {
	id: "zapier",
	name: "AutomationBench",
	publisher: "Zapier",
	url: PAGE,
	attribution: "AutomationBench by Zapier (zapier.com/benchmarks)",
	minRows: 90,
	benchmarks: [
		{ id: "automationbench", name: "AutomationBench", url: PAGE, category: "agents", type: "percentage", higherIsBetter: true, unit: "%", description: "From one trigger message, an agent works alone through end-to-end business workflows using 47 real tools across sales, marketing, operations, support, finance and HR. Deterministic assertions check the end state; score (%) with cost per task." },
	],
	async fetch(ctx) {
		const html = await ctx.fetchText(PAGE);
		const modules = [...new Set(html.match(/https:\/\/framerusercontent\.com\/sites\/[\w-]+\/[\w.-]+\.mjs/g) ?? [])];
		for (const url of modules) {
			const board = parseZapierModule(await ctx.fetchText(url));
			if (board) return zapierObservations(board);
		}
		throw new Error(`AutomationBench table not found in ${modules.length} Framer modules.`);
	},
};
