import { Hono } from "hono";
import { requireUser } from "@/auth/requireUser";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { fetchModelPricingSources } from "@/models/pricing";
import { z } from "zod";

const CANONICAL_SERVICE_TIERS = ["standard", "priority", "batch", "flex"] as const;

const catalogMutationSchemas = {
	organisations: z.object({ organisation_id: z.string().trim().min(1).optional(), name: z.string().trim().min(1), description: z.string().nullable().optional(), country_code: z.string().trim().min(2).max(3).nullable().optional(), colour: z.string().nullable().optional(), social_links: z.array(z.object({ platform: z.string().trim().min(1), url: z.url() })).default([]) }),
	providers: z.object({ api_provider_id: z.string().trim().min(1).optional(), api_provider_name: z.string().trim().min(1), description: z.string().nullable().optional(), link: z.string().nullable().optional(), country_code: z.string().trim().min(2).max(3).nullable().optional(), default_execution_regions: z.array(z.string().trim().min(1)).optional(), byok_available: z.boolean().optional(), prompt_training_policy: z.string().nullable().optional(), prompt_training_notes: z.string().nullable().optional(), prompt_training_source_url: z.string().nullable().optional(), data_policy_tier: z.string().nullable().optional(), data_policy_confidence: z.string().nullable().optional(), data_policy_contract_mode: z.string().nullable().optional(), data_policy_contract_notes: z.string().nullable().optional(), status: z.string().nullable().optional() }),
	benchmarks: z.object({ id: z.string().trim().min(1).optional(), name: z.string().trim().min(1), category: z.string().nullable().optional(), link: z.string().nullable().optional(), ascending_order: z.boolean().nullable().optional() }),
	"subscription-plans": z.object({ plan_uuid: z.uuid().optional(), plan_id: z.string().trim().min(1), name: z.string().trim().min(1), organisation_id: z.string().nullable().optional(), description: z.string().nullable().optional(), frequency: z.string().nullable().optional(), price: z.number().finite().nullable().optional(), currency: z.string().nullable().optional(), link: z.string().nullable().optional(), other_info: z.record(z.string(), z.unknown()).default({}) }),
	models: z.object({ modelId: z.string().trim().min(1).optional(), name: z.string().trim().min(1), organisationId: z.string().trim().min(1).optional(), familyId: z.string().nullable().optional(), status: z.string().nullable().optional(), hidden: z.boolean().optional(), inputTypes: z.union([z.string(), z.array(z.string())]).nullable().optional(), outputTypes: z.union([z.string(), z.array(z.string())]).nullable().optional(), announcementDate: z.string().nullable().optional(), releaseDate: z.string().nullable().optional(), deprecationDate: z.string().nullable().optional(), retirementDate: z.string().nullable().optional(), license: z.string().nullable().optional(), previousModelId: z.string().nullable().optional() }),
} as const;

export const accountModelsRouter = new Hono<{ Bindings: Env }>();

const pricingMeterSchema = z.object({
	meter_key: z.string().trim().min(1).max(120).regex(/^[a-z0-9][a-z0-9._:-]*$/),
	modality: z.string().trim().min(1).max(40),
	direction: z.enum(["input", "output"]).nullable().optional(),
	unit: z.string().trim().min(1).max(80),
	unit_quantity: z.number().finite().positive(),
	price_nanos: z.number().int().nonnegative(),
	display_label: z.string().trim().min(1).max(120),
	display_unit: z.string().trim().min(1).max(120),
	billable: z.boolean().default(true),
	meter_order: z.number().int().min(0).max(10000).default(100),
	metadata: z.record(z.string(), z.unknown()).default({}),
});

const pricingSkuSchema = z.object({
	sku_id: z.uuid().optional(),
	provider_model_id: z.string().trim().min(1).max(240),
	sku_code: z.string().trim().min(1).max(160).regex(/^[a-z0-9][a-z0-9._:-]*$/),
	version: z.number().int().positive().default(1),
	operation: z.string().trim().min(1).max(120).default("inference"),
	status: z.enum(["draft", "active", "deprecated", "disabled"]).default("active"),
	region: z.string().trim().max(80).nullable().optional(),
	service_tier_slug: z.string().trim().min(1).max(120).default("standard"),
	display_name: z.string().trim().min(1).max(200),
	description: z.string().trim().max(2000).nullable().optional(),
	currency: z.string().trim().length(3).default("USD"),
	effective_from: z.iso.datetime({ offset: true }),
	effective_to: z.iso.datetime({ offset: true }).nullable().optional(),
	metadata: z.record(z.string(), z.unknown()).default({}),
	meters: z.array(pricingMeterSchema).min(1).max(100),
}).superRefine((sku, context) => {
	if (sku.effective_to && new Date(sku.effective_to) <= new Date(sku.effective_from)) {
		context.addIssue({ code: "custom", path: ["effective_to"], message: "Effective end must be after effective start" });
	}
	const meterKeys = new Set<string>();
	for (const [index, meter] of sku.meters.entries()) {
		if (meterKeys.has(meter.meter_key)) context.addIssue({ code: "custom", path: ["meters", index, "meter_key"], message: "Meter keys must be unique within a SKU" });
		meterKeys.add(meter.meter_key);
	}
});

