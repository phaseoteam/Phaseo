"use cache";

import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";

const DEFAULT_DAYS = 30;
const DEFAULT_TOP_MODELS = 8;
const PAGE_SIZE = 1000;
const MAX_PAGES_PER_DAY = 12;

type TopModelRpcRow = {
	model_id: string | null;
	model_name: string | null;
	total_tokens: number | null;
};

type ProviderModelMappingRow = {
	internal_model_id: string | null;
	api_model_id: string | null;
	provider_api_model_id: string | null;
	provider_model_slug: string | null;
	effective_from: string | null;
	effective_to: string | null;
};

type GatewayRequestRow = {
	created_at: string;
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

function parseTokenValue(value: unknown): number {
	if (value == null) return 0;
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : 0;
	}
	const numeric = Number.parseFloat(String(value));
	return Number.isFinite(numeric) ? numeric : 0;
}

function getUsageTotalTokens(usage: unknown): number {
	if (usage == null) return 0;

	let normalized = usage;
	if (typeof usage === "string") {
		try {
			normalized = JSON.parse(usage);
		} catch {
			return 0;
		}
	}

	if (typeof normalized !== "object" || normalized == null) {
		return 0;
	}

	const record = normalized as Record<string, unknown>;
	const totalTokens = parseTokenValue(
		record.total_tokens ?? record.totalTokens ?? null,
	);
	if (totalTokens > 0) return totalTokens;

	const priorityKeys = [
		"input_tokens",
		"output_tokens",
		"input_text_tokens",
		"output_text_tokens",
		"input_audio_tokens",
		"output_audio_tokens",
		"input_video_tokens",
		"output_video_tokens",
		"input_image_tokens",
		"output_image_tokens",
		"cached_read_text_tokens",
		"cached_write_text_tokens",
		"cached_read_audio_tokens",
		"cached_write_audio_tokens",
		"cached_read_video_tokens",
		"cached_write_video_tokens",
		"cached_read_image_tokens",
		"cached_write_image_tokens",
	] as const;

	let sum = 0;
	for (const key of priorityKeys) {
		sum += parseTokenValue(record[key]);
	}
	if (sum > 0) return sum;

	let fallback = 0;
	for (const [key, value] of Object.entries(record)) {
		const lower = key.toLowerCase();
		if (!lower.endsWith("_tokens")) continue;
		if (lower === "total_tokens") continue;
		if (lower.includes("reasoning")) continue;
		fallback += parseTokenValue(value);
	}
	return fallback;
}

function toIsoDate(value: Date): string {
	return value.toISOString().slice(0, 10);
}

function isActiveAt(row: ProviderModelMappingRow, timestampMs: number): boolean {
	const effectiveFrom = row.effective_from
		? new Date(row.effective_from).getTime()
		: Number.NEGATIVE_INFINITY;
	const effectiveTo = row.effective_to
		? new Date(row.effective_to).getTime()
		: Number.POSITIVE_INFINITY;
	return timestampMs >= effectiveFrom && timestampMs < effectiveTo;
}

function buildIdentifierIndex(rows: ProviderModelMappingRow[]) {
	const index = new Map<string, ProviderModelMappingRow[]>();
	for (const row of rows) {
		const keys = [
			row.internal_model_id,
			row.api_model_id,
			row.provider_api_model_id,
			row.provider_model_slug,
		].filter((value): value is string => Boolean(value));

		for (const key of keys) {
			const existing = index.get(key) ?? [];
			existing.push(row);
			index.set(key, existing);
		}
	}
	return index;
}

function resolveCanonicalModelId(
	row: GatewayRequestRow,
	topModelIds: Set<string>,
	identifierIndex: Map<string, ProviderModelMappingRow[]>,
): string | null {
	const rawModelId = row.model_id?.trim();
	if (!rawModelId) return null;
	if (topModelIds.has(rawModelId)) return rawModelId;

	const mappedRows = identifierIndex.get(rawModelId);
	if (!mappedRows?.length) return null;

	const eventTs = new Date(row.created_at).getTime();
	if (!Number.isFinite(eventTs)) return null;

	for (const mapped of mappedRows) {
		if (!isActiveAt(mapped, eventTs)) continue;
		const candidates = [
			mapped.internal_model_id,
			mapped.api_model_id,
			mapped.provider_api_model_id,
			mapped.provider_model_slug,
		].filter((value): value is string => Boolean(value));

		for (const candidate of candidates) {
			if (topModelIds.has(candidate)) return candidate;
		}
	}

	return null;
}

async function fetchTopModelsForWindow(
	apiProviderId: string,
	sinceIso: string,
	limit: number,
): Promise<ProviderTokenSeriesModel[]> {
	const supabase = createAdminClient();
	const { data, error } = await supabase.rpc("get_top_models_stats_tokens", {
		p_provider: apiProviderId,
		p_since: sinceIso,
		p_limit: limit,
	});

	if (error) {
		console.error("Error loading provider top models for timeseries:", error);
		return [];
	}

	return ((data ?? []) as TopModelRpcRow[])
		.filter((row): row is Required<Pick<TopModelRpcRow, "model_id">> & TopModelRpcRow =>
			Boolean(row.model_id),
		)
		.map((row) => {
			const modelId = row.model_id!.trim();
			return {
				modelId,
				modelName: row.model_name?.trim() || modelId,
				totalTokens: Number(row.total_tokens ?? 0),
			};
		});
}

