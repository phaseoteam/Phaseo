import { Hono } from "hono";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { withPublicCache } from "@/http/cache";

type RangeKey = "1h" | "1d" | "1w" | "4w" | "1m" | "1y";
const VALID_RANGES = new Set<RangeKey>(["1h", "1d", "1w", "4w", "1m", "1y"]);
const PAGE_SIZE = 1_000;

function sumTokens(value: unknown): number {
	if (typeof value === "number") return Number.isFinite(value) ? value : 0;
	if (typeof value === "string") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	if (Array.isArray(value)) return value.reduce((sum, item) => sum + sumTokens(item), 0);
	if (!value || typeof value !== "object") return 0;
	const source = value as Record<string, unknown>;
	const explicit = source.total_tokens ?? source.totalTokens;
	if (explicit !== undefined) return sumTokens(explicit);
	return [
		source.prompt_tokens,
		source.completion_tokens,
		source.input_tokens,
		source.output_tokens,
	].reduce<number>((sum, item) => sum + sumTokens(item), 0);
}

function fromForRange(range: RangeKey): Date {
	const now = new Date();
	const from = new Date(now);
	if (range === "1h") from.setHours(now.getHours() - 1);
	else if (range === "1d") from.setDate(now.getDate() - 1);
	else if (range === "1w") from.setDate(now.getDate() - 7);
	else if (range === "4w") from.setDate(now.getDate() - 28);
	else if (range === "1m") from.setMonth(now.getMonth() - 1);
	else from.setFullYear(now.getFullYear() - 1);
	return from;
}

function missingRollup(error: unknown): boolean {
	const message = String((error as { message?: unknown })?.message ?? error ?? "");
	return message.includes("v2_web_public_usage_daily")
		|| message.includes("v2_web_public_usage_hourly");
}


type PublicAppGroup = {
	reference: string;
	app: Record<string, unknown>;
	memberIds: string[];
	publicSlug: string;
};

async function getPublicAppGroups(env: Env, references: string[]): Promise<PublicAppGroup[]> {
	if (references.length === 0) return [];
	const { data, error } = await getDataClient(env).rpc("get_public_app_groups", {
		p_references: [...new Set(references)],
	});
	if (error) throw error;
	return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
		const publicSlug = String(row.public_slug ?? "").trim();
		return {
			reference: String(row.reference ?? "").trim(),
			memberIds: Array.isArray(row.member_ids)
				? row.member_ids.map((id) => String(id).trim()).filter(Boolean)
				: [],
			publicSlug,
			app: {
				id: String(row.app_id ?? "").trim(),
				slug: publicSlug,
				title: String(row.app_name ?? "").trim(),
				url: typeof row.app_url === "string" ? row.app_url : null,
				image_url: typeof row.app_image_url === "string" ? row.app_image_url : null,
				category: typeof row.app_category === "string" ? row.app_category : null,
				is_active: row.app_is_active === true,
				is_public: row.app_is_public === true,
				last_seen: row.app_last_seen,
				created_at: row.app_created_at,
				updated_at: row.app_updated_at,
			},
		};
	});
}

export async function getPublicApp(env: Env, reference: string): Promise<PublicAppGroup | null> {
	return (await getPublicAppGroups(env, [reference]))[0] ?? null;
}

async function fetchGatewayUsage(
	env: Env,
	appIds: string[],
	from: string,
	to: string,
): Promise<Array<Record<string, unknown>>> {
	const rows: Array<Record<string, unknown>> = [];
	for (let offset = 0; offset < 40 * PAGE_SIZE; offset += PAGE_SIZE) {
		const { data, error } = await getDataClient(env)
			.from("v2_web_gateway_requests")
			.select("created_at,usage,cost_nanos,model_id,provider,success")
			.in("app_id", appIds)
			.gte("created_at", from)
			.lte("created_at", to)
			.order("created_at", { ascending: true })
			.range(offset, offset + PAGE_SIZE - 1);
		if (error) throw error;
		const page = (data ?? []) as Array<Record<string, unknown>>;
		rows.push(...page);
		if (page.length < PAGE_SIZE) break;
	}
	return rows;
}

export const publicAppsRouter = new Hono<{ Bindings: Env }>();

publicAppsRouter.get("/apps/ids", async (c) => {
	try {
		const { data, error } = await getDataClient(c.env)
			.from("api_apps")
			.select("id")
			.eq("is_public", true)
			.eq("is_active", true);
		if (error) throw error;
		const ids = (data ?? []).map((row) => String(row.id ?? "").trim()).filter(Boolean);
		return withPublicCache(c.json({ ids }), {
			edgeTtlSeconds: 24 * 60 * 60,
			staleWhileRevalidateSeconds: 7 * 24 * 60 * 60,
			cacheTags: ["web-api-apps", "web-api-app-ids"],
		});
	} catch (error) {
		console.error("[web-api/apps] ids failed", error);
		return c.json({ error: "apps_unavailable" }, 503);
	}
});