const modelGraphSchema = z.object({
	modelId: z.string().trim().min(1),
	name: z.string().trim().min(1).optional(),
	organisation_id: z.string().trim().min(1).optional(),
	status: z.string().nullable().optional(), hidden: z.boolean().optional(), license: z.string().nullable().optional(),
	announcement_date: z.string().nullable().optional(), release_date: z.string().nullable().optional(), deprecation_date: z.string().nullable().optional(), retirement_date: z.string().nullable().optional(),
	input_types: z.string().nullable().optional(), output_types: z.string().nullable().optional(), previous_model_id: z.string().nullable().optional(), family_id: z.string().nullable().optional(),
	model_details: z.array(z.object({ detail_name: z.string().trim().min(1), detail_value: z.unknown() })).optional(),
	links: z.array(z.object({ platform: z.string().optional(), kind: z.string().optional(), title: z.string().optional(), url: z.url() })).optional(),
	benchmark_results: z.array(z.record(z.string(), z.unknown())).optional(), subscription_plan_models: z.array(z.record(z.string(), z.unknown())).optional(),
	provider_models: z.array(z.record(z.string(), z.unknown())).optional(), provider_capabilities: z.array(z.record(z.string(), z.unknown())).optional(),
}).passthrough();

const providerRouteSchema = z.object({
	provider_model_id: z.string().trim().min(1).optional(),
	provider_slug: z.string().trim().min(1),
	provider_model_slug: z.string().trim().min(1),
	status: z.enum(["active", "degraded", "disabled", "retired"]).default("active"),
	provider_availability_status: z.enum(["unknown", "coming_soon", "preview", "available", "limited_access", "deprecated", "removed"]).optional(),
	phaseo_status: z.enum(["unsupported", "planned", "implementing", "testing", "enabled", "disabled", "blocked"]).optional(),
	access_scope: z.enum(["public", "internal"]).optional(),
	routing_enabled: z.boolean().default(false),
	input_modalities: z.array(z.string()).default([]), output_modalities: z.array(z.string()).default([]), regions: z.array(z.string()).default([]),
	context_length: z.number().int().positive().nullable().optional(), max_output_tokens: z.number().int().positive().nullable().optional(),
	effective_from: z.iso.datetime({ offset: true }).nullable().optional(), effective_to: z.iso.datetime({ offset: true }).nullable().optional(),
	metadata: z.record(z.string(), z.unknown()).default({}),
}).superRefine((route, context) => {
	if (!route.routing_enabled) return;
	if (route.phaseo_status !== "enabled") context.addIssue({ code: "custom", path: ["phaseo_status"], message: "Routing requires an enabled Phaseo integration" });
	if (route.access_scope !== "public") context.addIssue({ code: "custom", path: ["access_scope"], message: "Routing requires public access" });
	if (!route.provider_availability_status || !["available", "preview", "limited_access"].includes(route.provider_availability_status)) context.addIssue({ code: "custom", path: ["provider_availability_status"], message: "Routing requires an available provider model" });
});

const modelNoticeSchema = z.object({
	tone: z.enum(["info", "warning", "critical"]),
	markdown: z.string().max(20_000),
});

const modelAliasesSchema = z.array(z.object({
	alias_slug: z.string().trim().min(1).max(240).regex(/^[a-z0-9][a-z0-9._:/+@-]*$/),
	alias_type: z.string().trim().min(1).max(80).default("public"),
	enabled: z.boolean().default(true),
	effective_from: z.iso.datetime({ offset: true }).nullable().optional(),
	effective_to: z.iso.datetime({ offset: true }).nullable().optional(),
	metadata: z.record(z.string(), z.unknown()).default({}),
}));

async function requireAdmin(request: Request, env: Env) {
	const user = await requireUser(request, env);
	if (!user) return null;
	const client = getDataClient(env);
	const role = await client.from("users").select("role").eq("user_id", user.id).maybeSingle();
	return !role.error && String(role.data?.role ?? "").toLowerCase() === "admin" ? client : null;
}

async function requireAdminContext(request: Request, env: Env) {
	const user = await requireUser(request, env);
	if (!user) return { status: 401 as const, context: null };
	const client = getDataClient(env);
	const role = await client.from("users").select("role").eq("user_id", user.id).maybeSingle();
	if (role.error || String(role.data?.role ?? "").toLowerCase() !== "admin") {
		return { status: 403 as const, context: null };
	}
	return { status: 200 as const, context: { user, client } };
}

