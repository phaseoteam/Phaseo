import { Hono } from "hono";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { withPublicCache } from "@/http/cache";

const LIVE_CACHE = { edgeTtlSeconds: 15 * 60, staleWhileRevalidateSeconds: 15 * 60, cacheTags: ["web-api-rankings"] } as const;
const META_CACHE = { edgeTtlSeconds: 60 * 60, staleWhileRevalidateSeconds: 24 * 60 * 60, cacheTags: ["web-api-ranking-metadata"] } as const;

const RANKING_BENCHMARK_IDS: string[] = ["aa-intelligence-index-v4", "aa-coding-index-v4", "aa-agentic-index-v4", "aa-intelligence-index-cost-v4"];

function bounded(value: string | undefined, fallback: number, max: number) {
	const parsed = Math.round(Number(value));
	return Number.isFinite(parsed) ? Math.max(1, Math.min(max, parsed)) : fallback;
}

function boundedAtLeast(value: string | undefined, fallback: number, min: number, max: number) {
	const parsed = Math.round(Number(value));
	return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function csv(value: string | undefined, max = 500) {
	return [...new Set((value ?? "").split(",").map((item) => item.trim()).filter(Boolean))].slice(0, max);
}

export const publicRankingsRouter = new Hono<{ Bindings: Env }>();

publicRankingsRouter.get("/rankings/performance", async (c) => {
	try { const { data, error } = await getDataClient(c.env).rpc("get_public_model_performance", { p_hours: bounded(c.req.query("hours"), 24, 24 * 30) }); if (error) throw error; return withPublicCache(c.json({ data: data ?? [] }), LIVE_CACHE); }
	catch (error) { console.error("[web-api/rankings] performance failed", error); return c.json({ error: "ranking_performance_unavailable" }, 503); }
});

publicRankingsRouter.get("/rankings/fastest-models", async (c) => {
	try {
		const { data, error } = await getDataClient(c.env).rpc("get_public_fastest_models", {
			p_days: bounded(c.req.query("days"), 30, 365),
			p_limit: bounded(c.req.query("limit"), 20, 100),
		});
		if (error) throw error;
		return withPublicCache(c.json({ data: data ?? [] }), LIVE_CACHE);
	} catch (error) {
		console.error("[web-api/rankings] fastest models failed", error);
		return c.json({ error: "ranking_fastest_models_unavailable" }, 503);
	}
});

publicRankingsRouter.get("/rankings/market-share", async (c) => {
	const dimension = c.req.query("dimension") === "provider" ? "provider" : "organization";
	try { const { data, error } = await getDataClient(c.env).rpc("get_public_market_share", { p_dimension: dimension, p_time_range: c.req.query("time_range") || "week" }); if (error) throw error; return withPublicCache(c.json({ data: data ?? [] }), LIVE_CACHE); }
	catch (error) { console.error("[web-api/rankings] market share failed", error); return c.json({ error: "market_share_unavailable" }, 503); }
});

publicRankingsRouter.get("/rankings/market-share-timeseries", async (c) => {
	const dimension = c.req.query("dimension") === "provider" ? "provider" : "organization";
	try { const { data, error } = await getDataClient(c.env).rpc("get_public_market_share_timeseries", { p_dimension: dimension, p_time_range: c.req.query("time_range") || "week", p_bucket_size: c.req.query("bucket_size") || "day", p_top_n: bounded(c.req.query("top_n"), 8, 100) }); if (error) throw error; return withPublicCache(c.json({ data: data ?? [] }), LIVE_CACHE); }
	catch (error) { console.error("[web-api/rankings] market share series failed", error); return c.json({ error: "market_share_timeseries_unavailable" }, 503); }
});

publicRankingsRouter.get("/rankings/timeseries", async (c) => {
	try { const { data, error } = await getDataClient(c.env).rpc("get_public_usage_timeseries", { p_time_range: c.req.query("time_range") || "week", p_bucket_size: c.req.query("bucket_size") || "hour", p_top_n: bounded(c.req.query("top_n"), 10, 100) }); if (error) throw error; return withPublicCache(c.json({ data: data ?? [] }), LIVE_CACHE); }
	catch (error) { console.error("[web-api/rankings] timeseries failed", error); return c.json({ error: "ranking_timeseries_unavailable" }, 503); }
});

publicRankingsRouter.get("/rankings/multimodal", async (c) => {
	try { const { data, error } = await getDataClient(c.env).rpc("get_public_multimodal_breakdown", { p_time_range: c.req.query("time_range") || "week" }); if (error) throw error; return withPublicCache(c.json({ data: data ?? [] }), LIVE_CACHE); }
	catch (error) { console.error("[web-api/rankings] multimodal failed", error); return c.json({ error: "ranking_multimodal_unavailable" }, 503); }
});

publicRankingsRouter.get("/rankings/modality-timeseries", async (c) => {
	try { const { data, error } = await getDataClient(c.env).rpc("get_public_modality_usage_timeseries", { p_metric: c.req.query("metric") || "tokens", p_time_range: c.req.query("time_range") || "year", p_top_n: 20 }); if (error) throw error; return withPublicCache(c.json({ data: data ?? [] }), LIVE_CACHE); }
	catch (error) { console.error("[web-api/rankings] modality series failed", error); return c.json({ error: "modality_timeseries_unavailable" }, 503); }
});

publicRankingsRouter.get("/rankings/text-leaderboard", async (c) => {
	try {
		const { data, error } = await getDataClient(c.env).rpc("get_public_text_leaderboard_timeseries", {
			p_time_range: c.req.query("time_range") || "year",
			p_top_n: bounded(c.req.query("top_n"), 20, 100),
		});
		if (error) throw error;
		return withPublicCache(c.json({ data: data ?? [] }), LIVE_CACHE);
	} catch (error) {
		console.error("[web-api/rankings] text leaderboard failed", error);
		return c.json({ error: "ranking_text_leaderboard_unavailable" }, 503);
	}
});

publicRankingsRouter.get("/rankings/image-inputs", async (c) => {
	try {
		const { data, error } = await getDataClient(c.env).rpc("get_public_image_input_timeseries", {
			p_time_range: c.req.query("time_range") || "year",
			p_top_n: bounded(c.req.query("top_n"), 20, 100),
		});
		if (error) throw error;
		return withPublicCache(c.json({ data: data ?? [] }), LIVE_CACHE);
	} catch (error) {
		console.error("[web-api/rankings] image inputs failed", error);
		return c.json({ error: "ranking_image_inputs_unavailable" }, 503);
	}
});

publicRankingsRouter.get("/rankings/unique-users", async (c) => {
	try { const { data, error } = await getDataClient(c.env).rpc("get_public_unique_user_timeseries", { p_time_range: c.req.query("time_range") || "year", p_bucket_size: c.req.query("bucket_size") || "week", p_top_n: bounded(c.req.query("top_n"), 10, 100) }); if (error) throw error; return withPublicCache(c.json({ data: data ?? [] }), LIVE_CACHE); }
	catch (error) { console.error("[web-api/rankings] unique users failed", error); return c.json({ error: "unique_users_unavailable" }, 503); }
});

publicRankingsRouter.get("/rankings/model-retention", async (c) => {
	const cohortWeeks = bounded(c.req.query("weeks"), 10, 52);
	const limit = bounded(c.req.query("limit"), 20, 100);
	const minimumWorkspaceWeeks = Math.max(25, bounded(c.req.query("min_workspace_weeks"), 25, 10_000));
	const minimumWorkspaces = Math.max(20, bounded(c.req.query("min_workspaces"), 20, 10_000));
	const minimumWeeks = Math.max(2, bounded(c.req.query("min_weeks"), 2, 52));
	try {
		const client = getDataClient(c.env);
		const { data, error } = await client.rpc("get_public_model_retention_rankings", {
			p_weeks: cohortWeeks, p_limit: limit,
			p_min_workspace_weeks: minimumWorkspaceWeeks,
			p_min_workspaces: minimumWorkspaces,
			p_min_weeks: minimumWeeks,
		});
		if (error) throw error;
		const rows = (data ?? []) as Array<Record<string, unknown>>;
		const modelIds = rows.map((row) => String(row.model_id ?? "").trim()).filter(Boolean);
		const modelsResult = modelIds.length
			? await client.from("v2_models")
				.select("model_slug,name,lab_slug,lab:v2_labs!v2_models_lab_slug_fkey(name)")
				.in("model_slug", [...new Set(modelIds)]).eq("hidden", false)
			: { data: [], error: null };
		if (modelsResult.error) throw modelsResult.error;
		const models = new Map((modelsResult.data ?? []).map((row) => {
			const lab = Array.isArray(row.lab) ? row.lab[0] : row.lab;
			return [row.model_slug, {
				model_name: row.name ?? row.model_slug,
				organisation_id: row.lab_slug ?? null,
				organisation_name: lab?.name ?? row.lab_slug ?? null,
			}];
		}));
		return withPublicCache(c.json({
			// Only publish aggregates for visible catalogue models; do not leak
			// an unrecognised raw model id through the fallback representation.
			data: rows.flatMap((row) => {
				const model = models.get(String(row.model_id ?? ""));
				return model ? [{ ...row, ...model }] : [];
			}),
			methodology: { cohortWeeks, minimumWorkspaceWeeks, minimumWorkspaces, minimumWeeks },
		}), LIVE_CACHE);
	} catch (error) {
		console.error("[web-api/rankings] model retention failed", error);
		return c.json({ error: "model_retention_rankings_unavailable" }, 503);
	}
});

publicRankingsRouter.get("/rankings/tool-calls", async (c) => {
	try {
		const { data, error } = await getDataClient(c.env).rpc(
			"get_public_tool_call_timeseries",
			{
				p_time_range: c.req.query("time_range") || "year",
				p_bucket_size: c.req.query("bucket_size") || "week",
				p_top_n: bounded(c.req.query("top_n"), 10, 100),
			},
		);
		if (error) throw error;
		return withPublicCache(c.json({ data: data ?? [] }), LIVE_CACHE);
	} catch (error) {
		console.error("[web-api/rankings] tool calls failed", error);
		return c.json({ error: "tool_call_rankings_unavailable" }, 503);
	}
});

publicRankingsRouter.get("/rankings/benchmarks", async (c) => {
	try {
		const client = getDataClient(c.env);
		const benchmarkResult = await client.from("v2_benchmarks")
			.select("benchmark_id,name,category,ascending_order,benchmark_type,total_models")
			.in("benchmark_id", RANKING_BENCHMARK_IDS);
		if (benchmarkResult.error) throw benchmarkResult.error;
		const scores: Array<{ benchmark_id: string; model_slug: string; score_numeric: number | null; other_info: string | null; source_link: string | null; updated_at: string | null }> = [];
		for (let offset = 0; ; offset += 500) {
			const page = await client.from("v2_benchmark_results")
				.select("benchmark_id,model_slug,score_numeric,other_info,source_link,updated_at")
				.in("benchmark_id", RANKING_BENCHMARK_IDS).not("score_numeric", "is", null)
				.order("result_id").range(offset, offset + 499);
			if (page.error) throw page.error;
			scores.push(...(page.data ?? []));
			if ((page.data ?? []).length < 500) break;
		}
		const modelIds = [...new Set(scores.map((row) => row.model_slug))];
		const models = new Map<string, { model_name: string; organisation_id: string | null; organisation_name: string | null }>();
		for (let offset = 0; offset < modelIds.length; offset += 200) {
			const result = await client.from("v2_models")
				.select("model_slug,name,lab_slug,lab:v2_labs!v2_models_lab_slug_fkey(name)")
				.in("model_slug", modelIds.slice(offset, offset + 200)).eq("hidden", false);
			if (result.error) throw result.error;
			for (const row of result.data ?? []) {
				const lab = Array.isArray(row.lab) ? row.lab[0] : row.lab;
				models.set(row.model_slug, { model_name: row.name ?? row.model_slug, organisation_id: row.lab_slug ?? null, organisation_name: lab?.name ?? row.lab_slug ?? null });
			}
		}
		const order = new Map(RANKING_BENCHMARK_IDS.map((id, index) => [id, index]));
		const benchmarks = (benchmarkResult.data ?? [])
			.sort((left, right) => (order.get(left.benchmark_id) ?? 99) - (order.get(right.benchmark_id) ?? 99))
			.map((benchmark) => {
				const lowerIsBetter = benchmark.ascending_order === false;
				const versionOf = (info: string | null) => info?.match(/Intelligence Index v([\d.]+)/)?.[1] ?? null;
				const benchmarkScores = scores.filter((row) => row.benchmark_id === benchmark.benchmark_id && models.has(row.model_slug));
				const latestVersion = benchmarkScores.map((row) => versionOf(row.other_info)).filter((version): version is string => Boolean(version)).sort((a, b) => b.localeCompare(a, "en", { numeric: true }))[0];
				const bestByModel = new Map<string, { score: number; other_info: string | null; source_link: string | null; updated_at: string | null }>();
				for (const row of benchmarkScores) {
					// Preserve historical records, but never rank different index versions together.
					if (latestVersion && versionOf(row.other_info) !== latestVersion) continue;
					if (row.benchmark_id !== benchmark.benchmark_id || !models.has(row.model_slug)) continue;
					const score = Number(row.score_numeric);
					if (!Number.isFinite(score)) continue;
					const previous = bestByModel.get(row.model_slug);
					if (!previous || (lowerIsBetter ? score < previous.score : score > previous.score)) {
						bestByModel.set(row.model_slug, { score, other_info: row.other_info, source_link: row.source_link, updated_at: row.updated_at });
					}
				}
				const entries = [...bestByModel.entries()]
					.map(([modelId, result]) => ({ model_id: modelId, ...models.get(modelId), ...result }))
					.sort((left, right) => lowerIsBetter ? left.score - right.score : right.score - left.score)
					.map((entry, index, sorted) => ({ ...entry, rank: index > 0 && sorted[index - 1].score === entry.score ? sorted.findIndex((item) => item.score === entry.score) + 1 : index + 1 }));
				return {
					benchmark_id: benchmark.benchmark_id,
					name: benchmark.name,
					category: benchmark.category,
					benchmark_type: benchmark.benchmark_type,
					lower_is_better: lowerIsBetter,
					total_models: benchmark.total_models,
					entries,
				};
			});
		return withPublicCache(c.json({ benchmarks }), META_CACHE);
	} catch (error) {
		console.error("[web-api/rankings] benchmarks failed", error);
		return c.json({ error: "ranking_benchmarks_unavailable" }, 503);
	}
});


publicRankingsRouter.get("/rankings/intelligence-index", async (c) => {
	try {
		const { data, error } = await getDataClient(c.env).rpc(
			"get_public_intelligence_index",
			{ p_limit: bounded(c.req.query("limit"), 20, 100) },
		);
		if (error) throw error;
		const rows = data ?? [];
		const first = rows[0] ?? null;
		return withPublicCache(c.json({
			benchmark: first ? {
				benchmark_id: first.benchmark_id,
				name: first.benchmark_name,
				category: first.category,
				benchmark_type: first.benchmark_type,
				lower_is_better: false,
				total_models: Number(first.total_models ?? rows.length),
				entries: rows.map((row) => ({
					model_id: row.model_id,
					model_name: row.model_name,
					organisation_id: row.organisation_id,
					organisation_name: row.organisation_name,
					score: Number(row.score),
					rank: Number(row.rank),
				})),
			} : null,
		}), META_CACHE);
	} catch (error) {
		console.error("[web-api/rankings] intelligence index failed", error);
		return c.json({ error: "ranking_intelligence_index_unavailable" }, 503);
	}
});

publicRankingsRouter.get("/rankings/geography", async (c) => {
	const days = bounded(c.req.query("days"), 30, 365);
	const to = new Date();
	const from = new Date(to.getTime() - days * 86_400_000);
	try {
		const { data, error } = await getDataClient(c.env).rpc("get_public_geography_usage", {
			p_from: from.toISOString(),
			p_to: to.toISOString(),
			p_min_requests: 1,
			p_min_workspaces: 1,
		});
		if (error) throw error;
		return withPublicCache(c.json({ data: data ?? [], days }), LIVE_CACHE);
	} catch (error) {
		console.error("[web-api/rankings] geography failed", error);
		return c.json({ error: "ranking_geography_unavailable" }, 503);
	}
});

publicRankingsRouter.get("/rankings/context-lengths", async (c) => {
	const days = bounded(c.req.query("days"), 30, 365);
	try {
		const { data, error } = await getDataClient(c.env).rpc(
			"get_public_context_length_distribution",
			{
				p_days: days,
				p_min_requests: 1,
				p_min_workspaces: 1,
			},
		);
		if (error) throw error;
		return withPublicCache(c.json({ data: data ?? [], days }), LIVE_CACHE);
	} catch (error) {
		console.error("[web-api/rankings] context lengths failed", error);
		return c.json({ error: "ranking_context_lengths_unavailable" }, 503);
	}
});

publicRankingsRouter.get("/rankings/top-apps", async (c) => {
	const timeRange = c.req.query("time_range")?.trim() || "week";
	const limit = bounded(c.req.query("limit"), 20, 100);
	try {
		const client = getDataClient(c.env);
		const { data, error } = await client.rpc("get_public_top_apps", {
			p_time_range: timeRange,
			p_limit: limit,
		});
		if (error) throw error;
		const rows = (data ?? []) as Array<Record<string, unknown>>;
		const unresolved = rows
			.filter((row) => !String(row.app_name ?? "").trim())
			.map((row) => String(row.app_id ?? "").trim())
			.filter(Boolean);
		const names = new Map<string, string>();
		if (unresolved.length) {
			const apps = await client
				.from("api_apps")
				.select("id,title")
				.in("id", [...new Set(unresolved)])
				.eq("is_public", true);
			if (apps.error) throw apps.error;
			for (const app of apps.data ?? []) names.set(app.id, String(app.title ?? app.id));
		}
		const resolved = rows.map((row) => ({
			...row,
			app_name: String(row.app_name ?? "").trim()
				|| names.get(String(row.app_id ?? "").trim())
				|| String(row.app_id ?? "").trim(),
		}));
		return withPublicCache(c.json({ data: resolved }), LIVE_CACHE);
	} catch (error) {
		console.error("[web-api/rankings] top apps failed", error);
		return c.json({ error: "ranking_top_apps_unavailable" }, 503);
	}
});

publicRankingsRouter.get("/rankings/models", async (c) => {
	try {
		const client = getDataClient(c.env);
		const [rankings, trending, summary] = await Promise.all([
			client.rpc("get_public_model_rankings", { p_time_range: c.req.query("time_range") || "week", p_metric: c.req.query("metric") || "tokens", p_limit: bounded(c.req.query("limit"), 50, 250) }),
			client.rpc("get_public_trending_models", { p_limit: 20 }),
			client.rpc("get_public_summary_stats"),
		]);
		if (rankings.error) throw rankings.error;
		if (trending.error) throw trending.error;
		if (summary.error) throw summary.error;
		const summaryRow = Array.isArray(summary.data) ? summary.data[0] : summary.data;
		return withPublicCache(c.json({ ok: true, rankings: rankings.data ?? [], trending: trending.data ?? [], summary: summaryRow ?? {} }), LIVE_CACHE);
	} catch (error) { console.error("[web-api/rankings] models failed", error); return c.json({ error: "model_rankings_unavailable" }, 503); }
});

publicRankingsRouter.get("/rankings/provider-meta", async (c) => {
	const ids = csv(c.req.query("ids"));
	try { if (!ids.length) return withPublicCache(c.json({ providers: {} }), META_CACHE); const { data, error } = await getDataClient(c.env).from("v2_providers").select("provider_slug,name,metadata").in("provider_slug", ids); if (error) throw error; const providers = Object.fromEntries((data ?? []).map((row) => [row.provider_slug, { name: row.name ?? row.provider_slug, colour: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? (row.metadata as Record<string, unknown>).colour ?? null : null }])); return withPublicCache(c.json({ providers }), META_CACHE); }
	catch (error) { console.error("[web-api/rankings] provider metadata failed", error); return c.json({ error: "provider_metadata_unavailable" }, 503); }
});

publicRankingsRouter.get("/rankings/organisation-logo-ids", async (c) => {
	const names = csv(c.req.query("names"));
	try { if (!names.length) return withPublicCache(c.json({ organisations: {} }), META_CACHE); const client = getDataClient(c.env); const [byName, byId] = await Promise.all([client.from("v2_labs").select("lab_slug,name").in("name", names), client.from("v2_labs").select("lab_slug").in("lab_slug", names)]); if (byName.error) throw byName.error; if (byId.error) throw byId.error; const organisations: Record<string, string> = {}; for (const row of byName.data ?? []) if (row.name && row.lab_slug) organisations[row.name] = row.lab_slug; for (const row of byId.data ?? []) if (row.lab_slug) organisations[row.lab_slug] = row.lab_slug; return withPublicCache(c.json({ organisations }), META_CACHE); }
	catch (error) { console.error("[web-api/rankings] organisation metadata failed", error); return c.json({ error: "organisation_metadata_unavailable" }, 503); }
});

publicRankingsRouter.get("/rankings/model-meta", async (c) => {
	const ids = csv(c.req.query("ids"));
	try {
		if (!ids.length) return withPublicCache(c.json({ models: {} }), META_CACHE);
		const client = getDataClient(c.env);
		const toMeta = (row: Record<string, any>) => { const lab = Array.isArray(row.lab) ? row.lab[0] : row.lab; const details = lab?.metadata && typeof lab.metadata === "object" && !Array.isArray(lab.metadata) ? lab.metadata : {}; return { model_id: row.model_slug, name: row.name ?? null, organisation_id: row.lab_slug ?? null, organisation_name: lab?.name ?? null, organisation_colour: details.colour ?? null, license: row.license ?? null }; };
		const direct = await client.from("v2_models").select("model_slug,name,lab_slug,license,lab:v2_labs!v2_models_lab_slug_fkey(name,metadata)").in("model_slug", ids).eq("hidden", false);
		if (direct.error) throw direct.error;
		const models: Record<string, ReturnType<typeof toMeta>> = {};
		for (const row of direct.data ?? []) models[row.model_slug] = toMeta(row);
		const unresolved = ids.filter((id) => !models[id]);
		if (unresolved.length) {
			const [byProviderId, bySlug, byAlias] = await Promise.all([
				client.from("v2_model_provider_routes").select("provider_model_id,provider_model_slug,model_slug").in("provider_model_id", unresolved).eq("is_stealth", false).eq("routing_enabled", true).in("status", ["active", "degraded"]),
				client.from("v2_model_provider_routes").select("provider_model_id,provider_model_slug,model_slug").in("provider_model_slug", unresolved).eq("is_stealth", false).eq("routing_enabled", true).in("status", ["active", "degraded"]),
				client.from("v2_model_aliases").select("alias_slug,model_slug").in("alias_slug", unresolved).eq("enabled", true),
			]);
			for (const result of [byProviderId, bySlug, byAlias]) if (result.error) throw result.error;
			const aliases = new Map<string, string>();
			for (const row of [...(byProviderId.data ?? []), ...(bySlug.data ?? [])]) for (const alias of [row.provider_model_id, row.provider_model_slug]) if (unresolved.includes(alias) && row.model_slug && !aliases.has(alias)) aliases.set(alias, row.model_slug);
			for (const row of byAlias.data ?? []) if (row.alias_slug && row.model_slug && !aliases.has(row.alias_slug)) aliases.set(row.alias_slug, row.model_slug);
			const canonicalIds = [...new Set(aliases.values())];
			if (canonicalIds.length) { const canonical = await client.from("v2_models").select("model_slug,name,lab_slug,license,lab:v2_labs!v2_models_lab_slug_fkey(name,metadata)").in("model_slug", canonicalIds).eq("hidden", false); if (canonical.error) throw canonical.error; const byId = new Map((canonical.data ?? []).map((row) => [row.model_slug, toMeta(row)])); for (const [alias, id] of aliases) models[alias] = byId.get(id) ?? { model_id: id, name: null, organisation_id: null, organisation_name: null, organisation_colour: null, license: null }; }
		}
		return withPublicCache(c.json({ models }), META_CACHE);
	} catch (error) { console.error("[web-api/rankings] model metadata failed", error); return c.json({ error: "model_metadata_unavailable" }, 503); }
});

publicRankingsRouter.get("/rankings/indexability", async (c) => {
	try {
		const client = getDataClient(c.env);
		const [rankings, performance, usage, apps] = await Promise.all([
			client.rpc("get_public_model_rankings", { p_time_range: "week", p_metric: "tokens", p_limit: 1 }),
			client.rpc("get_public_model_performance", { p_hours: 24 }),
			client.rpc("get_public_usage_timeseries", { p_time_range: "year", p_bucket_size: "week", p_top_n: 1 }),
			client.rpc("get_public_top_apps", { p_time_range: "week", p_limit: 1 }),
		]);
		for (const result of [rankings, performance, usage, apps]) if (result.error) throw result.error;
		const hasLeaderboardData = (rankings.data ?? []).some((row) => row.model_id && !["unknown", "other"].includes(String(row.model_id).toLowerCase()) && Number(row.total_tokens ?? 0) > 0);
		const hasPerformanceData = (performance.data ?? []).some((row) => row.model_id && row.provider && Number(row.median_throughput ?? 0) > 0);
		const hasUsageData = (usage.data ?? []).some((row) => row.model_id && !["unknown", "other"].includes(String(row.model_id).toLowerCase()) && Number(row.tokens ?? 0) > 0);
		const hasAppsData = (apps.data ?? []).some((row) => Number(row.tokens ?? 0) > 0);
		return withPublicCache(c.json({ hasLeaderboardData, hasPerformanceData, hasUsageData, hasAppsData, shouldIndex: hasLeaderboardData || hasPerformanceData || hasUsageData || hasAppsData }), LIVE_CACHE);
	} catch (error) { console.error("[web-api/rankings] indexability failed", error); return c.json({ error: "rankings_indexability_unavailable" }, 503); }
});
