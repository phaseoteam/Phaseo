import { fetchSubscriptionCatalogue } from "@/models/subscriptions";
import { Hono } from "hono";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { withPublicCache } from "@/http/cache";
import { composeComparisonModels, type ComparisonSources } from "@/models/compare";
import { composeCompareView } from "@/models/compare-view";
import { fetchModelPricingSources } from "@/models/pricing";
import { composeCompareUsage } from "@/models/compare-usage";

const COMPARE_CACHE = {
	edgeTtlSeconds: 60 * 60,
	staleWhileRevalidateSeconds: 24 * 60 * 60,
	cacheTags: ["web-api-compare", "web-api-models"],
} as const;

const COMPARE_SELECTION_CACHE = {
	...COMPARE_CACHE,
	cacheTags: [
		"web-api-compare",
		"web-api-model-details",
		"web-api-model-benchmarks",
		"web-api-model-pricing",
		"web-api-model-subscriptions",
	],
} as const;

const COMPARE_USAGE_CACHE = {
	edgeTtlSeconds: 5 * 60,
	staleWhileRevalidateSeconds: 5 * 60,
	cacheTags: ["web-api-compare", "web-api-model-performance", "web-api-model-token-trajectories", "web-api-model-realtime"],
} as const;

export const publicCompareRouter = new Hono<{ Bindings: Env }>();

