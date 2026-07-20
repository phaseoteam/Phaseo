import { Hono } from "hono";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { withPublicCache } from "@/http/cache";
import { composeComparisonModels } from "@/models/compare";
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

const COMPARE_DETAIL_SELECT = `
	model_id,name,organisation_id,description,status,previous_model_id,
	announcement_date,release_date,deprecation_date,retirement_date,license,
	input_types,output_types,
	organisation:data_organisations!data_models_organisation_id_fkey(organisation_id,name,country_code),
	model_links:data_model_links(url,platform,kind),
	model_details:data_model_details(detail_name,detail_value),
	benchmark_results:data_benchmark_results(id,benchmark_id,score,is_self_reported,other_info,source_link,rank,benchmark:data_benchmarks(id,name,category,link,ascending_order,type))
`;

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

publicCompareRouter.get("/compare/selection", async (c) => {
	const modelIds = parseSelection(c.req.query("ids"));
	if (!modelIds) return c.json({ error: "invalid_compare_selection" }, 400);
	if (modelIds.length === 0) return withPublicCache(c.json({ models: [] }), COMPARE_SELECTION_CACHE);
	try {
		const client = getDataClient(c.env);
		const [modelsResult, modelPlansResult, pricing] = await Promise.all([
			client.from("data_models").select(COMPARE_DETAIL_SELECT).in("model_id", modelIds).eq("hidden", false),
			client.from("data_subscription_plan_models").select("model_id,plan_uuid,model_info,rate_limit,other_info").in("model_id", modelIds),
			fetchModelPricingSources(c.env, modelIds),
		]);
		if (modelsResult.error) throw modelsResult.error;
		if (modelPlansResult.error) throw modelPlansResult.error;
		const planUuids = [...new Set((modelPlansResult.data ?? []).map((row) => String(row.plan_uuid ?? "").trim()).filter(Boolean))];
		const plansResult = planUuids.length > 0
			? await client.from("data_subscription_plans")
				.select("plan_uuid,plan_id,name,organisation_id,description,frequency,price,currency,link,organisation:data_organisations!organisation_id(organisation_id,name,colour)")
				.in("plan_uuid", planUuids).order("plan_id", { ascending: true }).order("frequency", { ascending: true })
			: { data: [], error: null };
		if (plansResult.error) throw plansResult.error;
		const models = composeComparisonModels(modelIds, {
			models: (modelsResult.data ?? []) as Array<Record<string, unknown>>,
			providerRows: pricing.providerRows,
			pricingRows: pricing.pricingRows,
			modelPlans: (modelPlansResult.data ?? []) as Array<Record<string, unknown>>,
			plans: (plansResult.data ?? []) as Array<Record<string, unknown>>,
		});
		return withPublicCache(c.json({ models }), COMPARE_SELECTION_CACHE);
	} catch (error) {
		console.error("[web-api/compare] selection failed", { modelIds, error });
		return c.json({ error: "compare_selection_unavailable" }, 503);
	}
});

publicCompareRouter.get("/compare/models", async (c) => {
	try {
		const { data, error } = await getDataClient(c.env)
			.from("data_models")
			.select("model_id,name,organisation_id,status,announcement_date,release_date,deprecation_date,retirement_date,input_types,output_types,organisation:data_organisations!data_models_organisation_id_fkey(organisation_id,name)")
			.eq("hidden", false)
			.order("name", { ascending: true });
		if (error) throw error;

		const models = (data ?? []).map((row) => {
			const organisation = Array.isArray(row.organisation)
				? row.organisation[0]
				: row.organisation;
			return {
				id: row.model_id,
				name: row.name,
				status: row.status ?? null,
				previous_model_id: null,
				description: null,
				announced_date: row.announcement_date ?? null,
				release_date: row.release_date ?? null,
				deprecation_date: row.deprecation_date ?? null,
				retirement_date: row.retirement_date ?? null,
				open_router_model_id: null,
				input_context_length: null,
				output_context_length: null,
				license: null,
				multimodal: null,
				input_types: row.input_types,
				output_types: row.output_types,
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
					provider_id: organisation?.organisation_id ?? row.organisation_id,
					name: organisation?.name ?? row.organisation_id,
					website: null,
					country_code: null,
					description: null,
					colour: null,
					socials: [],
				},
				model_details: null,
			};
		});

		return withPublicCache(c.json({ models }), COMPARE_CACHE);
	} catch (error) {
		console.error("[web-api/compare] models failed", error);
		return c.json({ error: "compare_models_unavailable" }, 503);
	}
});
