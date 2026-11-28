import { parseCsv, parseNumber } from "../parse";
import { withClaudePrefix } from "./labels";
import type { BenchmarkDefinition, BenchmarkSource, SourceObservation } from "../types";

const PAGE = "https://kodasdream.github.io/gamefeel-benchmark/";
const VERSIONS_FILE = `${PAGE}data/versions.json`;

type Version = { id: string; date?: string; csv: string; is_latest?: boolean };
type VersionsFile = { latest?: string; versions: Version[] };

/** Each scoring standard rescales the board, so every version is its own benchmark: "v1.5.2" → "gamefeel-v1-5-2". */
export function gamefeelIds(version: string) {
	const suffix = version.toLowerCase().replace(/^v?/, "v").replace(/\./g, "-");
	return { overall: `gamefeel-${suffix}`, re: `gamefeel-re-${suffix}` };
}

/** One version's CSV: Overall (`avg`) and the reverse-evaluation score (`re_combined`), one row per model and effort. */
export function parseGamefeel(version: string, csv: string, observedOn?: string): SourceObservation[] {
	const rows = parseCsv(csv);
	if (!rows.length || !("model" in rows[0]) || !("avg" in rows[0])) throw new Error(`GameFeel ${version} format changed: expected model and avg columns.`);
	const ids = gamefeelIds(version);
	return rows.flatMap((row): SourceObservation[] => {
		if (!row.model) return [];
		const common = {
			label: withClaudePrefix(row.model),
			effort: row.effort ? row.effort.toLowerCase() : undefined,
			costUsd: parseNumber(row.price_per_task_usd) ?? undefined,
			durationSeconds: (parseNumber(row.minutes_per_task) ?? NaN) * 60 || undefined,
			observedOn,
		};
		const out: SourceObservation[] = [];
		const overall = parseNumber(row.avg);
		if (overall !== null) out.push({ ...common, benchmarkId: ids.overall, value: overall });
		const re = parseNumber(row.re_combined);
		if (re !== null) out.push({ ...common, benchmarkId: ids.re, value: re });
		return out;
	});
}

const KNOWN = ["v1.2", "v1.3", "v1.4", "v1.5", "v1.5.1", "v1.5.2"];
// v1.2 predates the reverse-evaluation section.
const WITH_RE = new Set(KNOWN.slice(1));

function definitions(): BenchmarkDefinition[] {
	return KNOWN.flatMap((version) => {
		const ids = gamefeelIds(version);
		const overall: BenchmarkDefinition = {
			id: ids.overall,
			name: `GameFeel Benchmark ${version}`,
			url: PAGE,
			category: "creative",
			type: "numerical",
			higherIsBetter: true,
			unit: "score",
			description: `Each model adds items, mechanics and balance changes of its own choosing to unpublished game projects. Overall score out of 100 under scoring standard ${version}: the mean of the subcategories (creating, bug fixing, gamefeel, ideas, visuals, audio${WITH_RE.has(version) ? " and reverse evaluation" : ""}), with price and minutes per task.`,
		};
		if (!WITH_RE.has(version)) return [overall];
		return [overall, {
			id: ids.re,
			name: `GameFeel Reverse Evaluation ${version}`,
			url: PAGE,
			category: "creative",
			type: "numerical",
			higherIsBetter: true,
			unit: "score",
			description: `The model gives feedback on game proposals, especially on balance. The board's combined reverse-evaluation score under scoring standard ${version}.`,
		}];
	});
}

export const gamefeel: BenchmarkSource = {
	id: "gamefeel",
	name: "GameFeel Benchmark",
	publisher: "kodasdream",
	url: PAGE,
	attribution: "The GameFeel Benchmark by kodasdream (github.com/kodasdream/gamefeel-benchmark)",
	minRows: 230,
	benchmarks: definitions(),
	async fetch(ctx) {
		const index = await ctx.fetchJson<VersionsFile>(VERSIONS_FILE);
		if (!Array.isArray(index?.versions) || !index.versions.length) throw new Error("GameFeel format changed: expected versions[] in versions.json.");
		const files = await Promise.all(index.versions.map((version) => ctx.fetchText(new URL(version.csv, PAGE).toString())));
		// A new standard shows up as an unknown benchmark in the run report until it is added to KNOWN.
		return index.versions.flatMap((version, position) => parseGamefeel(version.id, files[position], version.date));
	},
};