async function fetchAllRows<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, pageSize = 1000): Promise<T[]> {
	const rows: T[] = [];
	for (let from = 0; ; from += pageSize) {
		const result = await fetchPage(from, from + pageSize - 1);
		if (result.error) throw result.error;
		const page = result.data ?? [];
		rows.push(...page);
		if (page.length < pageSize) return rows;
	}
}

async function fetchPricingSourceRows(client: ReturnType<typeof getDataClient>, providerRows: any[]): Promise<any[]> {
	const [skus, meters] = await Promise.all([
		fetchAllRows<any>((from, to) => client.from("v2_pricing_skus").select("sku_id,provider_model_id,operation,service_tier_slug,currency,effective_from,effective_to,metadata,description").range(from, to)),
		fetchAllRows<any>((from, to) => client.from("v2_pricing_sku_meters").select("sku_meter_id,sku_id,meter_key,unit,unit_quantity,price_nanos,meter_order,metadata").eq("billable", true).range(from, to)),
	]);
	const routes = new Map(providerRows.map((row) => [String(row.provider_api_model_id ?? ""), row]));
	const skuById = new Map(skus.map((sku) => [String(sku.sku_id ?? ""), sku]));
	return meters.flatMap((meter) => {
		const sku = skuById.get(String(meter.sku_id ?? ""));
		const route = sku ? routes.get(String(sku.provider_model_id ?? "")) : null;
		if (!sku || !route) return [];
		const skuMetadata = sku.metadata && typeof sku.metadata === "object" ? sku.metadata : {};
		const meterMetadata = meter.metadata && typeof meter.metadata === "object" ? meter.metadata : {};
		return [{
			rule_id: String(meter.sku_meter_id),
			provider_id: route.provider_id,
			api_model_id: route.api_model_id,
			model_key: `${route.provider_id}:${route.api_model_id}:${sku.operation}`,
			capability_id: sku.operation,
			pricing_plan: sku.service_tier_slug ?? "standard",
			meter: meter.meter_key,
			unit: meter.unit,
			unit_size: meter.unit_quantity,
			price_per_unit: Number(meter.price_nanos) / 1_000_000_000,
			currency: sku.currency,
			priority: meter.meter_order,
			effective_from: sku.effective_from,
			effective_to: sku.effective_to,
			match: skuMetadata.match ?? meterMetadata.match ?? [],
			billing_timestamp_basis: skuMetadata.billing_timestamp_basis ?? "request_start",
			time_windows: skuMetadata.time_windows ?? [],
			note: meterMetadata.note ?? sku.description ?? null,
		}];
	});
}

