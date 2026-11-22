import { parseCsv, parseNumber } from "../parse";
import type { BenchmarkSource, SourceObservation } from "../types";

/**
 * LiveBench 2.0 publishes each release as `data/<YYYYMMDD>/table.csv` (one column per suite) plus `categories.json`
 * (suites per category and `_overall_weights`). The page computes Overall in the browser as the weighted mean of the
 * category averages, so this source does the same. The release list lives in the app bundle.
 */
const ORIGIN = "https://livebench.ai";

/** The newest LiveBench 2.0 release id in the app bundle: the last entry of the YYYYMMDD release array. */
export function latestRelease(bundle: string): string {
	const arrays = [...bundle.matchAll(/\[("20\d{6}"(?:,"20\d{6}")*)\]/g)];
	const releases = arrays.flatMap((match) => JSON.parse(`[${match[1]}]`) as string[]).sort();
	if (!releases.length) throw new Error("LiveBench format changed: no release list in the bundle.");
	return releases[releases.length - 1];
}

type Categories = Record<string, string[] | Record<string, number>>;

export function parseLivebench(csv: string, categories: Categories, release: string): SourceObservation[] {
	const { _overall_weights: rawWeights, ...groups } = categories;
	const weights = (rawWeights ?? {}) as Record<string, number>;
	const suites = Object.entries(groups) as Array<[string, string[]]>;
	if (!suites.length || suites.some(([, columns]) => !Array.isArray(columns))) throw new Error("LiveBench format changed: expected category → suite lists.");
	const observedOn = `${release.slice(0, 4)}-${release.slice(4, 6)}-${release.slice(6, 8)}`;
	return parseCsv(csv).flatMap((row) => {
		let total = 0;
		let weightSum = 0;
		for (const [category, columns] of suites) {
			const scores = columns.map((column) => parseNumber(row[column])).filter((value): value is number => value !== null);
			if (!scores.length) continue;
			const weight = Number(weights[category] ?? 1);
			if (!(weight > 0)) continue;
			total += (scores.reduce((sum, value) => sum + value, 0) / scores.length) * weight;
			weightSum += weight;
		}
		if (!row.model || weightSum === 0) return [];
		return [{ benchmarkId: "livebench-2", label: row.model, value: total / weightSum, observedOn, url: `${ORIGIN}/` }];
	});
}

export const livebench: BenchmarkSource = {
	id: "livebench",
	name: "LiveBench",
	publisher: "LiveBench",
	url: ORIGIN,
	attribution: "LiveBench (livebench.ai)",
	minRows: 24,
	benchmarks: [
		{ id: "livebench-2", name: "LiveBench 2.0", url: `${ORIGIN}/`, category: "general", type: "numerical", unit: "points", higherIsBetter: true, description: "A regularly refreshed set of objectively graded tasks in long agentic work, reasoning, coding, browsing, data analysis, research and design. Overall: weighted mean of the category scores for the latest release." },
	],
	async fetch(ctx) {
		const page = await ctx.fetchText(`${ORIGIN}/`);
		const script = page.match(/src="\.?\/?(static\/js\/main\.[a-z0-9]+\.js)"/)?.[1];
		if (!script) throw new Error("LiveBench format changed: no main bundle on the page.");
		const release = latestRelease(await ctx.fetchText(`${ORIGIN}/${script}`));
		const [csv, categories] = await Promise.all([
			ctx.fetchText(`${ORIGIN}/data/${release}/table.csv`),
			ctx.fetchJson<Categories>(`${ORIGIN}/data/${release}/categories.json`),
		]);
		return parseLivebench(csv, categories, release);
	},
};
