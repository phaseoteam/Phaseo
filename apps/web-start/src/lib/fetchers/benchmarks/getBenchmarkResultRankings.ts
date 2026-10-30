import { createAdminClient } from "@/utils/supabase/admin";

export interface DerivedBenchmarkRankingRow {
	resultId: string;
	modelId: string;
	benchmarkId: string;
	score: string | number | null;
	scoreNumeric: number | null;
	isSelfReported: boolean;
	otherInfo: string | null;
	sourceLink: string | null;
	createdAt: string | null;
	updatedAt: string | null;
	occurIndex: number | null;
	variant: string | null;
	resultKey: string | null;
	rank: number | null;
	totalRankedModels: number | null;
	isPrimaryResult: boolean;
	modelName: string;
	releaseDate: string | null;
	announcementDate: string | null;
	organisationId: string;
	organisationName: string | null;
	organisationColour: string | null;
}

interface RawDerivedBenchmarkRankingRow {
	result_id: string;
	model_id: string;
	benchmark_id: string;
	score: string | number | null;
	score_numeric: string | number | null;
	is_self_reported: boolean | null;
	other_info: string | null;
	source_link: string | null;
	created_at: string | null;
	updated_at: string | null;
	occur_idx: number | null;
	variant: string | null;
	result_key: string | null;
	benchmark_rank: string | number | null;
	total_ranked_models: string | number | null;
	is_primary_result: boolean | null;
	model_name: string | null;
	release_date: string | null;
	announcement_date: string | null;
	organisation_id: string | null;
	organisation_name: string | null;
	organisation_colour: string | null;
}

function finiteNumber(value: string | number | null): number | null {
	if (value == null) return null;
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function positiveInteger(value: string | number | null): number | null {
	const parsed = finiteNumber(value);
	if (parsed == null || parsed < 1) return null;
	return Math.trunc(parsed);
}

export function mapDerivedBenchmarkRankingRow(
	row: RawDerivedBenchmarkRankingRow
): DerivedBenchmarkRankingRow {
	return {
		resultId: row.result_id,
		modelId: row.model_id,
		benchmarkId: row.benchmark_id,
		score: row.score,
		scoreNumeric: finiteNumber(row.score_numeric),
		isSelfReported: Boolean(row.is_self_reported),
		otherInfo: row.other_info ?? null,
		sourceLink: row.source_link ?? null,
		createdAt: row.created_at ?? null,
		updatedAt: row.updated_at ?? null,
		occurIndex: row.occur_idx ?? null,
		variant: row.variant ?? null,
		resultKey: row.result_key ?? null,
		rank: positiveInteger(row.benchmark_rank),
		totalRankedModels: positiveInteger(row.total_ranked_models),
		isPrimaryResult: Boolean(row.is_primary_result),
		modelName: row.model_name ?? row.model_id,
		releaseDate: row.release_date ?? null,
		announcementDate: row.announcement_date ?? null,
		organisationId: row.organisation_id ?? "",
		organisationName: row.organisation_name ?? null,
		organisationColour: row.organisation_colour ?? null,
	};
}

export async function getBenchmarkResultRankings(args: {
	benchmarkIds: string[];
	modelId?: string | null;
	includeHidden: boolean;
	limitPerBenchmark?: number | null;
}): Promise<DerivedBenchmarkRankingRow[]> {
	const benchmarkIds = Array.from(
		new Set(args.benchmarkIds.map((id) => id.trim()).filter(Boolean))
	);
	if (!benchmarkIds.length) return [];

	const supabase = createAdminClient();
	const { data, error } = await supabase.rpc("get_benchmark_result_rankings", {
		p_benchmark_ids: benchmarkIds,
		p_model_id: args.modelId ?? null,
		p_include_hidden: args.includeHidden,
		p_limit_per_benchmark: args.limitPerBenchmark ?? null,
	});

	if (error) {
		throw new Error(error.message || "Failed to derive benchmark rankings");
	}

	return ((data ?? []) as RawDerivedBenchmarkRankingRow[]).map(
		mapDerivedBenchmarkRankingRow
	);
}