publicAppsRouter.get("/apps/images", async (c) => {
	const ids = [...new Set((c.req.query("ids") ?? "").split(",").map((id) => id.trim()).filter(Boolean))].slice(0, 500);
	try {
		if (ids.length === 0) return withPublicCache(c.json({ images: {} }), { edgeTtlSeconds: 24 * 60 * 60, staleWhileRevalidateSeconds: 7 * 24 * 60 * 60, cacheTags: ["web-api-app-images"] });
		const { data, error } = await getDataClient(c.env).from("api_apps").select("id,image_url").in("id", ids).eq("is_public", true).eq("is_active", true);
		if (error) throw error;
		return withPublicCache(c.json({ images: Object.fromEntries((data ?? []).map((row) => [row.id, row.image_url ?? null])) }), { edgeTtlSeconds: 24 * 60 * 60, staleWhileRevalidateSeconds: 7 * 24 * 60 * 60, cacheTags: ["web-api-app-images"] });
	} catch (error) { console.error("[web-api/apps] images failed", error); return c.json({ error: "app_images_unavailable" }, 503); }
});

publicAppsRouter.get("/apps/provider-model-mappings", async (c) => {
	const modelIds = [...new Set((c.req.query("model_ids") ?? "").split(",").map((id) => id.trim()).filter(Boolean))].slice(0, 500);
	const providerIds = [...new Set((c.req.query("provider_ids") ?? "").split(",").map((id) => id.trim()).filter(Boolean))].slice(0, 100);
	try {
		if (modelIds.length === 0) return withPublicCache(c.json({ mappings: [] }), { edgeTtlSeconds: 60 * 60, staleWhileRevalidateSeconds: 24 * 60 * 60, cacheTags: ["web-api-app-model-mappings"] });
		let query = getDataClient(c.env).from("v2_model_provider_routes").select("provider_slug,provider_model_slug,model_slug").in("provider_model_slug", modelIds).eq("is_stealth", false).eq("routing_enabled", true).in("status", ["active", "degraded"]);
		if (providerIds.length) query = query.in("provider_slug", providerIds);
		const { data, error } = await query;
		if (error) throw error;
		const modelSlugs = [...new Set((data ?? []).map((row) => String(row.model_slug ?? "")).filter(Boolean))];
		const visibleModels = modelSlugs.length
			? await getDataClient(c.env).from("v2_models").select("model_slug").in("model_slug", modelSlugs).eq("hidden", false).neq("status", "disabled")
			: { data: [], error: null };
		if (visibleModels.error) throw visibleModels.error;
		const visibleModelSlugs = new Set((visibleModels.data ?? []).map((row) => row.model_slug));
		const mappings = (data ?? []).filter((row) => visibleModelSlugs.has(row.model_slug)).map((row) => ({ provider_id: row.provider_slug, api_model_id: row.provider_model_slug, model_id: row.model_slug }));
		return withPublicCache(c.json({ mappings }), { edgeTtlSeconds: 60 * 60, staleWhileRevalidateSeconds: 24 * 60 * 60, cacheTags: ["web-api-app-model-mappings"] });
	} catch (error) { console.error("[web-api/apps] mappings failed", error); return c.json({ error: "app_model_mappings_unavailable" }, 503); }
});

async function resolveAppNames(env: Env, rows: Array<Record<string, unknown>>) {
	const ids = [...new Set(rows.map((row) => String(row.app_id ?? "").trim()).filter(Boolean))];
	const metadata = new Map<string, { name: string; url: string | null; category: string | null }>();
	if (ids.length) {
		const { data, error } = await getDataClient(env).from("api_apps").select("id,title,url,category").in("id", ids).eq("is_public", true).eq("is_active", true);
		if (error) throw error;
		for (const row of data ?? []) {
			metadata.set(row.id, {
				name: String(row.title ?? row.id),
				url: typeof row.url === "string" ? row.url : null,
				category: typeof row.category === "string" ? row.category : null,
			});
		}
	}
	return rows
		.filter((row) => metadata.has(String(row.app_id ?? "").trim()))
		.map((row) => {
			const appId = String(row.app_id).trim();
			const app = metadata.get(appId);
			return {
				...row,
				app_id: appId,
				app_name: app?.name ?? appId,
				app_url: app?.url ?? null,
				app_category: app?.category ?? null,
			};
		});
}

