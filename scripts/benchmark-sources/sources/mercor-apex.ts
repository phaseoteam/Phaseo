import { nextData } from "../parse";
import type { BenchmarkDefinition, BenchmarkSource, SourceObservation } from "../types";

/**
 * Mercor's APEX page ships every leaderboard it runs in `__NEXT_DATA__` (`props.pageProps.benchmarks[]`). Each row has
 * scores per "pass" (Pass@1, Mean Score, Mean@8, …), either directly or per agent harness. The headline is the board's
 * first listed pass, as the page shows it.
 */
const PAGE = "https://www.mercor.com/apex/";

type PassScore = { pass: string; score: number | null; error?: number | null; harnessScores?: Array<{ harness: string; score: number | null; error?: number | null }> | null };
type Row = { model: { modelName: string; effort?: string | null; provider?: { name?: string } | null }; passScores: PassScore[] };
type Board = { benchmarkId: string; availablePasses?: Array<{ value: string }> | null; availableHarnesses?: Array<{ label: string; value: string }> | null; globalLeaderboard: Row[] };
type Page = { props: { pageProps: { benchmarks: Board[] } } };

const EFFORTS = new Set(["none", "minimal", "low", "medium", "high", "xhigh", "max"]);

/** Mercor writes Anthropic's models without the family: "Opus 5.5", "Fable 5.1". */
export function mercorLabel(row: Row): string {
	const name = row.model.modelName.trim();
	return row.model.provider?.name === "Anthropic" && !/^claude\b/i.test(name) ? `Claude ${name}` : name;
}

const BOARDS: Array<BenchmarkDefinition & { mercorId: string; defaultPass: string }> = [
	{ mercorId: "apex-accounting", defaultPass: "mean-score", id: "mercor-apex-accounting", name: "APEX-Accounting", url: "https://www.mercor.com/apex/apex-accounting-leaderboard/", category: "agents", type: "percentage", unit: "%", higherIsBetter: true, description: "An agent completes long professional accounting tasks across accounting software, spreadsheets and PDFs. Mean rubric score with a 95% interval." },
	{ mercorId: "apex-agents", defaultPass: "pass-1", id: "apex-agents", name: "APEX-Agents", url: "https://www.mercor.com/apex/apex-agents-leaderboard/", category: "agents", type: "percentage", unit: "%", higherIsBetter: true, description: "An agent completes multi-hour professional tasks in investment banking, corporate law and management consulting with real tools in Google Workspace. Pass@1 with a 95% interval." },
	{ mercorId: "apex-swe", defaultPass: "pass-1", id: "mercor-apex-swe", name: "APEX-SWE", url: "https://www.mercor.com/apex/apex-swe-leaderboard/", category: "code", type: "percentage", unit: "%", higherIsBetter: true, description: "An agent completes real-world software engineering tasks, from bug fixes to feature builds, in each listed harness. Pass@1 with a 95% interval." },
	{ mercorId: "apex-v1", defaultPass: "mean-score", id: "mercor-apex-v1", name: "APEX-1", url: "https://www.mercor.com/apex/apex-v1-leaderboard/", category: "professional", type: "percentage", unit: "%", higherIsBetter: true, description: "The model answers economically valuable single-turn tasks in investment banking, corporate law, management consulting and medicine, graded against expert rubrics. Mean score with a 95% interval." },
	{ mercorId: "open-world-engineer", defaultPass: "mean-8", id: "owe-bench", name: "OpenWorldEngineer (OWE-Bench)", url: "https://openworldengineer.mercor.com", category: "agents", type: "percentage", unit: "%", higherIsBetter: true, description: "Long-horizon engineering and research projects solved end to end with real compute and scored on held-out inputs: each attempt is scored by how far it moves the project from its baseline toward the task's ceiling. Mean of 8 attempts, with a 95% interval." },
];

export function parseMercorApex(page: Page): SourceObservation[] {
	const boards = page?.props?.pageProps?.benchmarks;
	if (!Array.isArray(boards)) throw new Error("Mercor APEX format changed: expected props.pageProps.benchmarks[].");
	if (!BOARDS.some((definition) => boards.some((candidate) => candidate.benchmarkId === definition.mercorId))) throw new Error("Mercor APEX format changed: none of the known boards is listed.");
	const observations: SourceObservation[] = [];
	for (const definition of BOARDS) {
		// A board Mercor stops listing yields no rows; if it has stored results, the sync keeps them and warns. ACE was
		// withdrawn in November 2026 with no stored results, so it is no longer defined rather than left as an empty board.
		const board = boards.find((candidate) => candidate.benchmarkId === definition.mercorId);
		if (!board) continue;
		const pass = board.availablePasses?.[0]?.value ?? definition.defaultPass;
		const harnessLabels = new Map((board.availableHarnesses ?? []).map((harness) => [harness.value, harness.label]));
		for (const row of board.globalLeaderboard ?? []) {
			const score = row.passScores?.find((candidate) => candidate.pass === pass);
			if (!score) continue;
			const effort = row.model.effort?.toLowerCase().trim();
			const base = { benchmarkId: definition.id, label: mercorLabel(row), effort: effort && EFFORTS.has(effort) ? effort : undefined };
			const entries = score.harnessScores?.length
				? score.harnessScores.map((entry) => ({ value: entry.score, error: entry.error, harness: harnessLabels.get(entry.harness) ?? entry.harness }))
				: [{ value: score.score, error: score.error, harness: undefined }];
			for (const entry of entries) {
				if (typeof entry.value !== "number" || !Number.isFinite(entry.value)) continue;
				const error = typeof entry.error === "number" ? entry.error : null;
				observations.push({ ...base, value: entry.value, harness: entry.harness, ciLow: error !== null ? entry.value - error : undefined, ciHigh: error !== null ? entry.value + error : undefined });
			}
		}
	}
	return observations;
}

export const mercorApex: BenchmarkSource = {
	id: "mercor-apex",
	name: "Mercor APEX leaderboards",
	publisher: "Mercor",
	url: PAGE,
	attribution: "Mercor APEX (mercor.com/apex)",
	minRows: 190,
	benchmarks: BOARDS.map(({ mercorId: _mercorId, defaultPass: _defaultPass, ...definition }) => definition),
	async fetch(ctx) {
		return parseMercorApex(nextData<Page>(await ctx.fetchText(PAGE)));
	},
};