function parseSelection(value: string | undefined): string[] | null {
	if (!value) return [];
	const values = [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
	if (values.length > 4 || values.some((item) => item.length > 200)) return null;
	return values;
}

publicCompareRouter.get("/compare/usage", async (c) => {
	const modelIds = parseSelection(c.req.query("ids"));
	if (!modelIds) return c.json({ error: "invalid_compare_selection" }, 400);
	if (modelIds.length === 0) return withPublicCache(c.json({ usage: {} }), COMPARE_USAGE_CACHE);
	try {
		const client = getDataClient(c.env);
		const realtime = await client.rpc("get_public_compare_realtime", {
			p_model_ids: modelIds,
			p_window_minutes: 30,
		});
		if (realtime.error) throw realtime.error;
		const sourceRows = await Promise.all(((realtime.data ?? []) as Array<Record<string, unknown>>).map(async (row) => {
			const modelId = String(row.model_id ?? "").trim();
			const [performance, trajectory] = await Promise.all([
				client.rpc("get_model_performance_overview", { p_model_id: modelId }),
				client.rpc("get_model_token_trajectory", { p_model_id: modelId }),
			]);
			if (performance.error) throw performance.error;
			if (trajectory.error) throw trajectory.error;
			return {
				...row,
				performance: performance.data?.[0] ?? null,
				trajectory: trajectory.data?.[0] ?? null,
			};
		}));
		const usage = composeCompareUsage(sourceRows);
		return withPublicCache(c.json({ usage }), COMPARE_USAGE_CACHE);
	} catch (error) {
		console.error("[web-api/compare] usage failed", { modelIds, error });
		return c.json({ error: "compare_usage_unavailable" }, 503);
	}
});

/** Every source row the selection and view endpoints compose, read in one batch. */
async function loadCompareSources(env: Env, modelIds: string[]): Promise<ComparisonSources> {
	const client = getDataClient(env);
	const [modelsResult, linksResult, detailsResult, benchmarkResults, modelPlansResult, pricing] = await Promise.all([
		client.from("v2_models").select("model_slug,name,lab_slug,description,status,previous_model_slug,announced_at,released_at,deprecated_at,retired_at,license,input_modalities,output_modalities,metadata,lab:v2_labs!v2_models_lab_slug_fkey(lab_slug,name,country_code,metadata)").in("model_slug", modelIds).eq("hidden", false),
		// Links and arbitrary legacy detail rows do not have V2 tables yet.
		client.from("v2_model_links").select("model_id:model_slug,url,platform:link_kind,kind:link_kind").in("model_slug", modelIds),
		client.from("v2_model_details").select("model_id:model_slug,detail_name,detail_value").in("model_slug", modelIds),
		client.from("v2_benchmark_results").select("result_id,model_slug,benchmark_id,score,is_self_reported,other_info,source_link,rank,benchmark:v2_benchmarks!v2_benchmark_results_benchmark_id_fkey(benchmark_id,name,category,link,ascending_order,benchmark_type)").or(`effective_to.is.null,effective_to.gt.${new Date().toISOString()}`).in("model_slug", modelIds),
		fetchSubscriptionCatalogue(client).then((data) => ({ data, error: null })),
		fetchModelPricingSources(env, modelIds),
	]);
	if (modelsResult.error) throw modelsResult.error;
	if (linksResult.error) throw linksResult.error;
	if (detailsResult.error) throw detailsResult.error;
	if (benchmarkResults.error) throw benchmarkResults.error;
	if (modelPlansResult.error) throw modelPlansResult.error;
	const linksByModel = new Map<string, Array<Record<string, unknown>>>();
	for (const row of linksResult.data ?? []) linksByModel.set(row.model_id, [...(linksByModel.get(row.model_id) ?? []), row]);
	const detailsByModel = new Map<string, Array<Record<string, unknown>>>();
	for (const row of detailsResult.data ?? []) detailsByModel.set(row.model_id, [...(detailsByModel.get(row.model_id) ?? []), row]);
	const benchmarksByModel = new Map<string, Array<Record<string, unknown>>>();
	for (const row of benchmarkResults.data ?? []) {
		const benchmark = Array.isArray(row.benchmark) ? row.benchmark[0] : row.benchmark;
		benchmarksByModel.set(row.model_slug, [...(benchmarksByModel.get(row.model_slug) ?? []), {
			id: row.result_id, benchmark_id: row.benchmark_id, score: row.score, is_self_reported: row.is_self_reported,
			other_info: row.other_info, source_link: row.source_link, rank: row.rank,
			benchmark: benchmark ? { id: benchmark.benchmark_id, name: benchmark.name, category: benchmark.category, link: benchmark.link, ascending_order: benchmark.ascending_order, type: benchmark.benchmark_type } : null,
		}]);
	}
	const comparisonModelRows = (modelsResult.data ?? []).map((row) => {
		const lab = Array.isArray(row.lab) ? row.lab[0] : row.lab;
		return {
			model_id: row.model_slug, name: row.name, organisation_id: row.lab_slug, description: row.description,
			status: row.status, previous_model_id: row.previous_model_slug, announcement_date: row.announced_at,
			release_date: row.released_at, deprecation_date: row.deprecated_at, retirement_date: row.retired_at,
			license: row.license, input_types: row.input_modalities, output_types: row.output_modalities,
			organisation: lab ? { organisation_id: lab.lab_slug, name: lab.name, country_code: lab.country_code } : null,
			model_links: linksByModel.get(row.model_slug) ?? [], model_details: detailsByModel.get(row.model_slug) ?? [],
			benchmark_results: benchmarksByModel.get(row.model_slug) ?? [],
		};
	});
	const planRows = modelPlansResult.data;
	return {
		models: comparisonModelRows as Array<Record<string, unknown>>,
		providerRows: pricing.providerRows,
		pricingRows: pricing.pricingRows,
		modelPlans: (modelPlansResult.data ?? []).flatMap((plan) => (plan.models ?? []).map((row: Record<string, unknown>) => ({ ...row, plan_uuid: plan.plan_uuid, model_id: row.model_id }))) as Array<Record<string, unknown>>,
		plans: planRows as Array<Record<string, unknown>>,
	};
}

publicCompareRouter.get("/compare/selection", async (c) => {
	const modelIds = parseSelection(c.req.query("ids"));
	if (!modelIds) return c.json({ error: "invalid_compare_selection" }, 400);
	if (modelIds.length === 0) return withPublicCache(c.json({ models: [] }), COMPARE_SELECTION_CACHE);
	try {
		const models = composeComparisonModels(modelIds, await loadCompareSources(c.env, modelIds));
		return withPublicCache(c.json({ models }), COMPARE_SELECTION_CACHE);
	} catch (error) {
		console.error("[web-api/compare] selection failed", { modelIds, error });
		return c.json({ error: "compare_selection_unavailable" }, 503);
	}
});

/** The compare page's final shape: headline prices, current routes and benchmarks, already composed. */
publicCompareRouter.get("/compare/view", async (c) => {
	const modelIds = parseSelection(c.req.query("ids"));
	if (!modelIds) return c.json({ error: "invalid_compare_selection" }, 400);
	if (modelIds.length === 0) return withPublicCache(c.json({ models: [], benchmarks: [] }), COMPARE_SELECTION_CACHE);
	try {
		const view = composeCompareView(modelIds, await loadCompareSources(c.env, modelIds));
		return withPublicCache(c.json(view), COMPARE_SELECTION_CACHE);
	} catch (error) {
		console.error("[web-api/compare] view failed", { modelIds, error });
		return c.json({ error: "compare_view_unavailable" }, 503);
	}
});

const COMPARE_CATALOGUE_PAGE_SIZE = 1000;

/**
 * Every public model in the shape the compare page uses. PostgREST returns at
 * most 1,000 rows per request, so read the catalogue in pages.
 */
async function loadCompareCatalogue(env: Env) {
	const client = getDataClient(env);
	const models = [];
	for (let offset = 0; ; offset += COMPARE_CATALOGUE_PAGE_SIZE) {
		const { data, error } = await client
			.from("v2_models")
			.select("model_slug,name,lab_slug,status,announced_at,released_at,deprecated_at,retired_at,input_modalities,output_modalities,license,metadata,lab:v2_labs!v2_models_lab_slug_fkey(lab_slug,name,country_code,metadata)")
			.eq("hidden", false)
			// Names repeat across organisations, so the slug keeps pages stable.
			.order("name", { ascending: true })
			.order("model_slug", { ascending: true })
			.range(offset, offset + COMPARE_CATALOGUE_PAGE_SIZE - 1);
		if (error) throw error;
		for (const row of data ?? []) {
			const organisation = Array.isArray(row.lab) ? row.lab[0] : row.lab;
			models.push({
				id: row.model_slug,
				name: row.name,
				status: row.status ?? null,
				previous_model_id: null,
				description: null,
				announced_date: row.announced_at ?? null,
				release_date: row.released_at ?? null,
				deprecation_date: row.deprecated_at ?? null,
				retirement_date: row.retired_at ?? null,
				open_router_model_id: null,
				input_context_length: null,
				output_context_length: null,
				license: row.license ?? null,
				multimodal: null,
				input_types: row.input_modalities,
				output_types: row.output_modalities,
				web_access: null,
				reasoning: null,
				fine_tunable: null,
				knowledge_cutoff: null,
				api_reference_link: null,
				paper_link: null,
				announcement_link: null,
				repository_link: null,
				weights_link: null,
				parameter_count: null,
				training_tokens: null,
				benchmark_results: null,
				prices: null,
				provider: {
					provider_id: organisation?.lab_slug ?? row.lab_slug,
					name: organisation?.name ?? row.lab_slug,
					website: null,
					country_code: null,
					description: null,
					colour: null,
					socials: [],
				},
				model_details: null,
			});
		}
		if ((data ?? []).length < COMPARE_CATALOGUE_PAGE_SIZE) return models;
	}
}

const ROUTE_PAGE_SIZE = 1000;

/** Models with at least one route Phaseo serves now, so the picker can badge them. */
async function loadRoutedModelIds(env: Env): Promise<Set<string>> {
	const client = getDataClient(env);
	const now = Date.now();
	const routed = new Set<string>();
	for (let offset = 0; ; offset += ROUTE_PAGE_SIZE) {
		const { data, error } = await client
			.from("v2_model_provider_routes")
			.select("provider_model_id,model_slug,effective_from,effective_to")
			.eq("routing_enabled", true)
			.in("status", ["active", "degraded"])
			// neq alone would drop rows whose scope is null.
			.or("access_scope.is.null,access_scope.neq.internal")
			.order("provider_model_id", { ascending: true })
			.range(offset, offset + ROUTE_PAGE_SIZE - 1);
		if (error) throw error;
		for (const row of data ?? []) {
			const from = row.effective_from ? Date.parse(String(row.effective_from)) : Number.NaN;
			const to = row.effective_to ? Date.parse(String(row.effective_to)) : Number.NaN;
			if (Number.isFinite(from) && now < from) continue;
			if (Number.isFinite(to) && now >= to) continue;
			const modelId = String(row.model_slug ?? "").trim();
			if (modelId) routed.add(modelId);
		}
		if ((data ?? []).length < ROUTE_PAGE_SIZE) return routed;
	}
}

publicCompareRouter.get("/compare/models", async (c) => {
	try {
		const models = await loadCompareCatalogue(c.env);
		return withPublicCache(c.json({ models }), COMPARE_CACHE);
	} catch (error) {
		console.error("[web-api/compare] models failed", error);
		return c.json({ error: "compare_models_unavailable" }, 503);
	}
});

/** Only what the compare picker lists and filters on, so browsers can load it when the picker opens. */
publicCompareRouter.get("/compare/options", async (c) => {
	try {
		const [catalogue, routed] = await Promise.all([loadCompareCatalogue(c.env), loadRoutedModelIds(c.env)]);
		const models = catalogue.map((model) => ({
			id: model.id,
			name: model.name,
			status: model.status,
			routed: routed.has(model.id),
			release_date: model.release_date,
			input_types: model.input_types,
			output_types: model.output_types,
			provider: { provider_id: model.provider.provider_id, name: model.provider.name },
		}));
		return withPublicCache(c.json({ models }), COMPARE_CACHE);
	} catch (error) {
		console.error("[web-api/compare] options failed", error);
		return c.json({ error: "compare_options_unavailable" }, 503);
	}
});