publicAppsRouter.get("/apps/top", async (c) => {
	const timeRange = c.req.query("time_range")?.trim() || "week";
	const limit = Math.max(1, Math.min(100, Math.round(Number(c.req.query("limit")) || 20)));
	try { const { data, error } = await getDataClient(c.env).rpc("get_public_top_apps", { p_time_range: timeRange, p_limit: limit }); if (error) throw error; const rows = await resolveAppNames(c.env, (data ?? []) as Array<Record<string, unknown>>); return withPublicCache(c.json({ data: rows }), { edgeTtlSeconds: 15 * 60, staleWhileRevalidateSeconds: 15 * 60, cacheTags: ["web-api-app-rankings"] }); }
	catch (error) { console.error("[web-api/apps] top failed", error); return c.json({ data: [] }, 200, { "Cache-Control": "no-store" }); }
});

publicAppsRouter.get("/apps/trending", async (c) => {
	const limit = Math.max(1, Math.min(100, Math.round(Number(c.req.query("limit")) || 20)));
	const minWeekTokens = Math.max(0, Number(c.req.query("min_week_tokens")) || 0);
	try { const { data, error } = await getDataClient(c.env).rpc("get_public_trending_apps", { p_limit: limit, p_min_week_tokens: minWeekTokens }); if (error) throw error; const rows = await resolveAppNames(c.env, (data ?? []) as Array<Record<string, unknown>>); return withPublicCache(c.json({ data: rows }), { edgeTtlSeconds: 15 * 60, staleWhileRevalidateSeconds: 15 * 60, cacheTags: ["web-api-app-rankings"] }); }
	catch (error) { console.error("[web-api/apps] trending failed", error); return c.json({ data: [] }, 200, { "Cache-Control": "no-store" }); }
});

publicAppsRouter.get("/apps/indexability", async (c) => {
	try {
		const [idsResult, topResult, trendingResult] = await Promise.all([
			getDataClient(c.env).from("api_apps").select("id").eq("is_public", true).eq("is_active", true),
			getDataClient(c.env).rpc("get_public_top_apps", { p_time_range: "4w", p_limit: 100 }),
			getDataClient(c.env).rpc("get_public_trending_apps", { p_limit: 100, p_min_week_tokens: 0 }),
		]);
		for (const result of [idsResult, topResult, trendingResult]) if (result.error) throw result.error;
		const ids = new Set((idsResult.data ?? []).map((row) => row.id));
		const hasLeaderboardData = (topResult.data ?? []).some((row) => ids.has(row.app_id) && Number(row.tokens ?? 0) > 0);
		const hasTrendingData = (trendingResult.data ?? []).some((row) => ids.has(row.app_id) && Number(row.growth_tokens ?? 0) > 0);
		return withPublicCache(c.json({ hasLeaderboardData, hasTrendingData, shouldIndex: hasLeaderboardData || hasTrendingData }), { edgeTtlSeconds: 15 * 60, staleWhileRevalidateSeconds: 15 * 60, cacheTags: ["web-api-app-rankings"] });
	} catch (error) { console.error("[web-api/apps] indexability failed", error); return c.json({ error: "app_indexability_unavailable" }, 503); }
});

