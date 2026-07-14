import { Hono } from "hono";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { withPublicCache, type PublicCachePolicy } from "@/http/cache";

const CACHE_PROFILES = {
	catalogue: {
		edgeTtlSeconds: 5 * 60,
		staleWhileRevalidateSeconds: 5 * 60,
		cacheTags: ["web-api-models"],
	},
	overview: {
		edgeTtlSeconds: 24 * 60 * 60,
		staleWhileRevalidateSeconds: 7 * 24 * 60 * 60,
		cacheTags: ["web-api-model-details"],
	},
	benchmarks: {
		edgeTtlSeconds: 24 * 60 * 60,
		staleWhileRevalidateSeconds: 7 * 24 * 60 * 60,
		cacheTags: ["web-api-model-benchmarks"],
	},
	timeline: {
		edgeTtlSeconds: 24 * 60 * 60,
		staleWhileRevalidateSeconds: 7 * 24 * 60 * 60,
		cacheTags: ["web-api-model-timelines"],
	},
	subscriptions: {
		edgeTtlSeconds: 24 * 60 * 60,
		staleWhileRevalidateSeconds: 7 * 24 * 60 * 60,
		cacheTags: ["web-api-model-subscriptions"],
	},
	pricing: {
		edgeTtlSeconds: 60 * 60,
		staleWhileRevalidateSeconds: 24 * 60 * 60,
		cacheTags: ["web-api-model-pricing"],
	},
	performance: {
		edgeTtlSeconds: 15 * 60,
		staleWhileRevalidateSeconds: 15 * 60,
		cacheTags: ["web-api-model-performance"],
	},
} as const satisfies Record<string, PublicCachePolicy>;

const MODEL_OVERVIEW_SELECT = `
	model_id, name, organisation_id, description, status, previous_model_id,
	announcement_date, release_date, deprecation_date, retirement_date, license,
	input_types, output_types, family_id, timeline, updated_at,
	organisation:data_organisations!data_models_organisation_id_fkey(name, country_code),
	model_links:data_model_links(url, platform, kind, title),
	model_family:data_model_families(family_name),
	model_details:data_model_details(detail_name, detail_value)
`;

function parseBoundedInt(value: string | null, fallback: number, maximum: number) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.max(0, Math.min(maximum, Math.floor(parsed)));
}

function modelTag(modelId: string) {
	return `web-api-model-${encodeURIComponent(modelId).replace(/%/g, "")}`.slice(0, 128);
}

function toStringList(value: unknown): string[] {
	if (Array.isArray(value)) return value.map((item) => String(item ?? "").trim()).filter(Boolean);
	if (typeof value !== "string") return [];
	const trimmed = value.trim();
	if (!trimmed) return [];
	return (trimmed.startsWith("{") && trimmed.endsWith("}")
		? trimmed.slice(1, -1).split(",")
		: trimmed.split(/[\s,]+/))
		.map((item) => item.trim().replace(/^"|"$/g, ""))
		.filter(Boolean);
}

function normaliseGatewayStatus(value: unknown, isActive: unknown): string {
	const status = String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
	if (status === "disabled" || status === "inactive" || status.startsWith("deranked")) return status;
	if (status && status !== "active") return status;
	return isActive ? "active" : "inactive";
}

function collectJsonTokens(value: unknown, tokens: string[] = []): string[] {
	if (Array.isArray(value)) {
		for (const item of value) collectJsonTokens(item, tokens);
	} else if (value && typeof value === "object") {
		for (const [key, item] of Object.entries(value)) {
			tokens.push(key);
			collectJsonTokens(item, tokens);
		}
	} else if (value !== null && value !== undefined) {
		tokens.push(String(value));
	}
	return tokens;
}

