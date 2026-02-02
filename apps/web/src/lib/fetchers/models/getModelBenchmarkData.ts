import { cacheLife, cacheTag } from "next/cache";

import { createClient } from "@/utils/supabase/client";
import { applyHiddenFilter } from "@/lib/fetchers/models/visibility";

export interface ModelBenchmarkOrganisation {
	organisation_id: string;
	name: string;
	colour: string | null;
}

export interface ModelBenchmarkResult {
	id: string;
	benchmark_id: string;
	score: number | null;
	raw_score: string | number | null;
	score_display: string;
	is_percentage: boolean;
	is_self_reported: boolean;
	other_info: string | null;
	source_link: string | null;
	created_at: string | null;
	updated_at: string | null;
	rank: number | null;
	benchmark: {
		id: string;
		name: string;
		category: string | null;
		link: string | null;
		total_models: number | null;
		max_score: number | null;
		order: string | null;
		ascending_order: boolean | null;
	};
}

export interface ModelBenchmarkHighlight {
	benchmarkId: string;
	benchmarkName: string;
	totalModels: number | null;
	rank: number | null;
	score: number | null;
	scoreDisplay: string;
	isPercentage: boolean;
	isSelfReported: boolean;
	otherInfo: string | null;
	sourceLink: string | null;
}

export interface BenchmarkComparisonScoreDetail {
	score: number | null;
	scoreDisplay: string;
	isPercentage: boolean;
	isSelfReported: boolean;
	otherInfo: string | null;
	sourceLink: string | null;
}

export interface BenchmarkComparisonModel {
	modelId: string;
	modelName: string;
	organisation: ModelBenchmarkOrganisation | null;
	topScore: number | null;
	topScoreDisplay: string;
	isPercentage: boolean;
	isCurrent: boolean;
	rank: number | null;
	scores: BenchmarkComparisonScoreDetail[];
}

export interface BenchmarkComparisonChart {
	benchmarkId: string;
	benchmarkName: string;
	totalModels: number | null;
	isLowerBetter: boolean;
	current: {
		score: number | null;
		scoreDisplay: string;
		rank: number | null;
	};
	models: BenchmarkComparisonModel[];
}

type RawBenchmarkPayload = {
	modelId: string;
	modelName: string;
	organisation: ModelBenchmarkOrganisation | null;
	results: ModelBenchmarkResult[];
};

const rawResultsPromiseCache = new Map<string, Promise<RawBenchmarkPayload>>();

function parseScore(
	value: string | number | null | undefined
): number | null {
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : null;
	}

	if (typeof value === "string") {
		const match = value.match(/[-+]?[0-9]*\.?[0-9]+/);
		if (!match) return null;

		const parsed = Number.parseFloat(match[0]);
		return Number.isFinite(parsed) ? parsed : null;
	}

	return null;
}

function formatScore(
	value: number | null,
	isPercentage: boolean,
	fallback?: string | number | null
): string {
	if (value == null) {
		if (fallback == null) return "-";
		return typeof fallback === "number" ? fallback.toString() : String(fallback);
	}

	const formatted =
		value % 1 === 0 || Math.abs(value) >= 100
			? value.toFixed(0)
			: value.toFixed(2);
	return isPercentage ? `${formatted}%` : formatted;
}

function normalizeMaybeArray<T>(value: T | T[] | null | undefined): T | null {
	if (value == null) return null;
	return Array.isArray(value) ? (value.length ? value[0] : null) : value;
}

