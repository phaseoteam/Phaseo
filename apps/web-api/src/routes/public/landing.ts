import { Hono } from "hono";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { withPublicCache } from "@/http/cache";

const PAGE_SIZE = 1_000;

async function fetchAllRows(
	env: Env,
	table: string,
	select: string,
	configure: (query: any) => any,
): Promise<Array<Record<string, unknown>>> {
	const rows: Array<Record<string, unknown>> = [];
	for (let offset = 0; ; offset += PAGE_SIZE) {
		const query = configure(
			getDataClient(env).from(table).select(select),
		).range(offset, offset + PAGE_SIZE - 1);
		const { data, error } = await query;
		if (error) throw error;
		const page = (data ?? []) as Array<Record<string, unknown>>;
		rows.push(...page);
		if (page.length < PAGE_SIZE) break;
	}
	return rows;
}

export const publicLandingRouter = new Hono<{ Bindings: Env }>();

function percentile(values: number[], p: number): number | null {
	if (!values.length) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const rank = (sorted.length - 1) * p;
	const lower = Math.floor(rank);
	const upper = Math.ceil(rank);
	return lower === upper ? sorted[lower] : sorted[lower] * (upper - rank) + sorted[upper] * (rank - lower);
}

function isoHour(date: Date) { const value = new Date(date); value.setUTCMinutes(0, 0, 0); return value.toISOString(); }

publicLandingRouter.get("/landing/stats", async (c) => {
	try {
		const client = getDataClient(c.env);
		const [models, organisations, benchmarks, benchmarkResults, providers, usage] = await Promise.all([
			client.from("data_models").select("*", { count: "exact", head: true }).eq("hidden", false),
			client.from("data_organisations").select("*", { count: "exact", head: true }),
			client.from("data_benchmarks").select("*", { count: "exact", head: true }),
			client.from("data_benchmark_results").select("*", { count: "exact", head: true }),
			client.from("data_api_providers").select("*", { count: "exact", head: true }),
			client.rpc("get_public_usage_timeseries", { p_time_range: "month", p_bucket_size: "day", p_top_n: 10 }),
		]);
		for (const result of [models, organisations, benchmarks, benchmarkResults, providers, usage]) {
			if (result.error) throw result.error;
		}
		const monthlyTokenTotal = (usage.data ?? []).reduce(
			(sum, row) => sum + Math.max(0, Number(row.tokens ?? 0) || 0),
			0,
		);
		return withPublicCache(c.json({
			db: {
				models: models.count ?? 0,
				organisations: organisations.count ?? 0,
				benchmarks: benchmarks.count ?? 0,
				benchmark_results: benchmarkResults.count ?? 0,
				api_providers: providers.count ?? 0,
			},
			monthlyTokenTotal,
		}), {
			edgeTtlSeconds: 60 * 60,
			staleWhileRevalidateSeconds: 24 * 60 * 60,
			cacheTags: ["web-api-landing", "web-api-landing-stats"],
		});
	} catch (error) {
		console.error("[web-api/landing] stats failed", error);
		return c.json({ error: "landing_stats_unavailable" }, 503);
	}
});

publicLandingRouter.get("/landing/gateway-showcase", async (c) => {
	const hours = Math.max(1, Math.min(24 * 30, Math.round(Number(c.req.query("hours")) || 24 * 30)));
	const topModelsLimit = Math.max(0, Math.min(25, Math.round(Number(c.req.query("top_models_limit")) || 6)));
	const topAppsLimit = Math.max(0, Math.min(50, Math.round(Number(c.req.query("top_apps_limit")) || 25)));
	try {
		const client = getDataClient(c.env);
		const [rollup, supported, topModels, topApps] = await Promise.all([
			client.rpc("get_gateway_marketing_rollup", { p_hours: hours }),
			client.from("data_api_provider_models").select("api_model_id,provider_id,effective_from,effective_to").eq("is_active_gateway", true),
			client.rpc("get_public_top_models_with_metadata", { p_time_range: "week", p_limit: topModelsLimit }),
			client.rpc("get_public_top_apps", { p_time_range: "week", p_limit: topAppsLimit }),
		]);
		for (const result of [rollup, supported, topModels, topApps]) if (result.error) throw result.error;
		const now = new Date(); const nowMs = now.getTime();
		const activeSupported = (supported.data ?? []).filter((row) => { const from = row.effective_from ? Date.parse(row.effective_from) : Number.NEGATIVE_INFINITY; const to = row.effective_to ? Date.parse(row.effective_to) : Number.POSITIVE_INFINITY; return nowMs >= from && nowMs < to; });
		const byHour = new Map<string, Record<string, unknown>>((rollup.data ?? []).map((row) => [isoHour(new Date(row.bucket_hour)), row as Record<string, unknown>]));
		const points: Array<Record<string, number | string | null>> = []; const latencyAverages: number[] = [];
		let requests = 0; let successful = 0; let tokens = 0; let latencySum = 0; let latencySamples = 0;
		for (let offset = hours - 1; offset >= 0; offset--) {
			const timestamp = isoHour(new Date(nowMs - offset * 60 * 60 * 1_000)); const row = byHour.get(timestamp);
			const rowRequests = Number(row?.requests ?? 0) || 0; const rowSuccessful = Number(row?.success_requests ?? 0) || 0; const rowTokens = Number(row?.total_tokens ?? 0) || 0; const rowLatencySum = Number(row?.latency_sum_ms ?? 0) || 0; const rowLatencySamples = Number(row?.latency_samples ?? 0) || 0; const averageLatency = rowLatencySamples > 0 ? rowLatencySum / rowLatencySamples : null;
			requests += rowRequests; successful += rowSuccessful; tokens += rowTokens; latencySum += rowLatencySum; latencySamples += rowLatencySamples; if (averageLatency != null) latencyAverages.push(averageLatency);
			points.push({ timestamp, requests: rowRequests, uptimePct: rowRequests > 0 ? rowSuccessful / rowRequests * 100 : null, p50Ms: averageLatency, p95Ms: averageLatency, avgMs: averageLatency, requestsPerMin: rowRequests / 60, tokensPerMin: rowTokens / 60, hoursAgo: offset });
		}
		const modelIds = [...new Set(activeSupported.map((row) => row.api_model_id).filter(Boolean))]; const providerIds = [...new Set(activeSupported.map((row) => row.provider_id).filter(Boolean))];
		const metrics = { summary: { uptimePct: requests > 0 ? successful / requests * 100 : null, latencyP95Ms: percentile(latencyAverages, 0.95), latencyP50Ms: percentile(latencyAverages, 0.5), latencyAvgMs: latencySamples > 0 ? latencySum / latencySamples : null, requests24h: requests, successful24h: successful, tokens24h: tokens, requestsPerMinAvg: requests / (hours * 60), supportedModels: modelIds.length || null, supportedProviders: providerIds.length || null }, timeseries: { uptime: points, latency: points, throughput: points }, supported: { modelIds, providerIds }, fallback: requests <= 0 };
		const topAppRows = (topApps.data ?? []).filter((row) => Number(row.tokens ?? 0) > 0 && row.app_id).sort((a, b) => Number(b.tokens ?? 0) - Number(a.tokens ?? 0)).slice(0, 6);
		const appIds = [...new Set(topAppRows.map((row) => row.app_id))]; const appImageUrls: Record<string, string | null> = {};
		if (appIds.length) { const images = await client.from("api_apps").select("id,image_url").in("id", appIds).eq("is_public", true); if (images.error) throw images.error; for (const row of images.data ?? []) appImageUrls[row.id] = row.image_url ?? null; }
		return withPublicCache(c.json({ appImageUrls, metrics, topApps: { data: topApps.data ?? [] }, topModels: { data: topModels.data ?? [] } }), { edgeTtlSeconds: 15 * 60, staleWhileRevalidateSeconds: 15 * 60, cacheTags: ["web-api-landing", "web-api-gateway-showcase"] });
	} catch (error) { console.error("[web-api/landing] gateway showcase failed", error); return c.json({ error: "gateway_showcase_unavailable" }, 503); }
});