function gatewayFeatures(params: unknown): string[] {
	const features = new Set<string>();
	for (const token of collectJsonTokens(params)) {
		const value = token.toLowerCase().replace(/[\s-]+/g, "_");
		if (value.includes("reasoning") || value.includes("thinking")) features.add("reasoning");
		if (value.includes("tool") || value.includes("function_call")) features.add("tools");
		if (value.includes("structured_output") || value.includes("json_schema")) features.add("structured_outputs");
		if (value.includes("web_search") || value.includes("websearch")) features.add("web_search");
	}
	return [...features].sort();
}

function supportedParameters(params: unknown): string[] {
	if (!params || typeof params !== "object") return [];
	const source = params as Record<string, unknown>;
	const properties = source.properties;
	if (properties && typeof properties === "object" && !Array.isArray(properties)) {
		return Object.keys(properties as Record<string, unknown>).sort();
	}
	return Object.keys(source)
		.filter((key) => !["type", "title", "description", "default", "required", "properties"].includes(key))
		.sort();
}

function numberOrNull(value: unknown): number | null {
	const number = Number(value);
	return Number.isFinite(number) ? number : null;
}

type ModelsCatalogueVersion = "v1" | "v2";

async function fetchGatewayMonitorRows(
	env: Env,
	catalogueVersion: ModelsCatalogueVersion = "v1",
): Promise<Map<string, Record<string, unknown>[]>> {
	const client = getDataClient(env);
	const rows: Record<string, unknown>[] = [];
	const rpcName =
		catalogueVersion === "v2"
			? "get_monitor_model_rows_v2"
			: "get_monitor_model_rows";
	for (let offset = 0; ; offset += 1000) {
		const { data, error } = await client
			.rpc(rpcName, { p_include_hidden: false })
			.range(offset, offset + 999);
		if (error) throw error;
		const page = (data ?? []) as Record<string, unknown>[];
		rows.push(...page.filter((row) => String(row.capability_status ?? "").toLowerCase() !== "internal_testing"));
		if (page.length < 1000) break;
	}

	const byModelId = new Map<string, Record<string, unknown>[]>();
	for (const row of rows) {
		const modelId = String(row.model_id ?? row.api_model_id ?? "").trim();
		const providerId = String(row.provider_id ?? "").trim();
		const apiModelId = String(row.api_model_id ?? "").trim();
		const capabilityId = String(row.capability_id ?? "").trim();
		if (!modelId || !providerId || !apiModelId || !capabilityId) continue;
		const params = row.capability_params;
		const monitorRow = {
			id: `${modelId}-${providerId}-${capabilityId}`,
			model: String(row.model_name ?? modelId).trim() || modelId,
			modelId,
			apiModelId,
			organisationId: row.organisation_id ?? undefined,
			organisationName: row.organisation_name ?? undefined,
			provider: {
				name: String(row.api_provider_name ?? providerId).trim() || providerId,
				id: providerId,
				inputPrice: numberOrNull(row.input_price) ?? 0,
				outputPrice: numberOrNull(row.output_price) ?? 0,
				standardInputPrice: numberOrNull(row.standard_input_price),
				standardOutputPrice: numberOrNull(row.standard_output_price),
				standardInputPriceLabel: row.standard_input_price_label ?? null,
				standardInputPriceUnit: row.standard_input_price_unit ?? null,
				standardOutputPriceLabel: row.standard_output_price_label ?? null,
				standardOutputPriceUnit: row.standard_output_price_unit ?? null,
				fromPrice: numberOrNull(row.from_price),
				fromPriceUnit: row.from_price_unit ?? null,
				pricingDetailRows: [],
				features: gatewayFeatures(params),
			},
			endpoint: capabilityId,
			gatewayStatus: normaliseGatewayStatus(row.capability_status, row.is_active_gateway),
			inputModalities: toStringList(row.input_modalities).length ? toStringList(row.input_modalities) : toStringList(row.model_input_types),
			outputModalities: toStringList(row.output_modalities).length ? toStringList(row.output_modalities) : toStringList(row.model_output_types),
			context: numberOrNull(row.context_length) ?? numberOrNull(row.capability_max_input_tokens) ?? 0,
			maxOutput: numberOrNull(row.provider_max_output_tokens) ?? numberOrNull(row.capability_max_output_tokens) ?? 0,
			quantization: row.quantization_scheme ?? undefined,
			supportedParameters: supportedParameters(params),
			effectiveFrom: row.effective_from ?? undefined,
			tier: row.is_free_variant ? "free" : String(row.pricing_tier ?? "standard"),
			added: row.model_release_date ?? undefined,
			retired: row.model_retirement_date ?? undefined,
			weeklyTokensModel: numberOrNull(row.weekly_tokens_model),
			weeklyTokensModelProvider: numberOrNull(row.weekly_tokens_model_provider),
			weeklyThroughputModel: numberOrNull(row.weekly_throughput_model),
			weeklyLatencyModel: numberOrNull(row.weekly_latency_model),
		};
		byModelId.set(modelId, [...(byModelId.get(modelId) ?? []), monitorRow]);
	}
	return byModelId;
}

