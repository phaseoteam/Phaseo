"use cache";

import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";

const DEFAULT_DAYS = 30;
const DEFAULT_TOP_MODELS = 8;
const PAGE_SIZE = 5000;

type ProviderModelRollupRow = {
	bucket_15m: string;
	canonical_model_id: string;
	total_tokens: number | null;
};

export type ProviderTokenSeriesModel = {
	modelId: string;
	modelName: string;
	totalTokens: number;
};

export type ProviderTokenSeriesPoint = {
	bucket: string;
	modelId: string;
	tokens: number;
};

export type ProviderTokenTimeseries = {
	models: ProviderTokenSeriesModel[];
	points: ProviderTokenSeriesPoint[];
};

function toIsoDate(value: Date): string {
	return value.toISOString().slice(0, 10);
}

function buildDayBuckets(since: Date, days: number): string[] {
	const buckets: string[] = [];
	for (let i = 0; i < days; i++) {
		const day = new Date(since);
		day.setUTCDate(since.getUTCDate() + i);
		buckets.push(toIsoDate(day));
	}
	return buckets;
}

async function fetchProviderModelRollupRows(
	apiProviderId: string,
	sinceIso: string,
	nowIso: string,
): Promise<ProviderModelRollupRow[]> {
	const supabase = createAdminClient();
	const rows: ProviderModelRollupRow[] = [];

	for (let from = 0; ; from += PAGE_SIZE) {
		const to = from + PAGE_SIZE - 1;
		const { data, error } = await supabase
			.from("gateway_usage_rollup_15m_model_provider")
			.select("bucket_15m, canonical_model_id, total_tokens")
			.eq("provider", apiProviderId)
			.gte("bucket_15m", sinceIso)
			.lte("bucket_15m", nowIso)
			.order("bucket_15m", { ascending: true })
			.range(from, to);

		if (error) {
			console.error("Error loading provider rollup rows for chart:", error);
			break;
		}
		if (!Array.isArray(data) || data.length === 0) break;

		rows.push(...(data as ProviderModelRollupRow[]));
		if (data.length < PAGE_SIZE) break;
	}

	return rows;
}

async function fetchModelNames(modelIds: string[]): Promise<Map<string, string>> {
	const map = new Map<string, string>();
	if (!modelIds.length) return map;

	const supabase = createAdminClient();
	const { data, error } = await supabase
		.from("data_models")
		.select("model_id, name")
		.in("model_id", modelIds);

	if (error) {
		console.error("Error loading model names for provider chart:", error);
		return map;
	}

	for (const row of data ?? []) {
		const modelId = String((row as any)?.model_id ?? "").trim();
		if (!modelId) continue;
		const name = String((row as any)?.name ?? "").trim();
		map.set(modelId, name || modelId);
	}

	return map;
}

export async function getProviderModelTokenTimeseries(
	apiProviderId: string,
	options?: {
		days?: number;
		topModels?: number;
	},
): Promise<ProviderTokenTimeseries> {
	cacheLife("minutes");
	cacheTag("data:gateway_usage_rollups");
	cacheTag(`data:gateway_usage_rollups:provider:${apiProviderId}`);

	if (!apiProviderId) {
		return { models: [], points: [] };
	}

	const days = Math.max(1, options?.days ?? DEFAULT_DAYS);
	const topModelsLimit = Math.max(1, options?.topModels ?? DEFAULT_TOP_MODELS);

	const now = new Date();
	const since = new Date(now);
	since.setUTCDate(since.getUTCDate() - (days - 1));
	since.setUTCHours(0, 0, 0, 0);

	const sinceIso = since.toISOString();
	const nowIso = now.toISOString();
	const dayBuckets = buildDayBuckets(since, days);
	const dayBucketSet = new Set(dayBuckets);

	const rollupRows = await fetchProviderModelRollupRows(
		apiProviderId,
		sinceIso,
		nowIso,
	);
	if (!rollupRows.length) {
		return { models: [], points: [] };
	}

	const totalByModel = new Map<string, number>();
	const tokensByDayAndModel = new Map<string, Map<string, number>>();

	for (const row of rollupRows) {
		const modelId = String(row?.canonical_model_id ?? "").trim();
		if (!modelId) continue;

		const tokens = Number(row?.total_tokens ?? 0);
		if (!Number.isFinite(tokens) || tokens <= 0) continue;

		const day = toIsoDate(new Date(row.bucket_15m));
		if (!dayBucketSet.has(day)) continue;

		totalByModel.set(modelId, (totalByModel.get(modelId) ?? 0) + tokens);
		const dayMap = tokensByDayAndModel.get(day) ?? new Map<string, number>();
		dayMap.set(modelId, (dayMap.get(modelId) ?? 0) + tokens);
		tokensByDayAndModel.set(day, dayMap);
	}

	const topModelIds = Array.from(totalByModel.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, topModelsLimit)
		.map(([modelId]) => modelId);

	if (!topModelIds.length) {
		return { models: [], points: [] };
	}

	const nameByModelId = await fetchModelNames(topModelIds);
	const models: ProviderTokenSeriesModel[] = topModelIds.map((modelId) => ({
		modelId,
		modelName: nameByModelId.get(modelId) ?? modelId,
		totalTokens: Math.round(totalByModel.get(modelId) ?? 0),
	}));

	const points: ProviderTokenSeriesPoint[] = [];
	for (const day of dayBuckets) {
		const dayMap = tokensByDayAndModel.get(day) ?? new Map<string, number>();
		for (const model of models) {
			points.push({
				bucket: day,
				modelId: model.modelId,
				tokens: Math.round(dayMap.get(model.modelId) ?? 0),
			});
		}
	}

	return { models, points };
}
