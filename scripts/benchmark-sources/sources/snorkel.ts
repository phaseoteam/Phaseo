import { parseNumber } from "../parse";
import type { BenchmarkSource, SourceObservation } from "../types";

const PAGE = "https://snorkel.ai/leaderboard/agents-last-exam/";
const DATA = "https://snorkel.ai/benchmark-data/ale_leaderboard-v1-1.json";

type EffortRow = { effort?: string; pass_rate_pct?: number | null; score_pct?: number | null; total_runtime?: string | null; total_output_tokens?: string | null; est_cost?: number | null };
type Row = EffortRow & { model?: string; harness?: string; best_effort?: string; efforts?: EffortRow[] };
type AleFile = { as_of?: string; version?: string; splits?: Array<{ key: string; label?: string; rows?: Row[] }> };

/** "29h 7m" → seconds. */
export function runtimeSeconds(value: string | null | undefined): number | undefined {
	const match = value?.match(/^(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?$/);
	if (!match || !match.slice(1).some(Boolean)) return undefined;
	return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

/** "2.6M", "850.3K" → tokens. */
export function tokenCount(value: string | null | undefined): number | undefined {
	const match = value?.trim().match(/^([\d.]+)\s*([KMB])?$/i);
	if (!match) return undefined;
	const scale = { K: 1e3, M: 1e6, B: 1e9 }[(match[2] ?? "").toUpperCase() as "K" | "M" | "B"] ?? 1;
	return Math.round(Number(match[1]) * scale);
}

/** Agents' Last Exam v1.1: one row per model × harness, each with the effort settings Snorkel ran. */
export function parseAle(file: AleFile): SourceObservation[] {
	const split = file?.splits?.find((entry) => entry.key === "v1_1");
	if (!split || !Array.isArray(split.rows)) throw new Error("Agents' Last Exam format changed: expected splits[v1_1].rows.");
	const observedOn = file.as_of?.slice(0, 10);
	return split.rows.flatMap((row) => {
		if (!row.model) return [];
		// † marks runs by external teams and ‡ a run that excludes downgraded tasks; both are notes, not part of the name.
		const label = row.model.replace(/[†‡*]/g, "").trim();
		const notes = [/†/.test(row.model) ? "Evaluated by an external team" : null, /‡/.test(row.model) ? "Excludes downgraded tasks" : null].filter(Boolean).join("; ") || undefined;
		const efforts = row.efforts?.length ? row.efforts : [{ ...row, effort: row.best_effort }];
		return efforts.flatMap((entry) => {
			const common = {
				label,
				effort: entry.effort?.trim().toLowerCase() || undefined,
				harness: row.harness?.trim() || undefined,
				costUsd: parseNumber(entry.est_cost) ?? undefined,
				durationSeconds: runtimeSeconds(entry.total_runtime),
				outputTokens: tokenCount(entry.total_output_tokens),
				observedOn,
				note: notes,
			};
			const pass = parseNumber(entry.pass_rate_pct);
			const score = parseNumber(entry.score_pct);
			return [
				...(pass !== null ? [{ ...common, benchmarkId: "agents-last-exam-v1-1", value: pass }] : []),
				...(score !== null ? [{ ...common, benchmarkId: "agents-last-exam-v1-1-score", value: score }] : []),
			];
		});
	});
}

export const snorkelAle: BenchmarkSource = {
	id: "snorkel-ale",
	name: "Agents' Last Exam",
	publisher: "Snorkel AI",
	url: PAGE,
	attribution: "Agents' Last Exam by Snorkel AI (snorkel.ai)",
	minRows: 50,
	benchmarks: [
		{ id: "agents-last-exam-v1-1", name: "Agents' Last Exam v1.1", url: PAGE, category: "agents", type: "percentage", higherIsBetter: true, unit: "%", description: "AI agents do 122 public tasks of long-horizon, economically valuable professional work in their own harness, graded against hidden references. Pass rate: share of tasks passed." },
		{ id: "agents-last-exam-v1-1-score", name: "Agents' Last Exam v1.1 (score)", url: PAGE, category: "agents", type: "percentage", higherIsBetter: true, unit: "%", description: "Agents' Last Exam v1.1 score: the graded score across the 122 public tasks, which credits partial work, alongside the pass rate." },
	],
	async fetch(ctx) {
		return parseAle(await ctx.fetchJson<AleFile>(DATA));
	},
};