async function matchCachedCatalogue(request: Request): Promise<Response | null> {
	if (typeof caches === "undefined") return null;
	try {
		const response = await (caches as unknown as { default: Cache }).default.match(request);
		if (!response) return null;
		const headers = new Headers(response.headers);
		headers.set("X-Phaseo-Local-Cache", "HIT");
		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers,
		});
	} catch {
		return null;
	}
}

async function storeCatalogueInCache(request: Request, response: Response): Promise<void> {
	if (typeof caches === "undefined") return;
	try {
		await (caches as unknown as { default: Cache }).default.put(request, response.clone());
	} catch {
		// Cloudflare's CDN headers remain the shared-cache fallback if a local
		// Cache API write is unavailable or rejected.
	}
}

function sectionPolicy(section: keyof typeof CACHE_PROFILES, modelId?: string): PublicCachePolicy {
	const profile = CACHE_PROFILES[section];
	return {
		...profile,
		cacheTags: modelId ? [...profile.cacheTags, modelTag(modelId)] : profile.cacheTags,
	};
}

function cataloguePolicy(catalogueVersion: ModelsCatalogueVersion): PublicCachePolicy {
	const policy = sectionPolicy("catalogue");
	return catalogueVersion === "v2"
		? { ...policy, cacheTags: [...(policy.cacheTags ?? []), "web-api-models-v2"] }
		: policy;
}

function notFound(c: { json: (value: unknown, status: number) => Response }) {
	return c.json({ error: "model_not_found" }, 404);
}

export const publicModelsRouter = new Hono<{ Bindings: Env }>();

