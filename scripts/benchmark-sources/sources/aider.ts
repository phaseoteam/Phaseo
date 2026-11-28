import { parseNumber } from "../parse";
import type { BenchmarkSource, SourceObservation } from "../types";

/** Aider's polyglot leaderboard is a YAML list of flat runs in the aider repo. */
const PAGE = "https://aider.chat/docs/leaderboards/";
const DATA = "https://raw.githubusercontent.com/Aider-AI/aider/main/aider/website/_data/polyglot_leaderboard.yml";

/** A YAML file that is a list of flat `key: value` maps, which is all this file is. */
export function parseYamlRecords(yaml: string): Array<Record<string, string>> {
	const records: Array<Record<string, string>> = [];
	let current: Record<string, string> | null = null;
	for (const line of yaml.split(/\r?\n/)) {
		const item = line.match(/^-\s+([A-Za-z0-9_]+):\s*(.*)$/);
		const field = line.match(/^\s+([A-Za-z0-9_]+):\s*(.*)$/);
		if (item) { current = {}; records.push(current); current[item[1]] = unquote(item[2]); }
		else if (field && current) current[field[1]] = unquote(field[2]);
	}
	return records;
}

function unquote(value: string) {
	const trimmed = value.trim();
	return /^(["']).*\1$/.test(trimmed) ? trimmed.slice(1, -1) : trimmed;
}

export function parseAider(yaml: string): SourceObservation[] {
	const records = parseYamlRecords(yaml);
	if (!records.length || !records.every((record) => "model" in record && "pass_rate_2" in record)) throw new Error("Aider leaderboard format changed: expected model and pass_rate_2 on every run.");
	return records.flatMap((record) => {
		const value = parseNumber(record.pass_rate_2);
		// Architect/editor pairs ("o3 (high) + gpt-4.1") are two models working together.
		if (value === null || record.editor_model || record.model.includes(" + ")) return [];
		return [{
			benchmarkId: "aider-polyglot",
			label: record.model,
			effort: record.reasoning_effort || undefined,
			harness: record.edit_format ? `aider (${record.edit_format})` : undefined,
			value,
			durationSeconds: parseNumber(record.seconds_per_case) ?? undefined,
			observedOn: record.date || undefined,
		}];
	});
}

export const aider: BenchmarkSource = {
	id: "aider",
	name: "Aider polyglot leaderboard",
	publisher: "Aider (Paul Gauthier)",
	url: PAGE,
	attribution: "Aider LLM leaderboards (aider.chat)",
	minRows: 40,
	benchmarks: [
		{ id: "aider-polyglot", name: "Aider Polyglot", url: PAGE, category: "code", type: "percentage", higherIsBetter: true, unit: "%", description: "The model edits code through aider to solve 225 hard Exercism exercises in C++, Go, Java, JavaScript, Python and Rust, with one retry after seeing test failures. Share of exercises passing their tests after the second attempt." },
	],
	async fetch(ctx) {
		return parseAider(await ctx.fetchText(DATA));
	},
};
