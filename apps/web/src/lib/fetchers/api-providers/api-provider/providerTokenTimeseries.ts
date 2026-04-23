"use cache";

import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";
import { getTopModels } from "./top-models";

const DEFAULT_DAYS = 30;
const DEFAULT_TOP_MODELS = 8;
const PAGE_SIZE = 5000;
const MAX_FILTERED_PAGES = 8;
const MAX_FALLBACK_PAGES = 4;
const USAGE_FETCH_DEBUG_ENABLED = process.env.DEBUG_GATEWAY_USAGE_FETCHERS === "1";

type ProviderModelRollupRow = {
	bucket_15m: string;
	canonical_model_id: string;
	total_tokens: number | null;
};

type ProviderModelRequestRow = {
	id: string | null;
	created_at: string;
	canonical_model_id: string | null;
	model_id: string | null;
	usage: unknown;
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

function logUsageFetch(stage: string, payload: Record<string, unknown>): void {
	if (!USAGE_FETCH_DEBUG_ENABLED) return;
	console.info(`[gateway-usage-fetchers] ${stage}`, payload);
}

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

function toRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object") return null;
	return value as Record<string, unknown>;
}

function readUsageInt(usage: Record<string, unknown> | null, key: string): number {
	if (!usage) return 0;
	const raw = usage[key];
	const parsed = Number(raw);
	return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function getTotalTokensFromUsage(usageValue: unknown): number {
	const usage = toRecord(usageValue);
	const directTotal =
		readUsageInt(usage, "total_tokens") || readUsageInt(usage, "tokens");
	if (directTotal > 0) return directTotal;

	return (
		readUsageInt(usage, "input_tokens") +
		readUsageInt(usage, "output_tokens") +
		readUsageInt(usage, "prompt_tokens") +
		readUsageInt(usage, "completion_tokens")
	);
}

async function fetchProviderModelRollupRows(
	apiProviderId: string,
	sinceIso: string,
	nowIso: string,
	modelIds?: string[],
	maxPages = MAX_FILTERED_PAGES,
): Promise<ProviderModelRollupRow[]> {
	const supabase = createAdminClient();
	const rows: ProviderModelRollupRow[] = [];
	let hitPageCap = false;
	let pagesFetched = 0;
	let hadError = false;
	const seenRequestIds = new Set<string>();
	const filteredModelIds = Array.isArray(modelIds)
		? Array.from(
				new Set(modelIds.map((modelId) => String(modelId ?? "").trim()).filter(Boolean)),
			)
		: null;

	if (Array.isArray(modelIds) && filteredModelIds?.length === 0) {
		logUsageFetch("provider_model_rollup_query", {
			providerId: apiProviderId,
			filteredModelIds: 0,
			pagesFetched: 0,
			rows: 0,
			hitPageCap: false,
			hadError: false,
		});
		return rows;
	}

	const columnsToQuery = filteredModelIds
		? (["canonical_model_id", "model_id"] as const)
		: ([null] as const);

	for (const filterColumn of columnsToQuery) {
		let queryHitPageCap = true;
		for (
			let page = 0, from = 0;
			page < Math.max(1, maxPages);
			page += 1, from += PAGE_SIZE
		) {
			pagesFetched += 1;
			const to = from + PAGE_SIZE - 1;
			let query = supabase
				.from("gateway_requests")
				.select("id, created_at, canonical_model_id, model_id, usage")
				.eq("provider", apiProviderId)
				.gte("created_at", sinceIso)
				.lte("created_at", nowIso)
				.order("created_at", { ascending: true })
				.order("id", { ascending: true })
				.range(from, to);
			if (filterColumn && filteredModelIds && filteredModelIds.length > 0) {
				query = query.in(filterColumn, filteredModelIds);
			}

			const { data, error } = await query;

			if (error) {
				hadError = true;
				queryHitPageCap = false;
				console.error("Error loading provider rollup rows for chart:", error);
				break;
			}
			if (!Array.isArray(data) || data.length === 0) {
				queryHitPageCap = false;
				break;
			}

			for (const row of data as ProviderModelRequestRow[]) {
				const requestId = String(row?.id ?? "").trim();
				if (requestId) {
					if (seenRequestIds.has(requestId)) continue;
					seenRequestIds.add(requestId);
				}

				const canonicalModelId =
					String(row?.canonical_model_id ?? "").trim() ||
					String(row?.model_id ?? "").trim();
				if (!canonicalModelId) continue;

				rows.push({
					bucket_15m: String(row.created_at ?? "").trim(),
					canonical_model_id: canonicalModelId,
					total_tokens: getTotalTokensFromUsage(row.usage),
				});
			}
			if (data.length < PAGE_SIZE) {
				queryHitPageCap = false;
				break;
			}
		}

		if (queryHitPageCap) {
			hitPageCap = true;
		}
	}

	if (rows.length > 0 && hitPageCap) {
		console.warn(
			`Provider model token rows may be truncated for provider=${apiProviderId} pages=${maxPages}`,
		);
	}
	logUsageFetch("provider_model_rollup_query", {
		providerId: apiProviderId,
		filteredModelIds: filteredModelIds?.length ?? null,
		pagesFetched,
		rows: rows.length,
		hitPageCap,
		hadError,
		maxPages,
		pageSize: PAGE_SIZE,
	});

	return rows;
}

async function fetchTopProviderModelIds(
	apiProviderId: string,
	sinceIso: string,
	topModelsLimit: number,
): Promise<string[]> {
	if (!apiProviderId) return [];
	const supabase = createAdminClient();
	const { data, error } = await supabase.rpc("get_top_models_stats_tokens", {
		p_provider: apiProviderId,
		p_since: sinceIso,
		p_limit: Math.max(1, Math.min(100, topModelsLimit)),
	});
	if (error) {
		console.error("Error loading top provider models:", error);
		return [];
	}
	const ids = (data ?? [])
		.map((row: any) => String(row?.model_id ?? "").trim())
		.filter(Boolean);
	logUsageFetch("provider_model_top_ids", {
		providerId: apiProviderId,
		sinceIso,
		limit: topModelsLimit,
		count: ids.length,
		source: "rpc:get_top_models_stats_tokens",
	});
	return ids;
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
	const requestedDays = options?.days;
	const days =
		typeof requestedDays === "number" &&
		Number.isFinite(requestedDays) &&
		requestedDays > 0
			? Math.max(1, Math.round(requestedDays))
			: DEFAULT_DAYS;
	if (days >= 30) {
		cacheLife("days");
	} else if (days >= 7) {
		cacheLife("hours");
	} else {
		cacheLife("minutes");
	}
	cacheTag("data:gateway_usage_rollups");
	cacheTag(`data:gateway_usage_rollups:provider:${apiProviderId}`);
	cacheTag(`data:api_providers:${apiProviderId}`);

	if (!apiProviderId) {
		return { models: [], points: [] };
	}

	const requestedTopModels = options?.topModels;
	const topModelsLimit =
		typeof requestedTopModels === "number" &&
		Number.isFinite(requestedTopModels) &&
		requestedTopModels > 0
			? Math.max(1, Math.round(requestedTopModels))
			: DEFAULT_TOP_MODELS;

	const now = new Date();
	const since = new Date(now);
	since.setUTCDate(since.getUTCDate() - (days - 1));
	since.setUTCHours(0, 0, 0, 0);

	const sinceIso = since.toISOString();
	const nowIso = now.toISOString();
	const dayBuckets = buildDayBuckets(since, days);
	const dayBucketSet = new Set(dayBuckets);

	let preferredModelIds = await fetchTopProviderModelIds(
		apiProviderId,
		sinceIso,
		Math.max(topModelsLimit * 5, topModelsLimit),
	);
	if (!preferredModelIds.length) {
		const fallbackTop = await getTopModels(apiProviderId, true, Math.max(topModelsLimit * 5, topModelsLimit));
		preferredModelIds = fallbackTop
			.map((row) => String(row?.model_id ?? "").trim())
			.filter(Boolean);
		logUsageFetch("provider_model_top_ids", {
			providerId: apiProviderId,
			sinceIso,
			limit: Math.max(topModelsLimit * 5, topModelsLimit),
			count: preferredModelIds.length,
			source: "fallback:getTopModels",
		});
	}

	const rollupRows = await fetchProviderModelRollupRows(
		apiProviderId,
		sinceIso,
		nowIso,
		preferredModelIds,
		MAX_FILTERED_PAGES,
	);
	const fallbackRows = !rollupRows.length
		? await fetchProviderModelRollupRows(
			apiProviderId,
			sinceIso,
			nowIso,
			undefined,
			MAX_FALLBACK_PAGES,
		)
		: [];
	const sourceRows = rollupRows.length > 0 ? rollupRows : fallbackRows;
	if (!sourceRows.length) {
		return { models: [], points: [] };
	}

	const totalByModel = new Map<string, number>();
	const tokensByDayAndModel = new Map<string, Map<string, number>>();

	for (const row of sourceRows) {
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
	logUsageFetch("provider_model_token_timeseries", {
		providerId: apiProviderId,
		days,
		topModelsLimit,
		preferredModelIds: preferredModelIds.length,
		rollupRows: rollupRows.length,
		fallbackRows: fallbackRows.length,
		sourceRows: sourceRows.length,
		models: models.length,
		points: points.length,
	});

	return { models, points };
}