/** Main models API. Deliberately excludes volatile benchmark/performance data. */
publicModelsRouter.get("/", async (c) => {
	const cached = await matchCachedCatalogue(c.req.raw);
	if (cached) return cached;
	try {
		const requestedVersion = c.req.query("catalogue_version")?.trim().toLowerCase();
		if (requestedVersion && requestedVersion !== "v1" && requestedVersion !== "v2") {
			return c.json({ error: "invalid_catalogue_version" }, 400);
		}
		const catalogueVersion: ModelsCatalogueVersion =
			requestedVersion === "v2" ? "v2" : "v1";
		const limit = Math.max(1, parseBoundedInt(c.req.query("limit"), 100, 2_000));
		const offset = parseBoundedInt(c.req.query("offset"), 0, 10_000);
		const search = c.req.query("search")?.trim();
		const gatewayRowsByModelId = await fetchGatewayMonitorRows(
			c.env,
			catalogueVersion,
		);
		const table = catalogueVersion === "v2" ? "data_models_v2" : "data_models";
		const select = catalogueVersion === "v2"
			? "model_id,full_name,organisation_id,description,status,release_date,announcement_date,updated_at,input_modalities,output_modalities,organisation:data_organisations!data_models_v2_organisation_id_fkey(name,colour)"
			: "model_id,name,organisation_id,description,status,release_date,announcement_date,updated_at,input_types,output_types,organisation:data_organisations(name,colour)";
		const createQuery = () => {
			let query = getDataClient(c.env)
				.from(table)
				.select(select, { count: "exact" })
				.eq("hidden", false)
				.order(catalogueVersion === "v2" ? "full_name" : "name", {
					ascending: true,
				});
			if (search) {
				query = query.ilike(
					catalogueVersion === "v2" ? "full_name" : "name",
					`%${search.replace(/[%_]/g, "\\$&")}%`,
				);
			}
			return query;
		};

		// Supabase returns at most 1,000 rows per REST request. Assemble a larger
		// requested page here so callers still receive one canonical API response.
		const databasePageSize = 1_000;
		const rows: Record<string, unknown>[] = [];
		let count = 0;
		for (let pageOffset = offset; pageOffset < offset + limit; pageOffset += databasePageSize) {
			const { data, error, count: pageCount } = await createQuery().range(
				pageOffset,
				Math.min(pageOffset + databasePageSize - 1, offset + limit - 1),
			);
			if (error) throw error;
			if (pageOffset === offset) count = pageCount ?? 0;
			const page = (data ?? []) as Record<string, unknown>[];
			rows.push(...page);
			if (page.length < databasePageSize) break;
		}

		const models = rows.map((model) => ({
			...model,
			...(catalogueVersion === "v2"
				? {
					name: model.full_name,
					input_types: model.input_modalities,
					output_types: model.output_modalities,
				}
				: {}),
			gateway_monitor_rows:
				gatewayRowsByModelId.get(String(model.model_id ?? "")) ?? [],
		}));
		const response = withPublicCache(
			c.json({ models, total: count, limit, offset, catalogue_version: catalogueVersion }),
			cataloguePolicy(catalogueVersion),
		);
		await storeCatalogueInCache(c.req.raw, response);
		return response;
	} catch (error) {
		console.error("[web-api/models] catalogue failed", error);
		return c.json({ error: "models_unavailable" }, 503);
	}
});

/** Stable model facts used by the overview, about, timeline, and SEO surfaces. */
publicModelsRouter.get("/:modelId", async (c) => {
	const modelId = c.req.param("modelId");
	try {
		const { data, error } = await getDataClient(c.env)
			.from("data_models")
			.select(MODEL_OVERVIEW_SELECT)
			.eq("model_id", modelId)
			.eq("hidden", false)
			.maybeSingle();
		if (error) throw error;
		if (!data) return notFound(c);
		return withPublicCache(c.json({ model: data }), sectionPolicy("overview", modelId));
	} catch (error) {
		console.error("[web-api/models] overview failed", { modelId, error });
		return c.json({ error: "model_unavailable" }, 503);
	}
});

/** Benchmark results are isolated so their long-lived cache never holds up live performance data. */
publicModelsRouter.get("/:modelId/benchmarks", async (c) => {
	const modelId = c.req.param("modelId");
	try {
		const { data, error } = await getDataClient(c.env)
			.from("data_models")
			.select(`model_id,benchmark_results:data_benchmark_results(id,benchmark_id,score,is_self_reported,other_info,source_link,created_at,updated_at,rank,benchmark:data_benchmarks(id,name,category,link,total_models,ascending_order,type))`)
			.eq("model_id", modelId)
			.eq("hidden", false)
			.maybeSingle();
		if (error) throw error;
		if (!data) return notFound(c);
		return withPublicCache(c.json({ modelId: data.model_id, results: data.benchmark_results ?? [] }), sectionPolicy("benchmarks", modelId));
	} catch (error) {
		console.error("[web-api/models] benchmarks failed", { modelId, error });
		return c.json({ error: "benchmarks_unavailable" }, 503);
	}
});