accountModelsRouter.get("/audit/source", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = await requireAdmin(c.req.raw, c.env);
	if (!client) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	try {
		const includeHidden = c.req.query("includeHidden") === "true";
		const [models, providerRows, benchmarkRows] = await Promise.all([
			fetchAllRows<any>((from, to) => {
				let query = client.from("v2_models").select("model_id:model_slug,name,release_date:released_at,retirement_date:retired_at,status,hidden,input_types:input_modalities,output_types:output_modalities,organisation:v2_labs(lab_slug,name)").order("released_at", { ascending: false });
				if (!includeHidden) query = query.eq("hidden", false);
				return query.range(from, to);
			}),
			fetchAllRows<any>((from, to) => client.from("v2_model_provider_routes").select("provider_api_model_id:provider_model_id,model_id:model_slug,provider_id:provider_slug,api_model_id:model_slug,is_active_gateway:routing_enabled,effective_from,effective_to").range(from, to)),
			fetchAllRows<any>((from, to) => client.from("v2_benchmark_results").select("model_id:model_slug,id:result_id").range(from, to)),
		]);
		const pricingRows = await fetchPricingSourceRows(client, providerRows);
		return c.json({ models, providerRows, benchmarkRows, pricingRows }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) {
		console.error("[web-api/account/models] audit source failed", { error });
		return c.json({ error: "admin_model_audit_source_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
});

accountModelsRouter.get("/provider-audit/source", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = await requireAdmin(c.req.raw, c.env);
	if (!client) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	try {
		const providerModels = await fetchAllRows<any>((from, to) => client.from("v2_model_provider_routes").select("provider_api_model_id:provider_model_id,provider_id:provider_slug,api_model_id:model_slug,provider_model_slug,internal_model_id:model_slug,is_active_gateway:routing_enabled,routing_status:status,provider_availability_status,phaseo_status,access_scope,effective_from,effective_to").range(from, to));
		const pricingRules = await fetchPricingSourceRows(client, providerModels);
		return c.json({ providerModels, pricingRules }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) {
		console.error("[web-api/account/models] provider audit source failed", { error });
		return c.json({ error: "admin_provider_audit_source_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
});

accountModelsRouter.get("/catalog/counts", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = await requireAdmin(c.req.raw, c.env);
	if (!client) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const [models, organisations, providers, benchmarks] = await Promise.all([
		client.from("v2_models").select("*", { count: "exact", head: true }),
		client.from("v2_labs").select("*", { count: "exact", head: true }),
		client.from("v2_providers").select("*", { count: "exact", head: true }),
		client.from("v2_benchmarks").select("*", { count: "exact", head: true }),
	]);
	if ([models, organisations, providers, benchmarks].some((result) => result.error)) return c.json({ error: "admin_catalog_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ models: models.count ?? 0, organisations: organisations.count ?? 0, providers: providers.count ?? 0, benchmarks: benchmarks.count ?? 0 }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountModelsRouter.get("/catalog/overview", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = await requireAdmin(c.req.raw, c.env);
	if (!client) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const [hiddenModels, modelsWithoutLab, routes, routableRoutes, recentChanges] = await Promise.all([
		client.from("v2_models").select("*", { count: "exact", head: true }).eq("hidden", true),
		client.from("v2_models").select("*", { count: "exact", head: true }).is("lab_slug", null),
		client.from("v2_model_provider_routes").select("*", { count: "exact", head: true }),
		client.from("v2_model_provider_routes").select("*", { count: "exact", head: true }).eq("routing_enabled", true),
		client.from("v2_catalogue_admin_changes").select("change_id,resource_type,resource_id,action,created_at").order("created_at", { ascending: false }).limit(8),
	]);
	if ([hiddenModels, modelsWithoutLab, routes, routableRoutes, recentChanges].some((result) => result.error)) return c.json({ error: "admin_catalog_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({
		attention: { hiddenModels: hiddenModels.count ?? 0, modelsWithoutLab: modelsWithoutLab.count ?? 0 },
		routes: { total: routes.count ?? 0, routable: routableRoutes.count ?? 0 },
		recentChanges: recentChanges.data ?? [],
	}, 200, PRIVATE_NO_STORE_HEADERS);
});

accountModelsRouter.get("/catalog/list", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = await requireAdmin(c.req.raw, c.env);
	if (!client) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const configs: Record<string, { table: string; select: string; search: string[] }> = {
		models: { table: "v2_models", select: "model_id:model_slug,name,created_at", search: ["model_slug", "name"] },
		organisations: { table: "v2_labs", select: "organisation_id:lab_slug,name,created_at", search: ["lab_slug", "name"] },
		providers: { table: "v2_providers", select: "api_provider_id:provider_slug,api_provider_name:name,created_at", search: ["provider_slug", "name"] },
		benchmarks: { table: "v2_benchmarks", select: "id:benchmark_id,name,category,created_at", search: ["benchmark_id", "name", "category"] },
	};
	const config = configs[c.req.query("resource") ?? ""];
	if (!config) return c.json({ error: "invalid_resource" }, 400, PRIVATE_NO_STORE_HEADERS);
	const page = Math.max(1, Number.parseInt(c.req.query("page") ?? "1", 10) || 1);
	const pageSize = Math.min(100, Math.max(1, Number.parseInt(c.req.query("pageSize") ?? "100", 10) || 100));
	const search = (c.req.query("q") ?? "").trim().replace(/[(),]/g, " ");
	let query = client.from(config.table).select(config.select, { count: "exact" }).order("created_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
	if (search) query = query.or(config.search.map((column) => `${column}.ilike.%${search}%`).join(","));
	const result = await query;
	if (result.error) return c.json({ error: "admin_catalog_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ rows: result.data ?? [], count: result.count ?? 0, page, pageSize }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountModelsRouter.get("/catalog/model-form-options", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = await requireAdmin(c.req.raw, c.env);
	if (!client) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const [organisations, providers, families, benchmarks, previousModels, subscriptionPlans] = await Promise.all([
		client.from("v2_labs").select("organisation_id:lab_slug,name").order("name", { ascending: true }),
		client.from("v2_providers").select("api_provider_id:provider_slug,api_provider_name:name").order("name", { ascending: true }),
		client.from("v2_model_families").select("family_id:family_slug,family_name:name").order("name", { ascending: true }),
		client.from("v2_benchmarks").select("id:benchmark_id,name").order("name", { ascending: true }),
		client.from("v2_models").select("model_id:model_slug,name").order("name", { ascending: true }).limit(500),
		client.from("v2_subscription_plans").select("plan_uuid,plan_id,name,frequency,price,currency").order("name", { ascending: true }).order("frequency", { ascending: true }).limit(1200),
	]);
	if ([organisations, providers, families, benchmarks, previousModels, subscriptionPlans].some((result) => result.error)) return c.json({ error: "admin_catalog_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ organisations: organisations.data ?? [], providers: providers.data ?? [], families: families.data ?? [], benchmarks: benchmarks.data ?? [], previousModels: previousModels.data ?? [], subscriptionPlans: subscriptionPlans.data ?? [] }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountModelsRouter.get("/catalog/record", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = await requireAdmin(c.req.raw, c.env);
	if (!client) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const resource = c.req.query("resource");
	const id = (c.req.query("id") ?? "").trim();
	if (!id) return c.json({ error: "invalid_id" }, 400, PRIVATE_NO_STORE_HEADERS);
	try {
		if (resource === "organisation") {
			const [row, links] = await Promise.all([
				client.from("v2_labs").select("organisation_id:lab_slug,name,description,country_code,metadata").eq("lab_slug", id).maybeSingle(),
				client.from("v2_lab_links").select("platform,url").eq("lab_slug", id),
			]);
			if (row.error) throw row.error;
			if (links.error) throw links.error;
			const data = row.data as (Record<string, any> & { metadata?: Record<string, unknown> }) | null;
			return c.json({ row: data ? { ...data, colour: data.metadata?.colour ?? null } : null, links: links.data ?? [] }, 200, PRIVATE_NO_STORE_HEADERS);
		}
		const configs: Record<string, { table: string; select: string; column: string }> = {
			provider: { table: "v2_providers", select: "api_provider_id:provider_slug,api_provider_name:name,base_url,country_code,default_execution_regions,byok_available,metadata", column: "provider_slug" },
			benchmark: { table: "v2_benchmarks", select: "id:benchmark_id,name,category,link,ascending_order", column: "benchmark_id" },
			model: { table: "v2_models", select: "model_id:model_slug,name", column: "model_slug" },
		};
		const config = configs[resource ?? ""];
		if (!config) return c.json({ error: "invalid_resource" }, 400, PRIVATE_NO_STORE_HEADERS);
		const result = await client.from(config.table).select(config.select).eq(config.column, id).maybeSingle();
		if (result.error) throw result.error;
		if (resource === "provider" && result.data) {
			const data = result.data as Record<string, any>;
			const metadata = data.metadata && typeof data.metadata === "object" ? data.metadata : {};
			return c.json({ row: { ...data, description: metadata.description ?? null, link: metadata.link ?? data.base_url ?? null, default_execution_regions: Array.isArray(data.default_execution_regions) ? data.default_execution_regions : [], byok_available: data.byok_available === true, prompt_training_policy: metadata.prompt_training_policy ?? null } }, 200, PRIVATE_NO_STORE_HEADERS);
		}
		return c.json({ row: result.data ?? null }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) {
		console.error("[web-api/account/models] catalog record failed", { resource, id, error });
		return c.json({ error: "admin_catalog_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
});

accountModelsRouter.get("/:modelId/source", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = await requireAdmin(c.req.raw, c.env);
	if (!client) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const requestedModelId = c.req.param("modelId");
	try {
		const alias = await client.from("v2_model_aliases").select("model_slug").eq("alias_slug", requestedModelId).eq("enabled", true).maybeSingle();
		if (alias.error) throw alias.error;
		const modelId = alias.data?.model_slug ?? requestedModelId;
		const [model, links, details, notice, aliases, successors, history, pricingSource, plans] = await Promise.all([
			client.from("v2_models").select("*,lab:v2_labs(*)").eq("model_slug", modelId).maybeSingle(),
			client.from("v2_model_links").select("link_kind,title,url,metadata").eq("model_slug", modelId),
			client.from("v2_model_details").select("detail_name,detail_value,detail_order").eq("model_slug", modelId).order("detail_order"),
			client.from("v2_model_page_notices").select("tone,markdown").eq("model_slug", modelId).maybeSingle(),
			client.from("v2_model_aliases").select("alias_slug,alias_type,enabled,effective_from,effective_to,metadata").eq("model_slug", modelId).order("alias_slug"),
			client.from("v2_models").select("model_slug,name,status").contains("metadata", { previous_model_id: modelId }).order("model_slug"),
			client.from("v2_catalogue_admin_changes").select("change_id,resource_type,action,before_state,after_state,created_at").eq("resource_id", modelId).order("created_at", { ascending: false }).limit(100),
			fetchModelPricingSources(c.env, [modelId], true),
			client.rpc("get_v2_model_subscription_plans", { p_model_slug: modelId }),
		]);
		if (model.error) throw model.error;
		if (links.error) throw links.error;
		if (details.error) throw details.error;
		if (notice.error) throw notice.error;
		if (aliases.error) throw aliases.error;
		if (successors.error) throw successors.error;
		if (history.error) throw history.error;
		if (plans.error) throw plans.error;
		const rawModel = model.data as Record<string, any> | null;
		const editorModel = rawModel ? {
			...rawModel,
			model_id: rawModel.model_slug,
			organisation_id: rawModel.lab_slug,
			family_id: rawModel.family_slug,
			announcement_date: rawModel.announced_at,
			release_date: rawModel.released_at,
			deprecation_date: rawModel.deprecated_at,
			retirement_date: rawModel.retired_at,
			input_types: Array.isArray(rawModel.input_modalities) ? rawModel.input_modalities.join(",") : null,
			output_types: Array.isArray(rawModel.output_modalities) ? rawModel.output_modalities.join(",") : null,
			license: rawModel.metadata?.license ?? null,
			previous_model_id: rawModel.metadata?.previous_model_id ?? null,
		} : null;
		return c.json({ source: { requestedModelId, canonicalApiId: modelId, internalModelId: modelId, model: editorModel, links: links.data ?? [], details: details.data ?? [], notice: notice.data ?? null, aliases: aliases.data ?? [], successors: successors.data ?? [], history: history.data ?? [], providerRows: pricingSource.providerRows, pricingRules: pricingSource.pricingRows, subscriptionPlans: plans.data ?? [] } }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) {
		console.error("[web-api/account/models] source failed", { requestedModelId, error });
		return c.json({ error: "admin_model_source_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
});

async function runCatalogMutation(c: any, resource: keyof typeof catalogMutationSchemas, action: "create" | "update" | "delete", id: string | null, rawPayload: unknown) {
	const admin = await requireAdminContext(c.req.raw, c.env);
	if (!admin.context) return c.json({ error: admin.status === 401 ? "unauthorized" : "forbidden" }, admin.status, PRIVATE_NO_STORE_HEADERS);
	let payload: Record<string, unknown> = {};
	if (action !== "delete") {
		const parsed = catalogMutationSchemas[resource].safeParse(rawPayload);
		if (!parsed.success) return c.json({ error: "invalid_catalogue_record", issues: parsed.error.issues }, 400, PRIVATE_NO_STORE_HEADERS);
		payload = parsed.data as Record<string, unknown>;
	}
	const resourceId = id ?? String(payload.organisation_id ?? payload.api_provider_id ?? payload.id ?? payload.plan_uuid ?? payload.modelId ?? "");
	if (!resourceId) return c.json({ error: "invalid_catalogue_id" }, 400, PRIVATE_NO_STORE_HEADERS);
	const result = await admin.context.client.rpc("mutate_v2_admin_catalogue", { p_actor_user_id: admin.context.user.id, p_resource_type: resource, p_action: action, p_resource_id: resourceId, p_payload: payload });
	if (result.error) return c.json({ error: "admin_catalogue_mutation_failed", message: result.error.message }, 409, PRIVATE_NO_STORE_HEADERS);
	return c.json({ success: true, record: result.data }, 200, PRIVATE_NO_STORE_HEADERS);
}

for (const resource of ["organisations", "providers", "benchmarks", "subscription-plans"] as const) {
	accountModelsRouter.post(`/catalog/${resource}`, async (c) => runCatalogMutation(c, resource, "create", null, await c.req.json().catch(() => null)));
	accountModelsRouter.put(`/catalog/${resource}/:id`, async (c) => runCatalogMutation(c, resource, "update", c.req.param("id"), await c.req.json().catch(() => null)));
	accountModelsRouter.delete(`/catalog/${resource}/:id`, async (c) => runCatalogMutation(c, resource, "delete", c.req.param("id"), {}));
}

accountModelsRouter.post("/", async (c) => runCatalogMutation(c, "models", "create", null, await c.req.json().catch(() => null)));
accountModelsRouter.delete("/catalog/models/:id", async (c) => runCatalogMutation(c, "models", "delete", c.req.param("id"), {}));

accountModelsRouter.put("/:modelId/graph", async (c) => {
	const admin = await requireAdminContext(c.req.raw, c.env);
	if (!admin.context) return c.json({ error: admin.status === 401 ? "unauthorized" : "forbidden" }, admin.status, PRIVATE_NO_STORE_HEADERS);
	const parsed = modelGraphSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success || parsed.data.modelId !== c.req.param("modelId")) return c.json({ error: "invalid_model_graph", issues: parsed.success ? [] : parsed.error.issues }, 400, PRIVATE_NO_STORE_HEADERS);
	const result = await admin.context.client.rpc("mutate_v2_admin_model_graph", { p_actor_user_id: admin.context.user.id, p_model_slug: parsed.data.modelId, p_payload: parsed.data });
	if (result.error) return c.json({ ok: false, error: result.error.message }, 409, PRIVATE_NO_STORE_HEADERS);
	return c.json({ ok: true, graph: result.data }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountModelsRouter.get("/:modelId/pricing-editor", async (c) => {
	const admin = await requireAdminContext(c.req.raw, c.env);
	if (!admin.context) return c.json({ error: admin.status === 401 ? "unauthorized" : "forbidden" }, admin.status, PRIVATE_NO_STORE_HEADERS);
	const modelId = c.req.param("modelId");
	const { client } = admin.context;
	try {
		const model = await client.from("v2_models").select("model_slug,name,lab_slug").eq("model_slug", modelId).maybeSingle();
		if (model.error) throw model.error;
		if (!model.data) return c.json({ error: "model_not_found" }, 404, PRIVATE_NO_STORE_HEADERS);

		const routes = await client
			.from("v2_model_provider_routes")
			.select("provider_model_id,provider_slug,provider_model_slug,status,provider_availability_status,phaseo_status,access_scope,routing_enabled,input_modalities,output_modalities,regions,context_length,max_output_tokens,effective_from,effective_to,metadata")
			.eq("model_slug", modelId)
			.order("provider_slug", { ascending: true });
		if (routes.error) throw routes.error;
		const providerModelIds = (routes.data ?? []).map((route) => route.provider_model_id);
		const skus = providerModelIds.length
			? await client
				.from("v2_pricing_skus")
				.select("sku_id,provider_model_id,sku_code,version,operation,status,region,service_tier_slug,display_name,description,currency,effective_from,effective_to,metadata,created_at,updated_at")
				.in("provider_model_id", providerModelIds)
				.order("effective_from", { ascending: false })
			: { data: [], error: null };
		if (skus.error) throw skus.error;
		const skuIds = (skus.data ?? []).map((sku) => sku.sku_id);
		const meters = skuIds.length
			? await client
				.from("v2_pricing_sku_meters")
				.select("sku_meter_id,sku_id,meter_key,modality,direction,unit,unit_quantity,price_nanos,display_label,display_unit,billable,meter_order,metadata")
				.in("sku_id", skuIds)
				.order("meter_order", { ascending: true })
			: { data: [], error: null };
		if (meters.error) throw meters.error;
		const providerSlugs = [...new Set((routes.data ?? []).map((route) => route.provider_slug))];
		const [serviceTiers, regions, capabilities, meterDefinitions, providers] = await Promise.all([
			client.from("v2_service_tiers").select("service_tier_slug,display_name,status").in("service_tier_slug", [...CANONICAL_SERVICE_TIERS]).neq("status", "disabled").order("display_name", { ascending: true }),
			providerSlugs.length
				? client.from("v2_provider_regions").select("provider_slug,region_code,display_name,status").in("provider_slug", providerSlugs).neq("status", "disabled").order("display_name", { ascending: true })
				: Promise.resolve({ data: [], error: null }),
			providerModelIds.length
				? client.from("v2_route_capabilities").select("provider_model_id,capability_id,status").in("provider_model_id", providerModelIds).neq("status", "disabled").order("capability_id", { ascending: true })
				: Promise.resolve({ data: [], error: null }),
			client.from("v2_meter_definitions").select("meter_key,display_name,modality,direction,unit,default_unit_quantity,status").neq("status", "disabled").order("display_name", { ascending: true }),
			client.from("v2_providers").select("provider_slug,name,status,routing_enabled,routable,base_url,metadata").neq("status", "disabled").order("name", { ascending: true }),
		]);
		if ([serviceTiers, regions, capabilities, meterDefinitions, providers].some((result) => result.error)) throw new Error("Pricing reference data unavailable");

		const returnedTiers = new Map((serviceTiers.data ?? []).map((tier) => [tier.service_tier_slug, tier]));
		const canonicalServiceTiers = CANONICAL_SERVICE_TIERS.map((slug) => returnedTiers.get(slug) ?? { service_tier_slug: slug, display_name: slug[0].toUpperCase() + slug.slice(1), status: "active" });
		return c.json({ model: model.data, routes: routes.data ?? [], skus: skus.data ?? [], meters: meters.data ?? [], serviceTiers: canonicalServiceTiers, regions: regions.data ?? [], capabilities: capabilities.data ?? [], meterDefinitions: meterDefinitions.data ?? [], providers: providers.data ?? [] }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) {
		console.error("[web-api/account/models] pricing editor source failed", { modelId, error });
		return c.json({ error: "admin_pricing_source_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
});

accountModelsRouter.put("/:modelId/provider-routes", async (c) => {
	const admin = await requireAdminContext(c.req.raw, c.env);
	if (!admin.context) return c.json({ error: admin.status === 401 ? "unauthorized" : "forbidden" }, admin.status, PRIVATE_NO_STORE_HEADERS);
	const parsed = providerRouteSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: "invalid_provider_route", issues: parsed.error.issues }, 400, PRIVATE_NO_STORE_HEADERS);
	const result = await admin.context.client.rpc("mutate_v2_admin_provider_route", { p_actor_user_id: admin.context.user.id, p_model_slug: c.req.param("modelId"), p_route: parsed.data });
	if (result.error) return c.json({ error: "admin_provider_route_failed", message: result.error.message }, 409, PRIVATE_NO_STORE_HEADERS);
	return c.json({ route: result.data }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountModelsRouter.put("/:modelId/notice", async (c) => {
	const admin = await requireAdminContext(c.req.raw, c.env);
	if (!admin.context) return c.json({ error: admin.status === 401 ? "unauthorized" : "forbidden" }, admin.status, PRIVATE_NO_STORE_HEADERS);
	const body = await c.req.json().catch(() => null);
	const parsed = body === null ? { success: true as const, data: null } : modelNoticeSchema.safeParse(body);
	if (!parsed.success) return c.json({ error: "invalid_model_notice", issues: parsed.error.issues }, 400, PRIVATE_NO_STORE_HEADERS);
	const result = await admin.context.client.rpc("mutate_v2_admin_model_notice", { p_actor_user_id: admin.context.user.id, p_model_slug: c.req.param("modelId"), p_notice: parsed.data });
	if (result.error) return c.json({ error: "admin_model_notice_failed", message: result.error.message }, 409, PRIVATE_NO_STORE_HEADERS);
	return c.json({ notice: result.data }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountModelsRouter.put("/:modelId/aliases", async (c) => {
	const admin = await requireAdminContext(c.req.raw, c.env);
	if (!admin.context) return c.json({ error: admin.status === 401 ? "unauthorized" : "forbidden" }, admin.status, PRIVATE_NO_STORE_HEADERS);
	const parsed = modelAliasesSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: "invalid_model_aliases", issues: parsed.error.issues }, 400, PRIVATE_NO_STORE_HEADERS);
	const result = await admin.context.client.rpc("mutate_v2_admin_model_aliases", { p_actor_user_id: admin.context.user.id, p_model_slug: c.req.param("modelId"), p_aliases: parsed.data });
	if (result.error) return c.json({ error: "admin_model_aliases_failed", message: result.error.message }, 409, PRIVATE_NO_STORE_HEADERS);
	return c.json({ aliases: result.data }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountModelsRouter.put("/:modelId/pricing-editor", async (c) => {
	const admin = await requireAdminContext(c.req.raw, c.env);
	if (!admin.context) return c.json({ error: admin.status === 401 ? "unauthorized" : "forbidden" }, admin.status, PRIVATE_NO_STORE_HEADERS);
	const parsed = pricingSkuSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: "invalid_pricing_sku", issues: parsed.error.issues }, 400, PRIVATE_NO_STORE_HEADERS);
	const modelId = c.req.param("modelId");
	const result = await admin.context.client.rpc("mutate_v2_admin_pricing_sku", {
		p_actor_user_id: admin.context.user.id,
		p_model_slug: modelId,
		p_action: "save",
		p_sku: parsed.data,
	});
	if (result.error) {
		console.error("[web-api/account/models] pricing save failed", { modelId, error: result.error });
		return c.json({ error: "admin_pricing_save_failed", message: result.error.message }, 409, PRIVATE_NO_STORE_HEADERS);
	}
	return c.json({ pricing: result.data }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountModelsRouter.delete("/:modelId/pricing-editor/:skuId", async (c) => {
	const admin = await requireAdminContext(c.req.raw, c.env);
	if (!admin.context) return c.json({ error: admin.status === 401 ? "unauthorized" : "forbidden" }, admin.status, PRIVATE_NO_STORE_HEADERS);
	const skuId = z.uuid().safeParse(c.req.param("skuId"));
	if (!skuId.success) return c.json({ error: "invalid_sku_id" }, 400, PRIVATE_NO_STORE_HEADERS);
	const modelId = c.req.param("modelId");
	const result = await admin.context.client.rpc("mutate_v2_admin_pricing_sku", {
		p_actor_user_id: admin.context.user.id,
		p_model_slug: modelId,
		p_action: "delete",
		p_sku: { sku_id: skuId.data },
	});
	if (result.error) {
		console.error("[web-api/account/models] pricing delete failed", { modelId, skuId: skuId.data, error: result.error });
		return c.json({ error: "admin_pricing_delete_failed", message: result.error.message }, 409, PRIVATE_NO_STORE_HEADERS);
	}
	return c.json({ pricing: result.data }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountModelsRouter.all("*", async (c) => {
	if (c.req.method === "GET") return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = await requireAdmin(c.req.raw, c.env);
	if (!client) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	return c.json({
		error: "catalogue_is_repository_managed",
		message: "Submit catalogue changes through repository JSON; direct database mutations are disabled.",
	}, 409, PRIVATE_NO_STORE_HEADERS);
});