async function fetchBenchmarkResultsRaw(
	modelId: string,
	includeHidden: boolean
): Promise<RawBenchmarkPayload> {
	const supabase = await createClient();

	const { data, error } = await applyHiddenFilter(
		supabase.from("data_models").select(
			`
				model_id,
				name,
				hidden,
				organisation: data_organisations (
					organisation_id,
					name,
					colour
				),
				benchmark_results: data_benchmark_results (
					id,
					benchmark_id,
					score,
					is_self_reported,
					other_info,
					source_link,
					created_at,
					updated_at,
					rank,
					benchmark: data_benchmarks (
						id,
						name,
						category,
						link,
						total_models
					)
				)
			`
		),
		includeHidden
	)
		.eq("model_id", modelId)
		.single();

	if (error) {
		throw new Error(
			error.message || `Failed to fetch benchmark results for ${modelId}`
		);
	}

	if (!data) {
		throw new Error(`Model ${modelId} not found`);
	}
	if (!includeHidden && (data as any).hidden) {
		throw new Error(`Model ${modelId} not found`);
	}

	const rawOrganisation = normalizeMaybeArray(
		(data as any).organisation
	);

	const organisation = rawOrganisation
		? {
			organisation_id: rawOrganisation.organisation_id ?? "",
			name: rawOrganisation.name ?? rawOrganisation.organisation_id ?? "",
			colour: rawOrganisation.colour ?? null,
		}
		: null;

	const results: ModelBenchmarkResult[] = (data.benchmark_results ?? [])
		.map((result: any) => {
			const rawScore = result?.score ?? null;
			const numericScore = parseScore(rawScore);
			const isPercentage =
				typeof rawScore === "string" && rawScore.includes("%");

			const benchmark = normalizeMaybeArray(result?.benchmark) ?? {};

			const identifier =
				result.id ??
				result.record_id ??
				result.benchmark_id ??
				`${result.benchmark_id ?? "benchmark"}-${Math.random()
					.toString(36)
					.slice(2)}`;

			return {
				id: String(identifier),
				benchmark_id: result.benchmark_id ?? benchmark.id ?? "",
				score: numericScore,
				raw_score: rawScore,
				score_display: formatScore(numericScore, isPercentage, rawScore),
				is_percentage: isPercentage,
				is_self_reported: Boolean(result.is_self_reported),
				other_info: result.other_info ?? null,
				source_link: result.source_link ?? null,
				created_at: result.created_at ?? null,
				updated_at: result.updated_at ?? null,
				rank: typeof result.rank === "number" ? result.rank : null,
				benchmark: {
					id: benchmark.id ?? result.benchmark_id ?? "",
					name: benchmark.name ?? result.benchmark_id ?? "",
					category: benchmark.category ?? null,
					link: benchmark.link ?? null,
					total_models: benchmark.total_models ?? null,
					max_score: null,
					order: null,
					ascending_order: null,
				},
			} satisfies ModelBenchmarkResult;
		})
		.filter((result: ModelBenchmarkResult) => result.benchmark_id);

	return {
		modelId: data.model_id,
		modelName: data.name,
		organisation,
		results,
	};
}

async function loadBenchmarkResults(
	modelId: string,
	includeHidden: boolean
): Promise<RawBenchmarkPayload> {
	const cacheKey = `${modelId}:${includeHidden ? "1" : "0"}`;
	let promise = rawResultsPromiseCache.get(cacheKey);

	if (!promise) {
		promise = fetchBenchmarkResultsRaw(modelId, includeHidden);
		rawResultsPromiseCache.set(cacheKey, promise);
	}

	return promise;
}

function selectHighlightResults(
	results: ModelBenchmarkResult[]
): ModelBenchmarkHighlight[] {
	const byBenchmark = new Map<string, ModelBenchmarkResult>();

	for (const result of results) {
		const key = result.benchmark_id;
		if (!key) continue;

		const existing = byBenchmark.get(key);
		if (!existing) {
			byBenchmark.set(key, result);
			continue;
		}

		if (existing.rank != null && result.rank != null) {
			if (result.rank < existing.rank) {
				byBenchmark.set(key, result);
				continue;
			}
			if (result.rank > existing.rank) {
				continue;
			}
		} else if (existing.rank == null && result.rank != null) {
			byBenchmark.set(key, result);
			continue;
		}

		if (existing.score != null && result.score != null) {
			const better = result.score > existing.score;
			if (better) {
				byBenchmark.set(key, result);
			}
			continue;
		}

		if (existing.score == null && result.score != null) {
			byBenchmark.set(key, result);
		}
	}

	return Array.from(byBenchmark.values())
		.map<ModelBenchmarkHighlight>((result) => ({
			benchmarkId: result.benchmark_id,
			benchmarkName: result.benchmark.name || result.benchmark_id,
			totalModels: result.benchmark.total_models ?? null,
			rank: result.rank,
			score: result.score,
			scoreDisplay: result.score_display,
			isPercentage: result.is_percentage,
			isSelfReported: result.is_self_reported,
			otherInfo: result.other_info,
			sourceLink: result.source_link,
		}))
		.sort((a, b) => {
			const totalA = a.totalModels ?? -1;
			const totalB = b.totalModels ?? -1;
			if (totalA !== totalB) return totalB - totalA;

			const rankA = a.rank ?? Number.POSITIVE_INFINITY;
			const rankB = b.rank ?? Number.POSITIVE_INFINITY;
			if (rankA !== rankB) return rankA - rankB;

			return a.benchmarkName.localeCompare(b.benchmarkName);
		});
}

