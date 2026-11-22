import { parseCsv, parseNumber } from "../parse";
import { withClaudePrefix } from "./labels";
import type { BenchmarkSource, SourceObservation } from "../types";

const SITE = "https://llm2014.github.io/llm_benchmark/";
const MANIFEST = `${SITE}data/datasets.json`;

type Dataset = { category: string; reportDate: string; tableIndex: number; csv: string };

// Column names on the logic board: model, best ("limit") score, median score, average seconds.
const MODEL = "模型";
const BEST = "极限分数";
const MEDIAN = "中位分数";
const SECONDS = "平均耗时(秒)";

/** The newest monthly table ("月榜", table 0) for a category. */
export function latestDataset(datasets: Dataset[], category: string): Dataset {
	const monthly = datasets.filter((dataset) => dataset.category === category && dataset.tableIndex === 0);
	const latest = monthly.sort((a, b) => b.reportDate.localeCompare(a.reportDate))[0];
	if (!latest) throw new Error(`llm2014: no monthly ${category} table in datasets.json.`);
	return latest;
}

export function parseLlm2014Logic(csv: string, reportDate: string): SourceObservation[] {
	const rows = parseCsv(csv);
	if (!rows.length || !(MODEL in rows[0]) || !(BEST in rows[0])) throw new Error("llm2014 logic format changed: expected 模型 and 极限分数 columns.");
	return rows.flatMap((row): SourceObservation[] => {
		const value = parseNumber(row[BEST]);
		if (value === null || !row[MODEL]) return [];
		// "Opus 5.5 (xhigh ~Estimated)": the author marks estimated rows inside the effort bracket.
		const estimated = /~\s*estimated/i.test(row[MODEL]);
		const label = row[MODEL].replace(/\s*~\s*estimated/i, "").replace(/\(\s*\)/, "").trim();
		const median = parseNumber(row[MEDIAN]);
		return [{
			benchmarkId: "llm2014-logic",
			label: withClaudePrefix(label),
			value,
			durationSeconds: parseNumber(row[SECONDS]) ?? undefined,
			note: [median !== null ? `median ${median}` : null, estimated ? "estimated by the author" : null].filter(Boolean).join(", ") || undefined,
			observedOn: `${reportDate}-01`,
		}];
	});
}

export const llm2014: BenchmarkSource = {
	id: "llm2014",
	name: "llm2014 LLM benchmark",
	publisher: "llm2014",
	url: SITE,
	attribution: "llm_benchmark by llm2014 (llm2014.github.io/llm_benchmark)",
	minRows: 24,
	benchmarks: [
		{
			id: "llm2014-logic",
			name: "llm2014 Logic",
			url: SITE,
			category: "reasoning",
			type: "numerical",
			higherIsBetter: true,
			unit: "score",
			description: "A personal, private question set of up to 28 logic, maths, programming and intuition problems, refreshed monthly; answers need correct reasoning and must follow the format exactly. Each question is run three times and its best result counts (the board's 极限分数, \"limit score\"), with the median score in each row's note.",
		},
	],
	async fetch(ctx) {
		const manifest = await ctx.fetchJson<{ datasets: Dataset[] }>(MANIFEST);
		if (!Array.isArray(manifest?.datasets)) throw new Error("llm2014 format changed: expected datasets[] in datasets.json.");
		const latest = latestDataset(manifest.datasets, "logic");
		return parseLlm2014Logic(await ctx.fetchText(new URL(latest.csv, SITE).toString()), latest.reportDate);
	},
};
