import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";

const PAGE_SIZE = 5000;

export type ModelAppUsage = {
	appId: string;
	title: string;
	imageUrl: string | null;
	url: string | null;
	lastSeen: string | null;
	totalRequests: number;
	successfulRequests: number;
	totalTokens: number;
};

type ModelAppsRollupRpcRow = {
	app_id: string | null;
	requests: number | string | null;
	success_requests: number | string | null;
	total_tokens: number | string | null;
	title: string | null;
	image_url: string | null;
	url: string | null;
	last_seen: string | null;
};

type ModelAppsDailyRollupRow = {
	app_id: string | null;
	requests: number | string | bigint | null;
	success_requests: number | string | bigint | null;
	total_tokens: number | string | bigint | null;
};

type ModelAppMetadataRow = {
	id: string | null;
	title: string | null;
	image_url: string | null;
	url: string | null;
	last_seen: string | null;
	is_public: boolean | null;
};

const BIGINT_ZERO = BigInt(0);
const BIGINT_MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function toNumber(value: unknown): number {
	const parsed = Number(value ?? 0);
	return Number.isFinite(parsed) ? parsed : 0;
}

function toBigInt(value: unknown): bigint {
	if (typeof value === "bigint") return value;
	if (typeof value === "number") {
		if (!Number.isFinite(value)) return BIGINT_ZERO;
		return BigInt(Math.trunc(value));
	}
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed) return BIGINT_ZERO;
		try {
			return BigInt(trimmed);
		} catch {
			return BIGINT_ZERO;
		}
	}
	return BIGINT_ZERO;
}

function bigintToDisplayNumber(value: bigint): number {
	if (value <= BIGINT_ZERO) return 0;
	if (value > BIGINT_MAX_SAFE) return Number.MAX_SAFE_INTEGER;
	return Number(value);
}

async function getModelAliases(client: ReturnType<typeof createAdminClient>, modelId: string): Promise<string[]> {
	const aliases = new Set<string>([modelId]);

	const [byModelId, byApiModelId] = await Promise.all([
		client
			.from("data_api_provider_models")
			.select("model_id, api_model_id")
			.eq("model_id", modelId),
		client
			.from("data_api_provider_models")
			.select("model_id, api_model_id")
			.eq("api_model_id", modelId),
	]);

	for (const query of [byModelId, byApiModelId]) {
		if (query.error) {
			console.warn("[model-apps] failed to resolve aliases", {
				modelId,
				error: query.error,
			});
			continue;
		}
		for (const row of query.data ?? []) {
			const canonical = String(row?.model_id ?? "").trim();
			const apiModel = String(row?.api_model_id ?? "").trim();
			if (canonical) aliases.add(canonical);
			if (apiModel) aliases.add(apiModel);
		}
	}

	return Array.from(aliases);
}

function mapRpcRowToModelAppUsage(row: ModelAppsRollupRpcRow): ModelAppUsage | null {
	const appId = String(row?.app_id ?? "").trim();
	if (!appId) return null;

	const title = String(row?.title ?? appId).trim() || appId;
	const imageUrl =
		typeof row?.image_url === "string" && row.image_url.trim().length > 0
			? row.image_url.trim()
			: null;
	const url =
		typeof row?.url === "string" && row.url.trim().length > 0
			? row.url.trim()
			: null;
	const lastSeen =
		typeof row?.last_seen === "string" && row.last_seen.trim().length > 0
			? row.last_seen
			: null;

	return {
		appId,
		title,
		imageUrl,
		url,
		lastSeen,
		totalRequests: Math.max(0, Math.round(toNumber(row?.requests))),
		successfulRequests: Math.max(0, Math.round(toNumber(row?.success_requests))),
		totalTokens: Math.max(0, Math.round(toNumber(row?.total_tokens))),
	};
}

async function fetchModelAppsFromRollupRpc(args: {
	client: ReturnType<typeof createAdminClient>;
	modelId: string;
	aliases: string[];
	limit: number;
}): Promise<ModelAppUsage[] | null> {
	const { data, error } = await args.client.rpc("get_usage_model_apps", {
		p_model_ids: args.aliases,
		p_limit: args.limit,
		p_since: null,
	});

	if (error) {
		console.warn("[model-apps] rpc get_usage_model_apps failed; falling back to row pagination", {
			modelId: args.modelId,
			error,
		});
		return null;
	}

	const normalized = (data ?? [])
		.map((row: unknown) => mapRpcRowToModelAppUsage(row as ModelAppsRollupRpcRow))
		.filter((row: ModelAppUsage | null): row is ModelAppUsage => row !== null);

	// RPC already applies the deterministic ordering and limit.
	return normalized;
}