function groupResultsByBenchmarkName(
	results: ModelBenchmarkResult[]
): Record<string, ModelBenchmarkResult[]> {
	return results.reduce<Record<string, ModelBenchmarkResult[]>>(
		(acc, result) => {
			const name = result.benchmark.name || result.benchmark_id;
			if (!acc[name]) acc[name] = [];
			acc[name].push(result);
			return acc;
		},
		{}
	);
}

type ComparisonRowOrganisation = {
	organisation_id: string | null;
	name: string | null;
	colour: string | null;
};

type ComparisonRowModel =
	| {
		model_id: string | null;
		name: string | null;
		organisation:
		| ComparisonRowOrganisation
		| ComparisonRowOrganisation[]
		| null;
	}
	| null;

type ComparisonRow = {
	model_id: string | null;
	score: string | number | null;
	is_self_reported: boolean | null;
	other_info: string | null;
	source_link: string | null;
	rank: number | null;
	model: ComparisonRowModel | ComparisonRowModel[];
};

function determineIsLowerBetter(
	models: BenchmarkComparisonModel[]
): boolean {
	const ranked = models
		.map((model) => {
			const firstNumeric = model.scores.find(
				(detail) => typeof detail.score === "number"
			)?.score;

			if (model.rank == null || firstNumeric == null) return null;
			return { rank: model.rank, score: firstNumeric };
		})
		.filter(
			(
				item
			): item is {
				rank: number;
				score: number;
			} => item != null
		)
		.sort((a, b) => a.rank - b.rank);

	if (ranked.length >= 2) {
		return ranked[0].score < ranked[1].score;
	}

	return false;
}

function aggregateComparisonRows(
	rows: ComparisonRow[],
	currentModelId: string
): { models: BenchmarkComparisonModel[]; isLowerBetter: boolean } {
	const map = new Map<string, BenchmarkComparisonModel>();

	for (const row of rows) {
		const modelEntry = normalizeMaybeArray(row.model);
		const rawModelId = modelEntry?.model_id ?? row.model_id ?? "";
		if (!rawModelId) continue;

		const rawOrg = normalizeMaybeArray(modelEntry?.organisation);
		const organisation = rawOrg
			? {
				organisation_id: rawOrg.organisation_id ?? "",
				name: rawOrg.name ?? rawOrg.organisation_id ?? "Unknown",
				colour: rawOrg.colour ?? null,
			}
			: null;

		let entry = map.get(rawModelId);
		if (!entry) {
			entry = {
				modelId: rawModelId,
				modelName: modelEntry?.name ?? rawModelId,
				organisation,
				topScore: null,
				topScoreDisplay: "-",
				isPercentage: false,
				isCurrent: rawModelId === currentModelId,
				rank: typeof row.rank === "number" ? row.rank : null,
				scores: [],
			};
			map.set(rawModelId, entry);
		} else if (typeof row.rank === "number") {
			if (entry.rank == null || row.rank < entry.rank) {
				entry.rank = row.rank;
			}
		}

		const rawScore = row.score;
		const numericScore = parseScore(rawScore);
		const isPercentage =
			typeof rawScore === "string" && rawScore.includes("%");

		entry.scores.push({
			score: numericScore,
			scoreDisplay: formatScore(numericScore, isPercentage, rawScore),
			isPercentage,
			isSelfReported: Boolean(row.is_self_reported),
			otherInfo: row.other_info ?? null,
			sourceLink: row.source_link ?? null,
		});
	}

	const models = Array.from(map.values());
	const isLowerBetter = determineIsLowerBetter(models);

	for (const model of models) {
		const numericScores = model.scores
			.map((detail) => detail.score)
			.filter(
				(score): score is number =>
					typeof score === "number" && Number.isFinite(score)
			);

		if (numericScores.length) {
			const selectedScore = isLowerBetter
				? Math.min(...numericScores)
				: Math.max(...numericScores);

			model.topScore = selectedScore;

			const selectedDetail = model.scores.find(
				(detail) => detail.score === selectedScore
			);

			if (selectedDetail) {
				model.topScoreDisplay = selectedDetail.scoreDisplay;
				model.isPercentage = selectedDetail.isPercentage;
			} else {
				model.topScoreDisplay = formatScore(
					selectedScore,
					model.scores[0]?.isPercentage ?? false,
					selectedScore
				);
				model.isPercentage =
					model.scores[0]?.isPercentage ?? false;
			}
		} else {
			model.topScore = null;
			model.topScoreDisplay = model.scores[0]?.scoreDisplay ?? "-";
			model.isPercentage = model.scores[0]?.isPercentage ?? false;
		}
	}

	const sortedModels = [...models]
		.sort((a, b) => {
			if (a.topScore != null && b.topScore != null) {
				return isLowerBetter
					? a.topScore - b.topScore
					: b.topScore - a.topScore;
			}

			if (a.topScore != null) return -1;
			if (b.topScore != null) return 1;

			const rankA = a.rank ?? Number.POSITIVE_INFINITY;
			const rankB = b.rank ?? Number.POSITIVE_INFINITY;
			if (rankA !== rankB) return rankA - rankB;

			return a.modelName.localeCompare(b.modelName);
		});

	return {
		models: sortedModels,
		isLowerBetter,
	};
}