async function fetchProviderModelMappings(
	apiProviderId: string,
): Promise<ProviderModelMappingRow[]> {
	const supabase = createAdminClient();
	const { data, error } = await supabase
		.from("data_api_provider_models")
		.select(
			"internal_model_id, api_model_id, provider_api_model_id, provider_model_slug, effective_from, effective_to",
		)
		.eq("provider_id", apiProviderId);

	if (error) {
		console.error("Error loading provider model mappings:", error);
		return [];
	}

	return (data ?? []) as ProviderModelMappingRow[];
}

async function fetchProviderRowsForDay(
	apiProviderId: string,
	dayStartIso: string,
	dayEndIso: string,
	identifiers: string[],
): Promise<GatewayRequestRow[]> {
	if (!identifiers.length) return [];
	const supabase = createAdminClient();
	const rows: GatewayRequestRow[] = [];

	for (let page = 0; page < MAX_PAGES_PER_DAY; page++) {
		const from = page * PAGE_SIZE;
		const to = from + PAGE_SIZE - 1;

		const { data, error } = await supabase
			.from("gateway_requests")
			.select("created_at, model_id, usage")
			.eq("provider", apiProviderId)
			.gte("created_at", dayStartIso)
			.lt("created_at", dayEndIso)
			.in("model_id", identifiers)
			.order("created_at", { ascending: true })
			.range(from, to);

		if (error) {
			console.error("Error loading provider request rows for chart:", error);
			break;
		}
		if (!data?.length) break;

		rows.push(...(data as GatewayRequestRow[]));
		if (data.length < PAGE_SIZE) break;
	}

	return rows;
}

export async function getProviderModelTokenTimeseries(
	apiProviderId: string,
	options?: {
		days?: number;
		topModels?: number;
	},
): Promise<ProviderTokenTimeseries> {
	cacheLife("minutes");
	cacheTag("data:gateway_requests");
	cacheTag(`data:gateway_requests:provider:${apiProviderId}`);

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

	const [topModels, mappingRows] = await Promise.all([
		fetchTopModelsForWindow(apiProviderId, sinceIso, topModelsLimit),
		fetchProviderModelMappings(apiProviderId),
	]);

	if (!topModels.length) {
		return { models: [], points: [] };
	}

	const topModelIds = new Set(topModels.map((model) => model.modelId));
	const identifierSet = new Set<string>(topModels.map((model) => model.modelId));

	for (const row of mappingRows) {
		const identifiers = [
			row.internal_model_id,
			row.api_model_id,
			row.provider_api_model_id,
			row.provider_model_slug,
		].filter((value): value is string => Boolean(value));

		if (!identifiers.some((id) => topModelIds.has(id))) continue;
		for (const identifier of identifiers) identifierSet.add(identifier);
	}

	const identifiers = Array.from(identifierSet);
	const identifierIndex = buildIdentifierIndex(mappingRows);
	const tokensByBucketAndModel = new Map<string, Map<string, number>>();

	for (let i = 0; i < days; i++) {
		const dayStart = new Date(since);
		dayStart.setUTCDate(since.getUTCDate() + i);
		const dayEnd = new Date(dayStart);
		dayEnd.setUTCDate(dayStart.getUTCDate() + 1);

		const dayRows = await fetchProviderRowsForDay(
			apiProviderId,
			dayStart.toISOString(),
			dayEnd.toISOString(),
			identifiers,
		);

		for (const row of dayRows) {
			const canonicalModelId = resolveCanonicalModelId(
				row,
				topModelIds,
				identifierIndex,
			);
			if (!canonicalModelId) continue;

			const tokens = getUsageTotalTokens(row.usage);
			if (!Number.isFinite(tokens) || tokens <= 0) continue;

			const date = new Date(row.created_at);
			if (Number.isNaN(date.getTime())) continue;
			const bucket = toIsoDate(date);

			const bucketMap = tokensByBucketAndModel.get(bucket) ?? new Map();
			bucketMap.set(
				canonicalModelId,
				(bucketMap.get(canonicalModelId) ?? 0) + tokens,
			);
			tokensByBucketAndModel.set(bucket, bucketMap);
		}
	}

	const points: ProviderTokenSeriesPoint[] = [];
	for (let i = 0; i < days; i++) {
		const bucketDate = new Date(since);
		bucketDate.setUTCDate(since.getUTCDate() + i);
		const bucket = toIsoDate(bucketDate);
		const bucketMap = tokensByBucketAndModel.get(bucket) ?? new Map();

		for (const model of topModels) {
			points.push({
				bucket,
				modelId: model.modelId,
				tokens: Math.round(bucketMap.get(model.modelId) ?? 0),
			});
		}
	}

	return {
		models: topModels,
		points,
	};
}