publicModelsRouter.get("/:modelId/timeline", async (c) => {
	const modelId = c.req.param("modelId");
	try {
		const client = getDataClient(c.env);
		const { data: model, error } = await client
			.from("data_models")
			.select("model_id,name,previous_model_id,announcement_date,release_date,deprecation_date,retirement_date")
			.eq("model_id", modelId)
			.eq("hidden", false)
			.maybeSingle();
		if (error) throw error;
		if (!model) return notFound(c);
		const [previousResult, futureResult] = await Promise.all([
			model.previous_model_id
				? client.from("data_models").select("model_id,name,announcement_date,release_date").eq("model_id", model.previous_model_id).eq("hidden", false).maybeSingle()
				: Promise.resolve({ data: null, error: null }),
			client.from("data_models").select("model_id,name,announcement_date,release_date").eq("previous_model_id", modelId).eq("hidden", false),
		]);
		if (previousResult.error) throw previousResult.error;
		if (futureResult.error) throw futureResult.error;
		const events: Array<Record<string, string>> = [];
		for (const [date, eventName] of [[model.announcement_date, "Announced"], [model.release_date, "Released"], [model.deprecation_date, "Deprecated"], [model.retirement_date, "Retired"]] as const) {
			if (date) events.push({ date, eventType: "ModelEvent", eventName });
		}
		const previous = previousResult.data;
		const previousDate = previous?.release_date ?? previous?.announcement_date;
		if (previous && previousDate) events.push({ date: previousDate, eventType: "PreviousModel", modelId: previous.model_id, modelName: previous.name ?? previous.model_id });
		const future = (futureResult.data ?? [])
			.map((candidate) => ({ candidate, date: candidate.release_date ?? candidate.announcement_date }))
			.filter((entry): entry is { candidate: NonNullable<typeof entry.candidate>; date: string } => Boolean(entry.date))
			.sort((left, right) => left.date.localeCompare(right.date))[0];
		if (future) events.push({ date: future.date, eventType: "FutureModel", modelId: future.candidate.model_id, modelName: future.candidate.name ?? future.candidate.model_id });
		events.sort((left, right) => right.date.localeCompare(left.date));
		return withPublicCache(c.json({ events }), sectionPolicy("timeline", modelId));
	} catch (error) {
		console.error("[web-api/models] timeline failed", { modelId, error });
		return c.json({ error: "timeline_unavailable" }, 503);
	}
});

publicModelsRouter.get("/:modelId/subscription-plans", async (c) => {
	const modelId = c.req.param("modelId");
	try {
		const client = getDataClient(c.env);
		const { data: model, error: modelError } = await client.from("data_models").select("model_id").eq("model_id", modelId).eq("hidden", false).maybeSingle();
		if (modelError) throw modelError;
		if (!model) return notFound(c);
		const { data: modelPlans, error: modelPlansError } = await client.from("data_subscription_plan_models").select("plan_uuid,model_info,rate_limit,other_info").eq("model_id", modelId);
		if (modelPlansError) throw modelPlansError;
		if (!modelPlans?.length) return withPublicCache(c.json({ subscription_plans: [] }), sectionPolicy("subscriptions", modelId));
		const { data: planRows, error: planError } = await client
			.from("data_subscription_plans")
			.select("plan_uuid,plan_id,name,organisation_id,description,frequency,price,currency,link,other_info,created_at,updated_at,organisation:data_organisations!organisation_id(organisation_id,name,colour)")
			.in("plan_uuid", modelPlans.map((plan) => plan.plan_uuid))
			.order("plan_id", { ascending: true })
			.order("frequency", { ascending: true });
		if (planError) throw planError;
		const grouped = new Map<string, Record<string, unknown>>();
		for (const row of planRows ?? []) {
			const modelPlan = modelPlans.find((plan) => plan.plan_uuid === row.plan_uuid);
			const plan = grouped.get(row.plan_id) ?? {
				plan_id: row.plan_id, plan_uuid: row.plan_uuid, name: row.name, organisation_id: row.organisation_id,
				description: row.description, link: row.link, other_info: row.other_info, created_at: row.created_at,
				updated_at: row.updated_at, organisation: Array.isArray(row.organisation) ? row.organisation[0] ?? null : row.organisation ?? null,
				prices: [], model_info: { model_info: modelPlan?.model_info, rate_limit: modelPlan?.rate_limit, other_info: modelPlan?.other_info },
			};
			(plan.prices as Array<Record<string, unknown>>).push({ price: row.price, currency: row.currency, frequency: row.frequency });
			grouped.set(row.plan_id, plan);
		}
		return withPublicCache(c.json({ subscription_plans: Array.from(grouped.values()) }), sectionPolicy("subscriptions", modelId));
	} catch (error) {
		console.error("[web-api/models] subscription plans failed", { modelId, error });
		return c.json({ error: "model_subscription_plans_unavailable" }, 503);
	}
});