async function fetchBenchmarkComparisonCharts(
	modelId: string,
	includeHidden: boolean
): Promise<BenchmarkComparisonChart[]> {
	const { results, modelId: currentModelId } = await loadBenchmarkResults(
		modelId,
		includeHidden
	);

	if (!results.length) {
		return [];
	}

	const supabase = await createClient();
	const charts: BenchmarkComparisonChart[] = [];
	const processedBenchmarks = new Set<string>();

	for (const result of results) {
		if (!result.benchmark_id) continue;
		if (processedBenchmarks.has(result.benchmark_id)) continue;
		processedBenchmarks.add(result.benchmark_id);

		const { data, error } = await supabase
			.from("data_benchmark_results")
			.select(
				`
					model_id,
					score,
					is_self_reported,
					other_info,
					source_link,
					rank,
					model:data_models (
						model_id,
						name,
						hidden,
						organisation: data_organisations (
							organisation_id,
							name,
							colour
						)
					)
				`
			)
			.eq("benchmark_id", result.benchmark_id)
			.order("rank", { ascending: true, nullsFirst: false })
			.limit(100);

		if (error) {
			throw new Error(
				error.message ||
				`Failed to fetch benchmark comparison for ${result.benchmark_id}`
			);
		}

		const rows: ComparisonRow[] = (data ?? []).filter((row: any) => {
			if (includeHidden) return true;
			const modelEntry = normalizeMaybeArray(row?.model);
			return !modelEntry?.hidden;
		});
		if (!rows.length) continue;

		const aggregated = aggregateComparisonRows(rows, currentModelId);

		charts.push({
			benchmarkId: result.benchmark_id,
			benchmarkName: result.benchmark.name || result.benchmark_id,
			totalModels: result.benchmark.total_models ?? null,
			isLowerBetter: aggregated.isLowerBetter,
			current: {
				score: result.score,
				scoreDisplay: result.score_display,
				rank: result.rank,
			},
			models: aggregated.models,
		});
	}

	return charts;
}

export async function getModelBenchmarkHighlights(
	modelId: string,
	includeHidden: boolean
): Promise<ModelBenchmarkHighlight[]> {
	"use cache";

	cacheLife("days");
	cacheTag(`model:benchmarks:highlights:${modelId}`);

	const { results } = await loadBenchmarkResults(modelId, includeHidden);
	return selectHighlightResults(results);
}

export async function getModelBenchmarkTableData(
	modelId: string,
	includeHidden: boolean
): Promise<Record<string, ModelBenchmarkResult[]>> {
	"use cache";

	cacheLife("days");
	cacheTag(`model:benchmarks:table:${modelId}`);

	const { results } = await loadBenchmarkResults(modelId, includeHidden);
	return groupResultsByBenchmarkName(results);
}

export async function getModelBenchmarkComparisonData(
	modelId: string,
	includeHidden: boolean
): Promise<BenchmarkComparisonChart[]> {
	"use cache";

	cacheLife("days");
	cacheTag(`model:benchmarks:comparisons:${modelId}`);

	return fetchBenchmarkComparisonCharts(modelId, includeHidden);
}
