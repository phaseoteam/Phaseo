import { Hono } from "hono";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { withPublicCache } from "@/http/cache";

type RangeKey = "1h" | "1d" | "1w" | "4w" | "1m" | "1y";
const VALID_RANGES = new Set<RangeKey>(["1h", "1d", "1w", "4w", "1m", "1y"]);
const PAGE_SIZE = 1_000;

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

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
	return message.includes("gateway_usage_rollup_daily_app")
		|| message.includes("gateway_usage_rollup_daily_app_model")
		|| message.includes("gateway_usage_rollup_15m_app_model");
}

async function getPublicApp(env: Env, reference: string) {
	let query = getDataClient(env).from("api_apps").select("*").eq("is_public", true);
	query = isUuid(reference) ? query.eq("id", reference) : query.eq("slug", reference);
	const { data, error } = await query.maybeSingle();
	if (error) throw error;
	return data as Record<string, unknown> | null;
}

async function fetchGatewayUsage(
	env: Env,
	appId: string,
	from: string,
	to: string,
): Promise<Array<Record<string, unknown>>> {
	const rows: Array<Record<string, unknown>> = [];
	for (let offset = 0; offset < 40 * PAGE_SIZE; offset += PAGE_SIZE) {
		const { data, error } = await getDataClient(env)
			.from("gateway_requests")
			.select("created_at,usage,cost_nanos,model_id,provider,success")
			.eq("app_id", appId)
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
			.eq("is_public", true);
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
		const { data, error } = await getDataClient(c.env).from("api_apps").select("id,image_url").in("id", ids).eq("is_public", true);
		if (error) throw error;
		return withPublicCache(c.json({ images: Object.fromEntries((data ?? []).map((row) => [row.id, row.image_url ?? null])) }), { edgeTtlSeconds: 24 * 60 * 60, staleWhileRevalidateSeconds: 7 * 24 * 60 * 60, cacheTags: ["web-api-app-images"] });
	} catch (error) { console.error("[web-api/apps] images failed", error); return c.json({ error: "app_images_unavailable" }, 503); }
});

publicAppsRouter.get("/apps/provider-model-mappings", async (c) => {
	const modelIds = [...new Set((c.req.query("model_ids") ?? "").split(",").map((id) => id.trim()).filter(Boolean))].slice(0, 500);
	const providerIds = [...new Set((c.req.query("provider_ids") ?? "").split(",").map((id) => id.trim()).filter(Boolean))].slice(0, 100);
	try {
		if (modelIds.length === 0) return withPublicCache(c.json({ mappings: [] }), { edgeTtlSeconds: 60 * 60, staleWhileRevalidateSeconds: 24 * 60 * 60, cacheTags: ["web-api-app-model-mappings"] });
		let query = getDataClient(c.env).from("data_api_provider_models").select("provider_id,api_model_id,model_id").in("api_model_id", modelIds).not("model_id", "is", null);
		if (providerIds.length) query = query.in("provider_id", providerIds);
		const { data, error } = await query;
		if (error) throw error;
		return withPublicCache(c.json({ mappings: data ?? [] }), { edgeTtlSeconds: 60 * 60, staleWhileRevalidateSeconds: 24 * 60 * 60, cacheTags: ["web-api-app-model-mappings"] });
	} catch (error) { console.error("[web-api/apps] mappings failed", error); return c.json({ error: "app_model_mappings_unavailable" }, 503); }
});

async function resolveAppNames(env: Env, rows: Array<Record<string, unknown>>) {
	const unresolved = rows.filter((row) => !String(row.app_name ?? "").trim()).map((row) => String(row.app_id ?? "").trim()).filter(Boolean);
	const names = new Map<string, string>();
	if (unresolved.length) {
		const { data, error } = await getDataClient(env).from("api_apps").select("id,title").in("id", [...new Set(unresolved)]).eq("is_public", true);
		if (error) throw error;
		for (const row of data ?? []) names.set(row.id, String(row.title ?? row.id));
	}
	return rows.filter((row) => String(row.app_id ?? "").trim()).map((row) => ({ ...row, app_id: String(row.app_id).trim(), app_name: String(row.app_name ?? "").trim() || names.get(String(row.app_id).trim()) || String(row.app_id).trim() }));
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
			getDataClient(c.env).from("api_apps").select("id").eq("is_public", true),
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
		const app = await getPublicApp(c.env, appReference);
		if (!app) return c.json({ error: "app_not_found" }, 404);
		const appId = String(app.id ?? "");
		const fromDate = fromForRange(range);
		const from = fromDate.toISOString();
		const nowIso = new Date().toISOString();
		const daily = ["1w", "4w", "1m", "1y"].includes(range);
		const table = daily
			? "gateway_usage_rollup_daily_app_model"
			: "gateway_usage_rollup_15m_app_model";
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
				.eq("app_id", appId)
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
			? await fetchGatewayUsage(c.env, appId, from, nowIso)
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
			cacheTags: ["web-api-app-usage", `web-api-app-${encodeURIComponent(appId).replace(/%/g, "")}`],
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
		const app = await getPublicApp(c.env, appReference);
		if (!app) return c.json({ error: "app_not_found" }, 404);
		const appId = String(app.id ?? "");
		const { data, error } = await getDataClient(c.env)
			.from("gateway_requests")
			.select("created_at,usage,cost_nanos,model_id,provider,success")
			.eq("app_id", appId)
			.order("created_at", { ascending: false })
			.limit(limit);
		if (error) throw error;
		return withPublicCache(c.json({ requests: data ?? [] }), {
			edgeTtlSeconds: 60,
			staleWhileRevalidateSeconds: 5 * 60,
			cacheTags: ["web-api-app-usage", `web-api-app-${encodeURIComponent(appId).replace(/%/g, "")}`],
		});
	} catch (error) {
		console.error("[web-api/apps] recent requests failed", { appReference, error });
		return c.json({ error: "app_requests_unavailable" }, 503);
	}
});

publicAppsRouter.get("/apps/:appReference", async (c) => {
	const appReference = c.req.param("appReference").trim();
	try {
		const app = await getPublicApp(c.env, appReference);
		if (!app) return c.json({ error: "app_not_found" }, 404);
		const appId = String(app.id ?? "");
		const { data: stats, error: statsError } = await getDataClient(c.env)
			.from("gateway_usage_rollup_daily_app")
			.select("requests,success_requests,total_tokens")
			.eq("app_id", appId);
		let totalTokens = 0;
		let totalRequests = 0;
		if (statsError && missingRollup(statsError)) {
			const rows = await fetchGatewayUsage(c.env, appId, "1970-01-01T00:00:00.000Z", new Date().toISOString());
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
			slug: String(app.slug ?? "").trim(),
			total_tokens: totalTokens,
			total_requests: totalRequests,
		} }), {
			edgeTtlSeconds: 15 * 60,
			staleWhileRevalidateSeconds: 60 * 60,
			cacheTags: ["web-api-apps", `web-api-app-${encodeURIComponent(appId).replace(/%/g, "")}`],
		});
	} catch (error) {
		console.error("[web-api/apps] detail failed", { appReference, error });
		return c.json({ error: "app_unavailable" }, 503);
	}
});