/** Pricing changes independently from model metadata, so it intentionally has its own shorter cache. */
publicModelsRouter.get("/:modelId/pricing", async (c) => {
	const modelId = c.req.param("modelId");
	try {
		const client = getDataClient(c.env);
		const { data: model, error: modelError } = await client.from("data_models").select("model_id").eq("model_id", modelId).eq("hidden", false).maybeSingle();
		if (modelError) throw modelError;
		if (!model) return notFound(c);
		const { data: providerModels, error: providerModelsError } = await client
			.from("data_api_provider_models")
			.select("provider_api_model_id,provider_id,api_model_id,model_id,provider_model_slug,is_active_gateway,effective_from,effective_to,provider:data_api_providers(api_provider_id,api_provider_name,colour,country_code)")
			.eq("model_id", modelId);
		if (providerModelsError) throw providerModelsError;
		const providerModelIds = (providerModels ?? []).map((row) => row.provider_api_model_id).filter((id): id is string => Boolean(id));
		const { data: capabilities, error: capabilitiesError } = providerModelIds.length
			? await client.from("data_api_provider_model_capabilities").select("provider_api_model_id,capability_id,status").in("provider_api_model_id", providerModelIds)
			: { data: [], error: null };
		if (capabilitiesError) throw capabilitiesError;
		const providerById = new Map((providerModels ?? []).map((row) => [row.provider_api_model_id, row]));
		const modelKeys = (capabilities ?? [])
			.filter((capability) => capability.status !== "disabled")
			.map((capability) => {
				const providerModel = providerById.get(capability.provider_api_model_id);
				return providerModel && capability.capability_id ? `${providerModel.provider_id}:${providerModel.api_model_id}:${capability.capability_id}` : null;
			})
			.filter((key): key is string => Boolean(key));
		const { data: pricingRules, error: pricingError } = modelKeys.length
			? await client.from("data_api_pricing_rules").select("rule_id,model_key,capability_id,pricing_plan,meter,unit,unit_size,price_per_unit,currency,priority,effective_from,effective_to,note,match").in("model_key", modelKeys).order("priority", { ascending: true }).order("effective_from", { ascending: false })
			: { data: [], error: null };
		if (pricingError) throw pricingError;
		const now = Date.now();
		const activeRules = (pricingRules ?? []).filter((rule) => {
			const from = rule.effective_from ? Date.parse(rule.effective_from) : Number.NEGATIVE_INFINITY;
			const to = rule.effective_to ? Date.parse(rule.effective_to) : Number.POSITIVE_INFINITY;
			return now >= from && now < to;
		});
		return withPublicCache(c.json({ modelId, provider_models: providerModels ?? [], pricing_rules: activeRules }), sectionPolicy("pricing", modelId));
	} catch (error) {
		console.error("[web-api/models] pricing failed", { modelId, error });
		return c.json({ error: "pricing_unavailable" }, 503);
	}
});

/** 15-minute cache for the live-ish performance rollup; raw RPC payload preserves the source fidelity. */
publicModelsRouter.get("/:modelId/performance", async (c) => {
	const modelId = c.req.param("modelId");
	try {
		const { data, error } = await getDataClient(c.env).rpc("get_model_performance_overview", {
			p_model_id: modelId,
		});
		if (error) throw error;
		return withPublicCache(c.json({ modelId, performance: data?.[0] ?? null }), sectionPolicy("performance", modelId));
	} catch (error) {
		console.error("[web-api/models] performance failed", { modelId, error });
		return c.json({ error: "performance_unavailable" }, 503);
	}
});