publicLandingRouter.get("/landing/models/stats", async (c) => {
	try {
		const [models, providerModels] = await Promise.all([
			fetchAllRows(
				c.env,
				"data_models",
				"model_id,organisation_id,announcement_date,release_date",
				(query) => query.eq("hidden", false),
			),
			fetchAllRows(
				c.env,
				"data_api_provider_models",
				"model_id,internal_model_id,api_model_id",
				(query) => query.eq("is_active_gateway", true),
			),
		]);
		const modelIds = new Set(models.map((model) => String(model.model_id ?? "")).filter(Boolean));
		const organisationIds = new Set(
			models.map((model) => String(model.organisation_id ?? "")).filter(Boolean),
		);
		const activeGatewayModels = new Set(
			providerModels
				.map((model) => String(model.model_id ?? model.internal_model_id ?? model.api_model_id ?? ""))
				.filter((modelId) => modelIds.has(modelId)),
		);
		const now = Date.now();
		const cutoff = now - 90 * 24 * 60 * 60 * 1_000;
		const recentCount = models.filter((model) =>
			[model.announcement_date, model.release_date].some((value) => {
				const timestamp = Date.parse(String(value ?? ""));
				return Number.isFinite(timestamp) && timestamp >= cutoff && timestamp <= now;
			}),
		).length;
		return withPublicCache(c.json({
			modelsCount: models.length,
			orgsCount: organisationIds.size,
			apiCount: activeGatewayModels.size,
			recentCount,
		}), {
			edgeTtlSeconds: 60 * 60,
			staleWhileRevalidateSeconds: 24 * 60 * 60,
			cacheTags: ["web-api-landing", "web-api-landing-model-stats"],
		});
	} catch (error) {
		console.error("[web-api/landing] model stats failed", error);
		return c.json({ error: "model_stats_unavailable" }, 503);
	}
});

publicLandingRouter.get("/landing/models/main", async (c) => {
	const modelIds = Array.from(new Set(
		(c.req.query("ids") ?? "")
			.split(",")
			.map((id) => id.trim())
			.filter(Boolean),
	)).slice(0, 25);
	if (modelIds.length === 0) {
		return withPublicCache(c.json({ models: [] }), {
			edgeTtlSeconds: 24 * 60 * 60,
			staleWhileRevalidateSeconds: 7 * 24 * 60 * 60,
			cacheTags: ["web-api-landing", "web-api-landing-main-models"],
		});
	}
	try {
		const { data, error } = await getDataClient(c.env)
			.from("data_models")
			.select("model_id,name,release_date,data_organisations(organisation_id,name,colour)")
			.in("model_id", modelIds)
			.eq("hidden", false);
		if (error) throw error;
		return withPublicCache(c.json({ models: data ?? [] }), {
			edgeTtlSeconds: 24 * 60 * 60,
			staleWhileRevalidateSeconds: 7 * 24 * 60 * 60,
			cacheTags: ["web-api-landing", "web-api-landing-main-models"],
		});
	} catch (error) {
		console.error("[web-api/landing] main models failed", error);
		return c.json({ error: "main_models_unavailable" }, 503);
	}
});
