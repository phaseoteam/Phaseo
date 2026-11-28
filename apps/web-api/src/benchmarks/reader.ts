/**
 * Compact payloads for the benchmarks index and the model page's benchmark section. Both are
 * aggregated or ranked in the database (get_benchmark_directory, get_model_benchmark_profile);
 * these mappers only rename columns and drop empty fields so the payload stays small.
 */

export type BenchmarkDirectoryEntry = {
	id: string;
	name: string;
	category?: string;
	unit?: string;
	type?: string;
	higherIsBetter: boolean;
	sourceId?: string;
	sourceName?: string;
	publisher?: string;
	models: number;
	results: number;
	independent: number;
	/** The source's last successful sync, else the newest observation or edit. */
	updatedAt?: string;
};

export type ModelBenchmarkProfileRow = {
	id: string;
	benchmarkId: string;
	benchmarkName: string;
	category?: string;
	unit?: string;
	type?: string;
	higherIsBetter: boolean;
	/** In the benchmark's own scale; percentages are points (0–100). */
	score?: number;
	scoreText?: string;
	selfReported: boolean;
	sourceId?: string;
	sourceName?: string;
	publisher?: string;
	attribution?: string;
	sourceUrl?: string;
	effort?: string;
	harness?: string;
	config?: string;
	variant?: string;
	note?: string;
	link?: string;
	ciLow?: number;
	ciHigh?: number;
	costUsd?: number;
	durationSeconds?: number;
	outputTokens?: number;
	observedOn?: string;
	updatedAt?: string;
	rank?: number;
	rankedModels?: number;
};

type Row = Record<string, unknown>;

function text(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed ? trimmed : undefined;
}

function number(value: unknown): number | undefined {
	if (value == null || value === "") return undefined;
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function date(value: unknown): string | undefined {
	const raw = text(value);
	if (!raw) return undefined;
	const parsed = new Date(raw);
	return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function compact<T extends Record<string, unknown>>(value: T): T {
	return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

export function mapDirectoryRows(rows: Row[]): BenchmarkDirectoryEntry[] {
	return rows.flatMap((row) => {
		const id = text(row.benchmark_id);
		const models = number(row.model_count) ?? 0;
		if (!id || models <= 0) return [];
		return [compact({
			id,
			name: text(row.name) ?? id,
			category: text(row.category),
			unit: text(row.unit),
			type: text(row.benchmark_type),
			higherIsBetter: row.higher_is_better !== false,
			sourceId: text(row.source_id),
			sourceName: text(row.source_name),
			publisher: text(row.source_publisher),
			models,
			results: number(row.result_count) ?? models,
			independent: number(row.independent_count) ?? 0,
			updatedAt: date(row.source_last_success_at) ?? date(row.latest_observed_on) ?? date(row.latest_updated_at),
		})];
	});
}

export function mapProfileRows(rows: Row[]): ModelBenchmarkProfileRow[] {
	return rows.flatMap((row) => {
		const id = text(row.result_id);
		const benchmarkId = text(row.benchmark_id);
		if (!id || !benchmarkId) return [];
		return [compact({
			id,
			benchmarkId,
			benchmarkName: text(row.benchmark_name) ?? benchmarkId,
			category: text(row.category),
			unit: text(row.unit),
			// A curated "76%" on a benchmark without type metadata is still a percentage.
			type: text(row.benchmark_type) ?? (text(row.score)?.includes("%") ? "percentage" : undefined),
			higherIsBetter: row.higher_is_better !== false,
			score: number(row.comparable_score),
			scoreText: text(row.score),
			selfReported: row.is_self_reported === true,
			sourceId: text(row.source_id),
			sourceName: text(row.source_name),
			publisher: text(row.source_publisher),
			attribution: text(row.source_attribution),
			sourceUrl: text(row.source_url),
			effort: text(row.effort),
			harness: text(row.harness),
			config: text(row.config),
			variant: text(row.variant),
			// Scraped rows carry their configuration and attribution in other_info, already shown as columns.
			note: row.source_id ? undefined : text(row.other_info),
			link: text(row.source_link),
			ciLow: number(row.ci_low),
			ciHigh: number(row.ci_high),
			costUsd: number(row.cost_usd),
			durationSeconds: number(row.duration_seconds),
			outputTokens: number(row.output_tokens),
			observedOn: text(row.observed_on),
			updatedAt: date(row.updated_at),
			rank: number(row.model_rank),
			rankedModels: number(row.ranked_models),
		})];
	});
}