async function fetchModelAppsFromDailyRollupsFallback(args: {
	client: ReturnType<typeof createAdminClient>;
	modelId: string;
	aliases: string[];
	limit: number;
}): Promise<ModelAppUsage[]> {
	const aggregate = new Map<
		string,
		{ requests: bigint; success: bigint; tokens: bigint }
	>();

	for (let offset = 0; ; offset += PAGE_SIZE) {
		const { data, error } = await args.client
			.from("gateway_usage_rollup_daily_app_model")
			.select("day_bucket, canonical_model_id, app_id, requests, success_requests, total_tokens")
			.in("canonical_model_id", args.aliases)
			.order("day_bucket", { ascending: true })
			.order("app_id", { ascending: true })
			.order("canonical_model_id", { ascending: true })
			.range(offset, offset + PAGE_SIZE - 1);

		if (error) {
			console.warn("[model-apps] failed to load model app rollups", {
				modelId: args.modelId,
				error,
			});
			return [];
		}

		if (!Array.isArray(data) || data.length === 0) break;

		for (const row of data as ModelAppsDailyRollupRow[]) {
			const appId = String(row?.app_id ?? "").trim();
			if (!appId) continue;
			const existing = aggregate.get(appId) ?? {
				requests: BIGINT_ZERO,
				success: BIGINT_ZERO,
				tokens: BIGINT_ZERO,
			};
			existing.requests += toBigInt(row?.requests);
			existing.success += toBigInt(row?.success_requests);
			existing.tokens += toBigInt(row?.total_tokens);
			aggregate.set(appId, existing);
		}

		if (data.length < PAGE_SIZE) break;
	}

	if (aggregate.size === 0) return [];

	const appIds = Array.from(aggregate.keys());
	const appRows: ModelAppMetadataRow[] = [];
	const APP_IDS_CHUNK_SIZE = 500;

	for (let index = 0; index < appIds.length; index += APP_IDS_CHUNK_SIZE) {
		const appIdChunk = appIds.slice(index, index + APP_IDS_CHUNK_SIZE);
		const { data: chunkRows, error: chunkError } = await args.client
			.from("api_apps")
			.select("id, title, image_url, url, last_seen, is_public")
			.in("id", appIdChunk);

		if (chunkError) {
			console.warn("[model-apps] failed to resolve app metadata", {
				modelId: args.modelId,
				error: chunkError,
				chunkStart: index,
			});
			continue;
		}

		for (const row of chunkRows ?? []) {
			appRows.push(row as ModelAppMetadataRow);
		}
	}

	const appMetaById = new Map<
		string,
		{
			title: string;
			imageUrl: string | null;
			url: string | null;
			lastSeen: string | null;
			isPublic: boolean;
		}
	>();
	for (const row of appRows ?? []) {
		const id = String(row?.id ?? "").trim();
		if (!id) continue;
		const isPublic = Boolean(row?.is_public);
		appMetaById.set(id, {
			title: String(row?.title ?? id).trim() || id,
			imageUrl:
				typeof row?.image_url === "string" &&
				row.image_url.trim().length > 0
					? row.image_url.trim()
					: null,
			url:
				typeof row?.url === "string" &&
				row.url.trim().length > 0
					? row.url.trim()
					: null,
			lastSeen:
				typeof row?.last_seen === "string" &&
				row.last_seen.trim().length > 0
					? row.last_seen
					: null,
			isPublic,
		});
	}

	return appIds
		.map((appId) => {
			const usage = aggregate.get(appId)!;
			const meta = appMetaById.get(appId);
			return {
				appId,
				title: meta?.title ?? appId,
				imageUrl: meta?.imageUrl ?? null,
				url: meta?.url ?? null,
				lastSeen: meta?.lastSeen ?? null,
				totalRequests: bigintToDisplayNumber(usage.requests),
				successfulRequests: bigintToDisplayNumber(usage.success),
				totalTokens: bigintToDisplayNumber(usage.tokens),
				isPublic: meta?.isPublic ?? false,
				sortRequests: usage.requests,
				sortTokens: usage.tokens,
			};
		})
		.filter((entry) => entry.isPublic)
		.sort((a, b) => {
			if (a.sortTokens !== b.sortTokens) return b.sortTokens > a.sortTokens ? 1 : -1;
			if (a.sortRequests !== b.sortRequests) return b.sortRequests > a.sortRequests ? 1 : -1;
			return a.appId.localeCompare(b.appId);
		})
		.slice(0, args.limit)
		.map((entry) => ({
			appId: entry.appId,
			title: entry.title,
			imageUrl: entry.imageUrl,
			url: entry.url,
			lastSeen: entry.lastSeen,
			totalRequests: entry.totalRequests,
			successfulRequests: entry.successfulRequests,
			totalTokens: entry.totalTokens,
		}));
}

export async function getModelApps(
	modelId: string,
	_includeHidden: boolean,
	limit = 24,
): Promise<ModelAppUsage[]> {
	const supabase = createAdminClient();
	const normalizedLimit = Number.isFinite(limit) ? Math.round(limit) : 24;
	const safeLimit = Math.max(1, Math.min(100, normalizedLimit));
	const aliases = await getModelAliases(supabase, modelId);

	const rpcResult = await fetchModelAppsFromRollupRpc({
		client: supabase,
		modelId,
		aliases,
		limit: safeLimit,
	});
	if (rpcResult) return rpcResult;

	return fetchModelAppsFromDailyRollupsFallback({
		client: supabase,
		modelId,
		aliases,
		limit: safeLimit,
	});
}

export async function getModelAppsCached(
	modelId: string,
	includeHidden: boolean,
	limit = 24,
): Promise<ModelAppUsage[]> {
	"use cache";

	cacheLife("days");
	cacheTag("data:apps");
	cacheTag("data:public_apps");
	cacheTag("data:data_api_provider_models");
	cacheTag("data:gateway_usage_rollups");
	cacheTag(`model:api:${modelId}`);
	cacheTag(`data:model_apps:${modelId}`);
	return getModelApps(modelId, includeHidden, limit);
}
