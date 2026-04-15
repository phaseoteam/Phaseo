import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";

const PAGE_SIZE = 5000;
const MAX_PAGES = 12;

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

function toNumber(value: unknown): number {
	const parsed = Number(value ?? 0);
	return Number.isFinite(parsed) ? parsed : 0;
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

export async function getModelApps(
	modelId: string,
	_includeHidden: boolean,
	limit = 24,
): Promise<ModelAppUsage[]> {
	const supabase = createAdminClient();
	const safeLimit = Math.max(1, Math.min(100, Math.round(limit)));
	const aliases = await getModelAliases(supabase, modelId);
	const aggregate = new Map<
		string,
		{ requests: number; success: number; tokens: number }
	>();

	for (let page = 0, offset = 0; page < MAX_PAGES; page += 1, offset += PAGE_SIZE) {
		const { data, error } = await supabase
			.from("gateway_usage_rollup_daily_app_model")
			.select("app_id, requests, success_requests, total_tokens")
			.in("canonical_model_id", aliases)
			.range(offset, offset + PAGE_SIZE - 1);

		if (error) {
			console.warn("[model-apps] failed to load model app rollups", {
				modelId,
				error,
			});
			return [];
		}

		if (!Array.isArray(data) || data.length === 0) break;

		for (const row of data) {
			const appId = String((row as any)?.app_id ?? "").trim();
			if (!appId) continue;
			const existing = aggregate.get(appId) ?? {
				requests: 0,
				success: 0,
				tokens: 0,
			};
			existing.requests += toNumber((row as any)?.requests);
			existing.success += toNumber((row as any)?.success_requests);
			existing.tokens += toNumber((row as any)?.total_tokens);
			aggregate.set(appId, existing);
		}

		if (data.length < PAGE_SIZE) break;
	}

	if (aggregate.size === 0) return [];

	const appIds = Array.from(aggregate.keys());
	const { data: appRows, error: appError } = await supabase
		.from("api_apps")
		.select("id, title, image_url, url, last_seen, is_public")
		.in("id", appIds);

	if (appError) {
		console.warn("[model-apps] failed to resolve app metadata", {
			modelId,
			error: appError,
		});
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
		const id = String((row as any)?.id ?? "").trim();
		if (!id) continue;
		const isPublic = Boolean((row as any)?.is_public);
		appMetaById.set(id, {
			title: String((row as any)?.title ?? id).trim() || id,
			imageUrl:
				typeof (row as any)?.image_url === "string" &&
				(row as any).image_url.trim().length > 0
					? (row as any).image_url.trim()
					: null,
			url:
				typeof (row as any)?.url === "string" &&
				(row as any).url.trim().length > 0
					? (row as any).url.trim()
					: null,
			lastSeen:
				typeof (row as any)?.last_seen === "string" &&
				(row as any).last_seen.trim().length > 0
					? (row as any).last_seen
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
				totalRequests: Math.max(0, Math.round(usage.requests)),
				successfulRequests: Math.max(0, Math.round(usage.success)),
				totalTokens: Math.max(0, Math.round(usage.tokens)),
				isPublic: meta?.isPublic ?? false,
			};
		})
		.filter((entry) => entry.isPublic)
		.sort((a, b) => {
			if (b.totalTokens !== a.totalTokens) return b.totalTokens - a.totalTokens;
			if (b.totalRequests !== a.totalRequests) return b.totalRequests - a.totalRequests;
			return a.appId.localeCompare(b.appId);
		})
		.slice(0, safeLimit)
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

export async function getModelAppsCached(
	modelId: string,
	includeHidden: boolean,
	limit = 24,
): Promise<ModelAppUsage[]> {
	"use cache";

	cacheLife("days");
	cacheTag("data:apps");
	cacheTag("data:public_apps");
	cacheTag(`data:model_apps:${modelId}`);
	return getModelApps(modelId, includeHidden, limit);
}