publicAppsRouter.get("/apps/:appReference/usage", async (c) => {
	const appReference = c.req.param("appReference");
	const requestedRange = c.req.query("range") as RangeKey | undefined;
	const range = requestedRange && VALID_RANGES.has(requestedRange) ? requestedRange : "4w";
	try {
		const group = await getPublicApp(c.env, appReference);
		if (!group) return c.json({ error: "app_not_found" }, 404);
		const { memberIds: appIds } = group;
		const fromDate = fromForRange(range);
		const from = fromDate.toISOString();
		const nowIso = new Date().toISOString();
		const daily = ["1w", "4w", "1m", "1y"].includes(range);
		const table = daily
			? "v2_web_public_usage_daily"
			: "v2_web_public_usage_hourly";
		const select = daily
			? "day_bucket,canonical_model_id,requests,success_requests,total_tokens,total_cost_nanos"
			: "bucket_15m,canonical_model_id,requests,success_requests,total_tokens,total_cost_nanos";
		const dateColumn = daily ? "day_bucket" : "bucket_15m";
		const lowerBound = daily ? from.slice(0, 10) : from;
		const upperBound = daily ? nowIso.slice(0, 10) : nowIso;
		const rows: Array<Record<string, unknown>> = [];
		let rollupFailed = false;
		for (let offset = 0; offset < 40 * PAGE_SIZE; offset += PAGE_SIZE) {
			const { data, error } = await getDataClient(c.env)
				.from(table)
				.select(select)
				.in("app_id", appIds)
				.gte(dateColumn, lowerBound)
				.lte(dateColumn, upperBound)
				.order(dateColumn, { ascending: true })
				.range(offset, offset + PAGE_SIZE - 1);
			if (error) {
				if (missingRollup(error)) {
					rollupFailed = true;
					break;
				}
				throw error;
			}
			const page = (data ?? []) as Array<Record<string, unknown>>;
			rows.push(...page);
			if (page.length < PAGE_SIZE) break;
		}
		const usage = rollupFailed
			? await fetchGatewayUsage(c.env, appIds, from, nowIso)
			: rows.map((row) => {
				const requests = Number(row.requests ?? 0);
				const successRequests = Number(row.success_requests ?? 0);
				return {
					created_at: String(row[dateColumn] ?? ""),
					usage: { total_tokens: Number(row.total_tokens ?? 0) || 0 },
					cost_nanos: Number(row.total_cost_nanos ?? 0) || 0,
					model_id: String(row.canonical_model_id ?? ""),
					provider: "",
					success: successRequests > 0,
					requests: Number.isFinite(requests) ? Math.max(0, requests) : 0,
					successful_requests: Number.isFinite(successRequests) ? Math.max(0, successRequests) : 0,
				};
			}).filter((row) => row.created_at && row.model_id);
		return withPublicCache(c.json({ usage }), {
			edgeTtlSeconds: 15 * 60,
			staleWhileRevalidateSeconds: 15 * 60,
			cacheTags: ["web-api-app-usage", `web-api-app-${encodeURIComponent(group.publicSlug).replace(/%/g, "")}`],
		});
	} catch (error) {
		console.error("[web-api/apps] usage failed", { appReference, range, error });
		return c.json({ error: "app_usage_unavailable" }, 503);
	}
});

publicAppsRouter.get("/apps/:appReference/requests/recent", async (c) => {
	const appReference = c.req.param("appReference");
	const limit = Math.max(1, Math.min(100, Math.round(Number(c.req.query("limit")) || 10)));
	try {
		const group = await getPublicApp(c.env, appReference);
		if (!group) return c.json({ error: "app_not_found" }, 404);
		const { data, error } = await getDataClient(c.env)
			.from("v2_web_gateway_requests")
			.select("created_at,usage,cost_nanos,model_id,provider,success")
			.in("app_id", group.memberIds)
			.order("created_at", { ascending: false })
			.limit(limit);
		if (error) throw error;
		return withPublicCache(c.json({ requests: data ?? [] }), {
			edgeTtlSeconds: 60,
			staleWhileRevalidateSeconds: 5 * 60,
			cacheTags: ["web-api-app-usage", `web-api-app-${encodeURIComponent(group.publicSlug).replace(/%/g, "")}`],
		});
	} catch (error) {
		console.error("[web-api/apps] recent requests failed", { appReference, error });
		return c.json({ error: "app_requests_unavailable" }, 503);
	}
});

publicAppsRouter.get("/apps/:appReference", async (c) => {
	const appReference = c.req.param("appReference").trim();
	try {
		const group = await getPublicApp(c.env, appReference);
		if (!group) return c.json({ error: "app_not_found" }, 404);
		const { app, memberIds: appIds, publicSlug } = group;
		const { data: stats, error: statsError } = await getDataClient(c.env)
			.from("v2_web_public_usage_daily")
			.select("requests,success_requests,total_tokens")
			.in("app_id", appIds);
		let totalTokens = 0;
		let totalRequests = 0;
		if (statsError && missingRollup(statsError)) {
			const rows = await fetchGatewayUsage(c.env, appIds, "1970-01-01T00:00:00.000Z", new Date().toISOString());
			for (const row of rows) {
				totalTokens += Math.max(0, Math.round(sumTokens(row.usage)));
				if (row.success) totalRequests += 1;
			}
		} else if (statsError) {
			throw statsError;
		} else {
			for (const row of stats ?? []) {
				totalTokens += Number(row.total_tokens ?? 0) || 0;
				totalRequests += Number(row.success_requests ?? 0) || 0;
			}
		}
		return withPublicCache(c.json({ app: {
			...app,
			slug: publicSlug,
			total_tokens: totalTokens,
			total_requests: totalRequests,
		} }), {
			edgeTtlSeconds: 15 * 60,
			staleWhileRevalidateSeconds: 60 * 60,
			cacheTags: ["web-api-apps", `web-api-app-${encodeURIComponent(publicSlug).replace(/%/g, "")}`],
		});
	} catch (error) {
		console.error("[web-api/apps] detail failed", { appReference, error });
		return c.json({ error: "app_unavailable" }, 503);
	}
});
