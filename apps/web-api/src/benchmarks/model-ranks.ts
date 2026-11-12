import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { indexVersion } from "@/routes/public/artificialAnalysis";

export const EPOCH_CAPABILITIES_INDEX_ID = "epoch-capabilities-index";
/** The model page's inline Epoch chart shows twelve neighbouring entries. */
const EPOCH_WINDOW = 12;

type LeaderboardEntry = {
	model_id: string;
	score: number;
	other_info?: string | null;
	configurations?: Array<{ score: number }>;
};

type Leaderboard = {
	benchmark_id: string;
	lower_is_better: boolean;
	entries: LeaderboardEntry[];
};

export type EpochLeaderboardEntry = {
	model_id: string;
	model_name: string;
	organisation_id: string | null;
	organisation_name: string | null;
	organisation_colour: string | null;
	release_date: string | null;
	score: number;
	rank: number;
	other_info: string | null;
	source_link: string | null;
	updated_at: string | null;
};

export type EpochLeaderboard = {
	benchmark_id: string;
	name: string;
	category: string | null;
	benchmark_type: string | null;
	lower_is_better: boolean;
	total_models: number | null;
	entries: EpochLeaderboardEntry[];
};

type ScoreEntry = { model_id: string | null; version: string | null; scores: number[] };

/** The part of every leaderboard that ranks need: each model's scores. */
export type BenchmarkRankInputs = {
	artificial_analysis: Array<{ benchmark_id: string; lower_is_better: boolean; entries: ScoreEntry[] }>;
	epoch: EpochLeaderboard | null;
};

export function benchmarkRankInputs(rankings: Leaderboard[], epoch: EpochLeaderboard | null): BenchmarkRankInputs {
	return {
		artificial_analysis: rankings.map((ranking) => ({
			benchmark_id: ranking.benchmark_id,
			lower_is_better: ranking.lower_is_better,
			// Rank every evaluated configuration, matching the model page.
			entries: ranking.entries.map((entry) => ({
				model_id: entry.model_id,
				version: indexVersion(entry.other_info ?? null),
				scores: entry.configurations?.length ? entry.configurations.map((configuration) => configuration.score) : [entry.score],
			})),
		})),
		epoch,
	};
}

function epochWindow<T extends { model_id: string }>(entries: readonly T[], modelId: string): T[] {
	const index = entries.findIndex((entry) => entry.model_id === modelId);
	const start = index < 0 ? 0 : Math.min(Math.max(0, index - 5), Math.max(0, entries.length - EPOCH_WINDOW));
	return entries.slice(start, start + EPOCH_WINDOW);
}

/**
 * One model's view of the benchmark leaderboards. A rank only counts better
 * scores, so other models' scores are pooled per index version instead of
 * listed per model; the model keeps its own entry.
 */
export function modelBenchmarkRanks(inputs: BenchmarkRankInputs, modelId: string) {
	return {
		model_id: modelId,
		artificial_analysis: Object.fromEntries(inputs.artificial_analysis.map((ranking) => {
			const own: ScoreEntry[] = [];
			const pooled = new Map<string | null, number[]>();
			for (const entry of ranking.entries) {
				if (entry.model_id === modelId) {
					own.push(entry);
					continue;
				}
				const scores = pooled.get(entry.version) ?? [];
				for (const score of entry.scores) scores.push(score);
				pooled.set(entry.version, scores);
			}
			const others = [...pooled].map(([version, scores]): ScoreEntry => ({ model_id: null, version, scores: scores.sort((left, right) => left - right) }));
			return [ranking.benchmark_id, { lower_is_better: ranking.lower_is_better, entries: [...own, ...others] }];
		})),
		epoch: inputs.epoch ? { ...inputs.epoch, entries: epochWindow(inputs.epoch.entries, modelId) } : null,
	};
}

function labColour(value: unknown) {
	const colour = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>).colour : null;
	return typeof colour === "string" ? colour : null;
}

/** The Epoch Capabilities Index leaderboard as the public benchmark page lists it. */
export async function loadEpochLeaderboard(env: Env): Promise<EpochLeaderboard | null> {
	const client = getDataClient(env);
	const [benchmarkResult, resultsResult] = await Promise.all([
		client.from("v2_benchmarks")
			.select("benchmark_id,name,category,ascending_order,total_models,benchmark_type")
			.eq("benchmark_id", EPOCH_CAPABILITIES_INDEX_ID)
			.maybeSingle(),
		client.from("v2_benchmark_results")
			.select("model_slug,score,other_info,source_link,updated_at,rank")
			.or(`effective_to.is.null,effective_to.gt.${new Date().toISOString()}`)
			.eq("benchmark_id", EPOCH_CAPABILITIES_INDEX_ID)
			.order("rank", { ascending: true, nullsFirst: false }),
	]);
	if (benchmarkResult.error) throw benchmarkResult.error;
	if (resultsResult.error) throw resultsResult.error;
	const benchmark = benchmarkResult.data;
	if (!benchmark) return null;
	const results = resultsResult.data ?? [];
	const modelSlugs = [...new Set(results.map((row) => row.model_slug).filter(Boolean))];
	const modelsResult = modelSlugs.length > 0
		? await client.from("v2_models")
			.select("model_slug,name,released_at,hidden,lab:v2_labs!v2_models_lab_slug_fkey(lab_slug,name,metadata)")
			.in("model_slug", modelSlugs)
		: { data: [], error: null };
	if (modelsResult.error) throw modelsResult.error;
	const models = new Map((modelsResult.data ?? []).map((model) => [model.model_slug, model]));
	const entries = results.flatMap((result): EpochLeaderboardEntry[] => {
		const model = models.get(result.model_slug);
		const score = Number(result.score);
		if (!model || model.hidden || result.score === null || !Number.isFinite(score)) return [];
		const lab = Array.isArray(model.lab) ? model.lab[0] : model.lab;
		return [{
			model_id: result.model_slug,
			model_name: model.name ?? result.model_slug,
			organisation_id: lab?.lab_slug ?? null,
			organisation_name: lab?.name ?? null,
			organisation_colour: labColour(lab?.metadata),
			release_date: model.released_at ?? null,
			score,
			rank: result.rank ?? 0,
			other_info: typeof result.other_info === "string" ? result.other_info : null,
			source_link: result.source_link ?? null,
			updated_at: result.updated_at ?? null,
		}];
	});
	return {
		benchmark_id: benchmark.benchmark_id,
		name: benchmark.name ?? "Epoch Capabilities Index",
		category: benchmark.category ?? null,
		benchmark_type: benchmark.benchmark_type ?? null,
		lower_is_better: benchmark.ascending_order === false,
		total_models: benchmark.total_models ?? null,
		entries,
	};
}
