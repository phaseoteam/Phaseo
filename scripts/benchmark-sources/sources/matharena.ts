import { htmlText, jsonAfter, parseNumber } from "../parse";
import type { BenchmarkDefinition, BenchmarkSource, SourceObservation } from "../types";

const SITE = "https://matharena.ai";

type Competition = { comp: string | RegExp; definition: BenchmarkDefinition };

function board(id: string, name: string, comp: string, description: string): BenchmarkDefinition {
	return { id, name, url: `${SITE}/?comp=${comp}`, category: "math", type: "percentage", higherIsBetter: true, unit: "%", description };
}

const COMPETITIONS: Competition[] = [
	{ comp: "apex--apex_2025", definition: board("matharena-apex", "MathArena Apex", "apex--apex_2025", "Final-answer competition problems that earlier frontier models failed to solve. Accuracy over repeated attempts, with a 95% interval.") },
	{ comp: "apex--shortlist_2025", definition: board("matharenaapex-shortlist", "MathArena Apex Shortlist", "apex--shortlist_2025", "The shortlist of hard final-answer problems from 2025 competitions that the Apex set was chosen from. Accuracy over repeated attempts, with a 95% interval.") },
	{ comp: "overall--arxivmath", definition: board("matharena-arxivmath", "MathArena ArXivMath", "overall--arxivmath", "Research-level problems with a checkable final answer, taken from recent arXiv papers. Accuracy across MathArena's monthly ArXivMath sets, with a 95% interval.") },
	{ comp: "overall--brokenarxiv", definition: board("matharena-brokenarxiv", "MathArena BrokenArXiv", "overall--brokenarxiv", "Plausible but false statements adapted from recent arXiv papers; the model is scored on recognising that the statement is false. Accuracy across MathArena's monthly sets, with a 95% interval.") },
	{ comp: /^arxivlean--/, definition: { ...board("matharena-arxivlean", "MathArena ArXivLean", "", "Statements from recent arXiv papers formalised in Lean, which the model has to prove. Accuracy on MathArena's latest ArXivLean set, with a 95% interval."), url: `${SITE}/` } },
	{ comp: "hmmt--hmmt_feb_2026", definition: board("hmmt-feb-2026-matharena", "HMMT February 2026 (MathArena run)", "hmmt--hmmt_feb_2026", "Final-answer problems from the February 2026 Harvard-MIT Mathematics Tournament. Accuracy over repeated attempts, run by MathArena, with a 95% interval.") },
	{ comp: "aime--aime_2026", definition: board("aime-2026-matharena", "AIME 2026 (MathArena run)", "aime--aime_2026", "The 2026 American Invitational Mathematics Examination problems, each with an integer answer. Accuracy over repeated attempts, run by MathArena, with a 95% interval.") },
	{ comp: "usamo--usamo_2026", definition: board("usamo-2026-matharena", "USAMO 2026 (MathArena run)", "usamo--usamo_2026", "Proof problems from the 2026 USA Mathematical Olympiad. Share of points awarded by MathArena's graders over repeated attempts, with a 95% interval.") },
];

const OVERALL: BenchmarkDefinition = {
	id: "matharena",
	name: "MathArena",
	url: `${SITE}/`,
	category: "math",
	type: "percentage",
	higherIsBetter: true,
	unit: "%",
	description: "MathArena's overall estimate of the share of problems a model would solve across the competitions it runs, from its results on each.",
};

const modelName = (html: string) => htmlText(html.replace(/<span class="contamination-warning"[\s\S]*?<\/span>/g, ""));

/** One competition's table, as `competition_tables/<comp>` returns it: `{ table: "<table>…" }`. */
export function parseMathArenaTable(json: { table?: string }, benchmarkId: string): SourceObservation[] {
	if (typeof json?.table !== "string") throw new Error(`MathArena ${benchmarkId} format changed: expected table HTML.`);
	return [...json.table.matchAll(/<tr class="model-row"[\s\S]*?<\/tr>/g)].flatMap(([row]) => {
		const name = row.match(/<td class="model-name">([\s\S]*?)<\/td>/)?.[1];
		const accuracy = row.match(/metric-bar-cell--accuracy[^"]*"[^>]*data-predicted="(\w+)"[^>]*>([\s\S]*?)<\/td>/);
		if (!name || !accuracy || accuracy[1] !== "no") return [];
		const [value, half] = (htmlText(accuracy[2]).match(/-?[\d.]+(?=%)/g) ?? []).map(Number);
		if (!Number.isFinite(value)) return [];
		const cost = row.match(/metric-bar-cell--cost[^>]*>([\s\S]*?)<\/td>/)?.[1];
		const tokens = row.match(/metric-bar-cell--tokens[^>]*>([\s\S]*?)<\/td>/)?.[1];
		const contaminated = row.includes("contamination-warning");
		return [{
			benchmarkId,
			label: modelName(name),
			value,
			ciLow: Number.isFinite(half) ? Math.max(0, value - half) : undefined,
			ciHigh: Number.isFinite(half) ? Math.min(100, value + half) : undefined,
			costUsd: cost ? parseNumber(htmlText(cost)) ?? undefined : undefined,
			outputTokens: tokens ? parseNumber(htmlText(tokens)) ?? undefined : undefined,
			note: contaminated ? "Released after the competition, so the problems may be in its training data" : undefined,
		}];
	});
}

type ReleasePoint = { name: string; capability: number; expected_cost?: number | null; release_date?: string };

/** The home page's `const releasePoints = [...]`: MathArena's overall estimate per model. */
export function parseMathArenaOverall(html: string): SourceObservation[] {
	const points = jsonAfter<ReleasePoint[]>(html, "const releasePoints =");
	return points.flatMap((point) => (point.name && Number.isFinite(point.capability) ? [{
		benchmarkId: OVERALL.id,
		label: point.name,
		value: point.capability,
		costUsd: typeof point.expected_cost === "number" ? point.expected_cost : undefined,
	}] : []));
}

/** The latest competition matching `pattern`: the home page lists each family's sets oldest first. */
export function latestCompetition(html: string, pattern: RegExp): string | undefined {
	const prefix = pattern.source.replace(/^\^/, "");
	return [...html.matchAll(new RegExp(`${prefix}[a-z0-9_]+`, "g"))].map((match) => match[0]).at(-1);
}

export const mathArena: BenchmarkSource = {
	id: "matharena-apex",
	name: "MathArena",
	publisher: "MathArena (SRI Lab, ETH Zurich)",
	url: `${SITE}/`,
	attribution: "MathArena (matharena.ai)",
	minRows: 185,
	benchmarks: [OVERALL, ...COMPETITIONS.map((competition) => competition.definition)],
	async fetch(ctx) {
		const home = await ctx.fetchText(`${SITE}/`);
		const observations = parseMathArenaOverall(home);
		for (const competition of COMPETITIONS) {
			const comp = typeof competition.comp === "string" ? competition.comp : latestCompetition(home, competition.comp);
			if (!comp) throw new Error(`MathArena home page lists no ${competition.definition.name} set.`);
			const table = await ctx.fetchJson<{ table?: string }>(`${SITE}/competition_tables/${encodeURIComponent(comp)}`);
			observations.push(...parseMathArenaTable(table, competition.definition.id).map((row) => ({ ...row, url: `${SITE}/?comp=${comp}` })));
		}
		return observations;
	},
};
