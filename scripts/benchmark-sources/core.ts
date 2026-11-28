import { createHash } from "node:crypto";
import type { ModelMatcher } from "./match";
import type { BenchmarkSource, SourceObservation } from "./types";

export type ResultRow = {
	result_id: string;
	model_slug: string;
	benchmark_id: string;
	score: string;
	score_numeric: number;
	is_self_reported: false;
	other_info: string | null;
	source_link: string;
	rank: number;
	occur_idx: number;
	variant: string | null;
	result_key: string;
	source_id: string;
	source_model_label: string;
	effort: string | null;
	harness: string | null;
	config: string | null;
	ci_low: number | null;
	ci_high: number | null;
	cost_usd: number | null;
	duration_seconds: number | null;
	output_tokens: number | null;
	observed_on: string | null;
	effective_to: null;
	updated_at: string;
};

export type BuildReport = {
	sourceId: string;
	observations: number;
	rows: number;
	matchedLabels: number;
	ignoredLabels: number;
	unmatched: Array<{ label: string; rows: number; candidates: string[] }>;
	unknownBenchmarks: string[];
};

/** A benchmark whose stored rows a run keeps because the board returned too few for it. */
export type ProtectedBenchmark = { benchmarkId: string; stored: number; incoming: number; reason: string };

export function stableUuid(value: string) {
	const hash = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
	hash[12] = "4";
	hash[16] = ((Number.parseInt(hash[16], 16) & 0x3) | 0x8).toString(16);
	const text = hash.join("");
	return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`;
}

const EFFORT_LABELS: Record<string, string> = { none: "No reasoning", minimal: "Minimal", low: "Low", medium: "Medium", high: "High", xhigh: "Extra high", max: "Max" };

export function effortLabel(effort: string | null): string | null {
	if (!effort) return null;
	return EFFORT_LABELS[effort] ?? effort.charAt(0).toUpperCase() + effort.slice(1);
}

function formatScore(value: number): string {
	return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
}

function finite(value: number | undefined): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** The label a result shows next to the model: effort, then the publisher's configuration. */
export function variantLabel(effort: string | null, config: string | null): string | null {
	return [effortLabel(effort), config].filter(Boolean).join(", ") || null;
}

/**
 * Observations → result rows. One row per benchmark × model × effort × harness × config; when a board lists the same one twice,
 * the better score wins. Ranks are competition ranks (ties share a rank) within each benchmark.
 */
export function buildRows(source: BenchmarkSource, observations: SourceObservation[], matcher: ModelMatcher, updatedAt: string): { rows: ResultRow[]; report: BuildReport } {
	const definitions = new Map(source.benchmarks.map((benchmark) => [benchmark.id, benchmark]));
	const unknownBenchmarks = new Set<string>();
	const unmatched = new Map<string, { rows: number; candidates: string[] }>();
	const matchedLabels = new Set<string>();
	const ignoredLabels = new Set<string>();
	const best = new Map<string, { observation: SourceObservation; modelSlug: string; effort: string | null }>();
	const configOf = (observation: SourceObservation) => observation.config?.trim() || null;

	for (const observation of observations) {
		const definition = definitions.get(observation.benchmarkId);
		if (!definition) { unknownBenchmarks.add(observation.benchmarkId); continue; }
		if (!Number.isFinite(observation.value)) continue;
		const match = matcher.match(source.id, observation.label, observation.effort ?? null);
		if (match.kind === "ignored") { ignoredLabels.add(observation.label); continue; }
		if (match.kind === "unmatched") {
			const entry = unmatched.get(observation.label) ?? { rows: 0, candidates: match.candidates };
			entry.rows += 1;
			unmatched.set(observation.label, entry);
			continue;
		}
		matchedLabels.add(observation.label);
		const harness = observation.harness?.trim() || null;
		const key = [observation.benchmarkId, match.modelSlug, match.effort ?? "", harness ?? "", configOf(observation) ?? ""].join("\u0000");
		const current = best.get(key);
		const better = !current || (definition.higherIsBetter ? observation.value > current.observation.value : observation.value < current.observation.value);
		if (better) best.set(key, { observation, modelSlug: match.modelSlug, effort: match.effort });
	}

	const rows: ResultRow[] = [];
	for (const definition of source.benchmarks) {
		const entries = [...best.values()].filter(({ observation }) => observation.benchmarkId === definition.id);
		entries.sort((a, b) => (definition.higherIsBetter ? b.observation.value - a.observation.value : a.observation.value - b.observation.value) || a.modelSlug.localeCompare(b.modelSlug));
		let rank = 0;
		let previous: number | null = null;
		entries.forEach(({ observation, modelSlug, effort }, index) => {
			if (previous === null || observation.value !== previous) rank = index + 1;
			previous = observation.value;
			const harness = observation.harness?.trim() || null;
			const config = configOf(observation);
			// Rows without a config keep the key (and so the result id) they had before config existed.
			const resultKey = `${source.id}:${definition.id}:${modelSlug}:${effort ?? ""}:${harness ?? ""}${config ? `:${config}` : ""}`;
			const details = [`${source.publisher} lists this as "${observation.label}"`, harness ? `harness: ${harness}` : null, config ? `configuration: ${config}` : null, observation.note ?? null].filter(Boolean).join("; ");
			rows.push({
				result_id: stableUuid(`benchmark-source:${resultKey}`),
				model_slug: modelSlug,
				benchmark_id: definition.id,
				score: formatScore(observation.value),
				score_numeric: observation.value,
				is_self_reported: false,
				other_info: details,
				source_link: observation.url ?? definition.url,
				rank,
				occur_idx: index,
				variant: variantLabel(effort, config),
				result_key: resultKey,
				source_id: source.id,
				source_model_label: observation.label,
				effort,
				harness,
				config,
				ci_low: finite(observation.ciLow),
				ci_high: finite(observation.ciHigh),
				cost_usd: finite(observation.costUsd),
				duration_seconds: finite(observation.durationSeconds),
				output_tokens: finite(observation.outputTokens),
				observed_on: observation.observedOn ?? null,
				effective_to: null,
				updated_at: updatedAt,
			});
		});
	}

	return {
		rows,
		report: {
			sourceId: source.id,
			observations: observations.length,
			rows: rows.length,
			matchedLabels: matchedLabels.size,
			ignoredLabels: ignoredLabels.size,
			unmatched: [...unmatched].map(([label, entry]) => ({ label, ...entry })).sort((a, b) => b.rows - a.rows || a.label.localeCompare(b.label)),
			unknownBenchmarks: [...unknownBenchmarks],
		},
	};
}

/**
 * Whether a run may replace what is stored. A board that suddenly returns far fewer rows has usually changed its
 * format, so the stored rows stay until someone looks.
 */
export function refusalReason(source: BenchmarkSource, observations: number, newRows: number, storedRows: number): string | null {
	if (observations < source.minRows) return `returned ${observations} rows, fewer than the ${source.minRows} a healthy run has`;
	if (storedRows >= 20 && newRows < storedRows * 0.5) return `would replace ${storedRows} stored results with ${newRows}`;
	return null;
}

/**
 * Benchmarks whose stored rows a run must keep. Source-wide totals can look healthy while one board comes back empty
 * (one ARC version changes format while the others are fine), so each benchmark is checked on its own: one that has
 * stored results and now gets none, or fewer than half as many, keeps its stored rows and is reported instead.
 */
export function protectedBenchmarks(rows: Array<{ benchmark_id: string }>, stored: Array<{ benchmark_id: string }>): ProtectedBenchmark[] {
	const count = (list: Array<{ benchmark_id: string }>) => list.reduce((counts, row) => counts.set(row.benchmark_id, (counts.get(row.benchmark_id) ?? 0) + 1), new Map<string, number>());
	const incoming = count(rows);
	return [...count(stored)].flatMap(([benchmarkId, storedCount]) => {
		const incomingCount = incoming.get(benchmarkId) ?? 0;
		if (incomingCount === 0) return [{ benchmarkId, stored: storedCount, incoming: 0, reason: `returned no results; kept ${storedCount} stored` }];
		if (incomingCount < storedCount * 0.5) return [{ benchmarkId, stored: storedCount, incoming: incomingCount, reason: `returned ${incomingCount} results, under half of ${storedCount} stored; kept them` }];
		return [];
	}).sort((a, b) => a.benchmarkId.localeCompare(b.benchmarkId));
}

/**
 * Whether a write run may go ahead. Protected benchmarks keep their stored rows, so they stay out of the source-wide
 * replacement check; a run where every stored board is protected has nothing to replace and is refused, so its
 * archive can't replace a good one from earlier that day.
 */
export function runDecision(source: BenchmarkSource, observations: number, rows: Array<{ benchmark_id: string }>, stored: Array<{ benchmark_id: string }>) {
	const warnings = protectedBenchmarks(rows, stored);
	const kept = new Set(warnings.map((warning) => warning.benchmarkId));
	const replacing = rows.filter((row) => !kept.has(row.benchmark_id)).length;
	const refusal = refusalReason(source, observations, replacing, stored.filter((row) => !kept.has(row.benchmark_id)).length)
		?? (kept.size && !replacing ? "every benchmark returned too few results; kept all stored results" : null);
	return { warnings, kept, refusal };
}
