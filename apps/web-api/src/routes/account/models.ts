import { Hono } from "hono";
import { requireUser } from "@/auth/requireUser";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { purgeWorkerCacheTags } from "@/http/invalidation";
import { deleteBenchmarkResultData, deleteModelGraphData, deletePricingRuleData, deleteProviderModelData, updateModelData } from "@/models/update-model";

export const accountModelsRouter = new Hono<{ Bindings: Env }>();

async function getAdminClient(request: Request, env: Env) {
	const user = await requireUser(request, env);
	if (!user) return null;
	const client = getDataClient(env);
	const role = await client.from("users").select("role").eq("user_id", user.id).maybeSingle();
	return !role.error && String(role.data?.role ?? "").toLowerCase() === "admin" ? client : null;
}

async function fetchAllRows<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>, pageSize = 1000): Promise<T[]> {
	const rows: T[] = [];
	for (let from = 0; ; from += pageSize) {
		const result = await fetchPage(from, from + pageSize - 1);
		if (result.error) throw result.error;
		const page = result.data ?? [];
		rows.push(...page);
		if (page.length < pageSize) return rows;
	}
}

accountModelsRouter.get("/audit/source", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env);
	const roleResult = await client.from("users").select("role").eq("user_id", user.id).maybeSingle();
	if (roleResult.error) return c.json({ error: "admin_check_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (String(roleResult.data?.role ?? "").toLowerCase() !== "admin") return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const includeHidden = c.req.query("includeHidden") === "true";
	try {
		const nowIso = new Date().toISOString();
		const activePricingWindow = [
			"and(effective_from.is.null,effective_to.is.null)",
			`and(effective_from.is.null,effective_to.gt.${nowIso})`,
			`and(effective_from.lte.${nowIso},effective_to.is.null)`,
			`and(effective_from.lte.${nowIso},effective_to.gt.${nowIso})`,
		].join(",");
		const [models, providerRows, benchmarkRows, pricingRows] = await Promise.all([
			fetchAllRows<any>((from, to) => {
				let query = client.from("data_models").select("model_id,name,release_date,retirement_date,status,hidden,input_types,output_types,organisation:data_organisations(organisation_id,name)").order("release_date", { ascending: false });
				if (!includeHidden) query = query.eq("hidden", false);
				return query.range(from, to);
			}),
			fetchAllRows<any>((from, to) => client.from("data_api_provider_models").select("provider_api_model_id,model_id,provider_id,api_model_id,is_active_gateway,effective_from,effective_to,provider:data_api_providers(api_provider_id,api_provider_name),capabilities:data_api_provider_model_capabilities(capability_id,status)").range(from, to)),
			fetchAllRows<any>((from, to) => client.from("data_benchmark_results").select("model_id,id").range(from, to)),
			fetchAllRows<any>((from, to) => client.from("data_api_pricing_rules").select("model_key,meter,price_per_unit,unit_size").or(activePricingWindow).range(from, to)),
		]);
		return c.json({ models, providerRows, benchmarkRows, pricingRows }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) {
		console.error("[web-api/account/models] audit source failed", { includeHidden, error });
		return c.json({ error: "admin_model_audit_source_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
});

accountModelsRouter.get("/provider-audit/source", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env);
	const roleResult = await client.from("users").select("role").eq("user_id", user.id).maybeSingle();
	if (roleResult.error) return c.json({ error: "admin_check_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (String(roleResult.data?.role ?? "").toLowerCase() !== "admin") return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	try {
		const [providerModels, pricingRules] = await Promise.all([
			fetchAllRows<any>((from, to) => client.from("data_api_provider_models").select("provider_api_model_id,provider_id,api_model_id,provider_model_slug,internal_model_id,is_active_gateway,routing_status,effective_from,effective_to,provider:data_api_providers(api_provider_id,api_provider_name,status,routing_status),capabilities:data_api_provider_model_capabilities(capability_id,status,effective_from,effective_to)").range(from, to)),
			fetchAllRows<any>((from, to) => client.from("data_api_pricing_rules").select("model_key,effective_from,effective_to").range(from, to)),
		]);
		return c.json({ providerModels, pricingRules }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) {
		console.error("[web-api/account/models] provider audit source failed", { error });
		return c.json({ error: "admin_provider_audit_source_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
});

accountModelsRouter.get("/catalog/counts", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env);
	const role = await client.from("users").select("role").eq("user_id", user.id).maybeSingle();
	if (role.error) return c.json({ error: "admin_check_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (String(role.data?.role ?? "").toLowerCase() !== "admin") return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const [models, organisations, providers, benchmarks] = await Promise.all([
		client.from("data_models").select("*", { count: "exact", head: true }),
		client.from("data_organisations").select("*", { count: "exact", head: true }),
		client.from("data_api_providers").select("*", { count: "exact", head: true }),
		client.from("data_benchmarks").select("*", { count: "exact", head: true }),
	]);
	if ([models, organisations, providers, benchmarks].some((result) => result.error)) return c.json({ error: "admin_catalog_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ models: models.count ?? 0, organisations: organisations.count ?? 0, providers: providers.count ?? 0, benchmarks: benchmarks.count ?? 0 }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountModelsRouter.get("/catalog/list", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env);
	const role = await client.from("users").select("role").eq("user_id", user.id).maybeSingle();
	if (role.error) return c.json({ error: "admin_check_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (String(role.data?.role ?? "").toLowerCase() !== "admin") return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const configs: Record<string, { table: string; select: string; search: string[] }> = {
		models: { table: "data_models", select: "model_id,name,created_at", search: ["model_id", "name"] },
		organisations: { table: "data_organisations", select: "organisation_id,name,created_at", search: ["organisation_id", "name"] },
		providers: { table: "data_api_providers", select: "api_provider_id,api_provider_name,created_at", search: ["api_provider_id", "api_provider_name"] },
		benchmarks: { table: "data_benchmarks", select: "id,name,category,created_at", search: ["id", "name", "category"] },
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
	return c.json({ rows: result.data ?? [], count: result.count ?? 0 }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountModelsRouter.get("/catalog/record", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env);
	const role = await client.from("users").select("role").eq("user_id", user.id).maybeSingle();
	if (role.error) return c.json({ error: "admin_check_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (String(role.data?.role ?? "").toLowerCase() !== "admin") return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const resource = c.req.query("resource");
	const id = (c.req.query("id") ?? "").trim();
	if (!id) return c.json({ error: "invalid_id" }, 400, PRIVATE_NO_STORE_HEADERS);
	try {
		if (resource === "organisation") {
			const [row, links] = await Promise.all([
				client.from("data_organisations").select("organisation_id,name,description,country_code,colour").eq("organisation_id", id).maybeSingle(),
				client.from("data_organisation_links").select("platform,url").eq("organisation_id", id),
			]);
			if (row.error) throw row.error; if (links.error) throw links.error;
			return c.json({ row: row.data ?? null, links: links.data ?? [] }, 200, PRIVATE_NO_STORE_HEADERS);
		}
		const configs: Record<string, { table: string; select: string; column: string }> = {
			provider: { table: "data_api_providers", select: "api_provider_id,api_provider_name,description,link,country_code,prompt_training_policy,prompt_training_notes,prompt_training_source_url", column: "api_provider_id" },
			benchmark: { table: "data_benchmarks", select: "id,name,category,link,ascending_order", column: "id" },
			model: { table: "data_models", select: "model_id,name", column: "model_id" },
		};
		const config = configs[resource ?? ""];
		if (!config) return c.json({ error: "invalid_resource" }, 400, PRIVATE_NO_STORE_HEADERS);
		const result = await client.from(config.table).select(config.select).eq(config.column, id).maybeSingle();
		if (result.error) throw result.error;
		return c.json({ row: result.data ?? null }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) {
		console.error("[web-api/account/models] catalog record failed", { resource, id, error });
		return c.json({ error: "admin_catalog_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
});

accountModelsRouter.get("/catalog/model-form-options", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env);
	const role = await client.from("users").select("role").eq("user_id", user.id).maybeSingle();
	if (role.error) return c.json({ error: "admin_check_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (String(role.data?.role ?? "").toLowerCase() !== "admin") return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const [organisations, providers, families, benchmarks, previousModels, subscriptionPlans] = await Promise.all([
		client.from("data_organisations").select("organisation_id,name").order("name", { ascending: true }),
		client.from("data_api_providers").select("api_provider_id,api_provider_name").order("api_provider_name", { ascending: true }),
		client.from("data_model_families").select("family_id,family_name").order("family_name", { ascending: true }),
		client.from("data_benchmarks").select("id,name").order("name", { ascending: true }),
		client.from("data_models").select("model_id,name").order("name", { ascending: true }).limit(500),
		client.from("data_subscription_plans").select("plan_uuid,plan_id,name,frequency,price,currency").order("name", { ascending: true }).order("frequency", { ascending: true }).limit(1200),
	]);
	if ([organisations, providers, families, benchmarks, previousModels, subscriptionPlans].some((result) => result.error)) return c.json({ error: "admin_catalog_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ organisations: organisations.data ?? [], providers: providers.data ?? [], families: families.data ?? [], benchmarks: benchmarks.data ?? [], previousModels: previousModels.data ?? [], subscriptionPlans: subscriptionPlans.data ?? [] }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountModelsRouter.post("/catalog/benchmarks", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env);
	const role = await client.from("users").select("role").eq("user_id", user.id).maybeSingle();
	if (role.error) return c.json({ error: "admin_check_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (String(role.data?.role ?? "").toLowerCase() !== "admin") return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const body: Record<string, unknown> = await c.req.json<Record<string, unknown>>().catch(() => ({}));
	const id = String(body.id ?? "").trim();
	const name = String(body.name ?? "").trim();
	if (!id || !name || id.length > 120 || name.length > 240) return c.json({ error: "invalid_benchmark" }, 400, PRIVATE_NO_STORE_HEADERS);
	const result = await client.from("data_benchmarks").upsert({ id, name, category: body.category ?? null, link: body.link ?? null, ascending_order: body.ascending_order ?? null }, { onConflict: "id" }).select("id,name").single();
	if (result.error) return c.json({ error: "benchmark_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	c.executionCtx.waitUntil(purgeWorkerCacheTags(c.executionCtx, ["web-api-benchmarks", "web-api-reference-data", "web-api-model-benchmarks"]));
	return c.json({ benchmark: result.data }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountModelsRouter.post("/catalog/subscription-plans", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env);
	const role = await client.from("users").select("role").eq("user_id", user.id).maybeSingle();
	if (role.error) return c.json({ error: "admin_check_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (String(role.data?.role ?? "").toLowerCase() !== "admin") return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const body: Record<string, unknown> = await c.req.json<Record<string, unknown>>().catch(() => ({}));
	const planUuid = String(body.plan_uuid ?? "").trim();
	const planId = String(body.plan_id ?? "").trim();
	const name = String(body.name ?? "").trim();
	const frequency = String(body.frequency ?? "monthly").trim();
	const currency = String(body.currency ?? "USD").trim().toUpperCase();
	const price = Number(body.price ?? 0);
	if (!planUuid || !planId || !name || !frequency || !currency || !Number.isFinite(price) || price < 0) return c.json({ error: "invalid_subscription_plan" }, 400, PRIVATE_NO_STORE_HEADERS);
	const row = { plan_uuid: planUuid, plan_id: planId, name, frequency, price, currency, organisation_id: body.organisation_id ? String(body.organisation_id) : null, description: null, link: null, other_info: {} };
	const result = await client.from("data_subscription_plans").insert(row).select("plan_uuid,plan_id,name,frequency,price,currency").single();
	if (result.error) return c.json({ error: "subscription_plan_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	c.executionCtx.waitUntil(purgeWorkerCacheTags(c.executionCtx, ["web-api-subscription-plans", "web-api-model-subscriptions", "web-api-reference-data"]));
	return c.json({ plan: result.data }, 201, PRIVATE_NO_STORE_HEADERS);
});

accountModelsRouter.post("/catalog/organisations", async (c) => {
	const client = await getAdminClient(c.req.raw, c.env); if (!client) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const body: Record<string, any> = await c.req.json<Record<string, any>>().catch(() => ({})); const id = String(body.organisation_id ?? "").trim(); const name = String(body.name ?? "").trim(); if (!id || !name) return c.json({ error: "invalid_organisation" }, 400, PRIVATE_NO_STORE_HEADERS);
	const inserted = await client.from("data_organisations").insert({ organisation_id: id, name, description: body.description ?? null, country_code: body.country_code ?? null, colour: body.colour ?? null }); if (inserted.error) return c.json({ error: inserted.error.message }, 503, PRIVATE_NO_STORE_HEADERS);
	const links = Array.isArray(body.social_links) ? body.social_links.filter((link: any) => link?.platform && link?.url).map((link: any) => ({ organisation_id: id, platform: String(link.platform), url: String(link.url) })) : []; if (links.length) { const result = await client.from("data_organisation_links").insert(links); if (result.error) return c.json({ error: result.error.message }, 503, PRIVATE_NO_STORE_HEADERS); }
	c.executionCtx.waitUntil(purgeWorkerCacheTags(c.executionCtx, ["web-api-organisations", "web-api-organisations-details", "web-api-reference-data", "web-api-models", "web-api-search"])); return c.json({ success: true }, 201, PRIVATE_NO_STORE_HEADERS);
});

accountModelsRouter.put("/catalog/organisations/:id", async (c) => {
	const client = await getAdminClient(c.req.raw, c.env); if (!client) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS); const id = c.req.param("id"); const body: Record<string, any> = await c.req.json<Record<string, any>>().catch(() => ({})); const name = String(body.name ?? "").trim(); if (!name) return c.json({ error: "invalid_organisation" }, 400, PRIVATE_NO_STORE_HEADERS);
	const updated = await client.from("data_organisations").update({ name, description: body.description ?? null, country_code: body.country_code ?? null, colour: body.colour ?? null, updated_at: new Date().toISOString() }).eq("organisation_id", id); if (updated.error) return c.json({ error: updated.error.message }, 503, PRIVATE_NO_STORE_HEADERS);
	const removed = await client.from("data_organisation_links").delete().eq("organisation_id", id); if (removed.error) return c.json({ error: removed.error.message }, 503, PRIVATE_NO_STORE_HEADERS); const links = Array.isArray(body.social_links) ? body.social_links.filter((link: any) => link?.platform && link?.url).map((link: any) => ({ organisation_id: id, platform: String(link.platform), url: String(link.url) })) : []; if (links.length) { const result = await client.from("data_organisation_links").insert(links); if (result.error) return c.json({ error: result.error.message }, 503, PRIVATE_NO_STORE_HEADERS); }
	c.executionCtx.waitUntil(purgeWorkerCacheTags(c.executionCtx, ["web-api-organisations", "web-api-organisations-details", "web-api-reference-data", "web-api-models", "web-api-search"])); return c.json({ success: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountModelsRouter.delete("/catalog/organisations/:id", async (c) => { const client = await getAdminClient(c.req.raw, c.env); if (!client) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS); const result = await client.from("data_organisations").delete().eq("organisation_id", c.req.param("id")); if (result.error) return c.json({ error: result.error.message }, 503, PRIVATE_NO_STORE_HEADERS); c.executionCtx.waitUntil(purgeWorkerCacheTags(c.executionCtx, ["web-api-organisations", "web-api-reference-data", "web-api-models", "web-api-search"])); return c.json({ success: true }, 200, PRIVATE_NO_STORE_HEADERS); });

accountModelsRouter.post("/catalog/providers", async (c) => { const client = await getAdminClient(c.req.raw, c.env); if (!client) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS); const body: Record<string, any> = await c.req.json<Record<string, any>>().catch(() => ({})); const id = String(body.api_provider_id ?? "").trim(); const name = String(body.api_provider_name ?? "").trim(); if (!id || !name) return c.json({ error: "invalid_provider" }, 400, PRIVATE_NO_STORE_HEADERS); const result = await client.from("data_api_providers").insert({ ...body, api_provider_id: id, api_provider_name: name, status: body.status ?? "Active" }); if (result.error) return c.json({ error: result.error.message }, 503, PRIVATE_NO_STORE_HEADERS); c.executionCtx.waitUntil(purgeWorkerCacheTags(c.executionCtx, ["web-api-providers", "web-api-reference-data", "web-api-models", "web-api-search"])); return c.json({ success: true }, 201, PRIVATE_NO_STORE_HEADERS); });
accountModelsRouter.put("/catalog/providers/:id", async (c) => { const client = await getAdminClient(c.req.raw, c.env); if (!client) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS); const body: Record<string, any> = await c.req.json<Record<string, any>>().catch(() => ({})); delete body.api_provider_id; body.updated_at = new Date().toISOString(); const result = await client.from("data_api_providers").update(body).eq("api_provider_id", c.req.param("id")); if (result.error) return c.json({ error: result.error.message }, 503, PRIVATE_NO_STORE_HEADERS); c.executionCtx.waitUntil(purgeWorkerCacheTags(c.executionCtx, ["web-api-providers", "web-api-reference-data", "web-api-models", "web-api-search"])); return c.json({ success: true }, 200, PRIVATE_NO_STORE_HEADERS); });
accountModelsRouter.delete("/catalog/providers/:id", async (c) => { const client = await getAdminClient(c.req.raw, c.env); if (!client) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS); const result = await client.from("data_api_providers").delete().eq("api_provider_id", c.req.param("id")); if (result.error) return c.json({ error: result.error.message }, 503, PRIVATE_NO_STORE_HEADERS); c.executionCtx.waitUntil(purgeWorkerCacheTags(c.executionCtx, ["web-api-providers", "web-api-reference-data", "web-api-models", "web-api-search"])); return c.json({ success: true }, 200, PRIVATE_NO_STORE_HEADERS); });

accountModelsRouter.put("/catalog/benchmarks/:id", async (c) => { const client = await getAdminClient(c.req.raw, c.env); if (!client) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS); const body: Record<string, any> = await c.req.json<Record<string, any>>().catch(() => ({})); const result = await client.from("data_benchmarks").update({ name: body.name, category: body.category ?? null, link: body.link ?? null, ascending_order: body.ascending_order ?? null, updated_at: new Date().toISOString() }).eq("id", c.req.param("id")); if (result.error) return c.json({ error: result.error.message }, 503, PRIVATE_NO_STORE_HEADERS); c.executionCtx.waitUntil(purgeWorkerCacheTags(c.executionCtx, ["web-api-benchmarks", "web-api-reference-data", "web-api-model-benchmarks"])); return c.json({ success: true }, 200, PRIVATE_NO_STORE_HEADERS); });
accountModelsRouter.delete("/catalog/benchmarks/:id", async (c) => { const client = await getAdminClient(c.req.raw, c.env); if (!client) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS); const result = await client.from("data_benchmarks").delete().eq("id", c.req.param("id")); if (result.error) return c.json({ error: result.error.message }, 503, PRIVATE_NO_STORE_HEADERS); c.executionCtx.waitUntil(purgeWorkerCacheTags(c.executionCtx, ["web-api-benchmarks", "web-api-reference-data", "web-api-model-benchmarks"])); return c.json({ success: true }, 200, PRIVATE_NO_STORE_HEADERS); });

accountModelsRouter.post("/catalog/provider-models", async (c) => { const client = await getAdminClient(c.req.raw, c.env); if (!client) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS); const body: Record<string, any> = await c.req.json<Record<string, any>>().catch(() => ({})); const result = await client.from("data_api_provider_models").insert({ provider_id: body.providerId, api_model_id: body.apiModelId, model_id: body.internalModelId || body.apiModelId, internal_model_id: null, is_active_gateway: Boolean(body.isActiveGateway), input_modalities: body.inputModalities ?? [], output_modalities: body.outputModalities ?? [], effective_from: body.effectiveFrom || null, effective_to: body.effectiveTo || null }); if (result.error) return c.json({ error: result.error.message }, 503, PRIVATE_NO_STORE_HEADERS); c.executionCtx.waitUntil(purgeWorkerCacheTags(c.executionCtx, ["web-api-models", "web-api-model-details", "web-api-providers", "web-api-model-pricing"])); return c.json({ success: true }, 201, PRIVATE_NO_STORE_HEADERS); });
accountModelsRouter.patch("/catalog/provider-models/:id", async (c) => { const client = await getAdminClient(c.req.raw, c.env); if (!client) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS); const body: Record<string, any> = await c.req.json<Record<string, any>>().catch(() => ({})); const update: Record<string, unknown> = {}; for (const [key, column] of Object.entries({ isActiveGateway: "is_active_gateway", inputModalities: "input_modalities", outputModalities: "output_modalities", effectiveFrom: "effective_from", effectiveTo: "effective_to" })) if (body[key] !== undefined) update[column] = body[key] || (key.startsWith("effective") ? null : body[key]); const result = await client.from("data_api_provider_models").update(update).eq("provider_api_model_id", c.req.param("id")); if (result.error) return c.json({ error: result.error.message }, 503, PRIVATE_NO_STORE_HEADERS); c.executionCtx.waitUntil(purgeWorkerCacheTags(c.executionCtx, ["web-api-models", "web-api-model-details", "web-api-providers", "web-api-model-pricing"])); return c.json({ success: true }, 200, PRIVATE_NO_STORE_HEADERS); });
accountModelsRouter.delete("/catalog/provider-models/:id", async (c) => { const client = await getAdminClient(c.req.raw, c.env); if (!client) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS); try { const result = await deleteProviderModelData(client, c.req.param("id")); c.executionCtx.waitUntil(purgeWorkerCacheTags(c.executionCtx, ["web-api-models", "web-api-model-details", "web-api-providers", "web-api-model-pricing"])); return c.json({ success: true, ...result }, 200, PRIVATE_NO_STORE_HEADERS); } catch (error) { return c.json({ error: error instanceof Error ? error.message : "provider_model_delete_failed" }, 503, PRIVATE_NO_STORE_HEADERS); } });

accountModelsRouter.post("/catalog/benchmark-results", async (c) => { const client = await getAdminClient(c.req.raw, c.env); if (!client) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS); const body: Record<string, any> = await c.req.json<Record<string, any>>().catch(() => ({})); const result = await client.from("data_benchmark_results").insert({ model_id: body.modelId, benchmark_id: body.benchmarkId, score: body.score, is_self_reported: Boolean(body.isSelfReported), other_info: body.otherInfo || null, source_link: body.sourceLink || null, rank: body.rank || null }); if (result.error) return c.json({ error: result.error.message }, 503, PRIVATE_NO_STORE_HEADERS); c.executionCtx.waitUntil(purgeWorkerCacheTags(c.executionCtx, ["web-api-models", "web-api-model-benchmarks", "web-api-benchmarks"])); return c.json({ success: true }, 201, PRIVATE_NO_STORE_HEADERS); });
accountModelsRouter.patch("/catalog/benchmark-results/:id", async (c) => { const client = await getAdminClient(c.req.raw, c.env); if (!client) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS); const body: Record<string, any> = await c.req.json<Record<string, any>>().catch(() => ({})); const update: Record<string, unknown> = {}; for (const [key, column] of Object.entries({ score: "score", isSelfReported: "is_self_reported", otherInfo: "other_info", sourceLink: "source_link", rank: "rank" })) if (body[key] !== undefined) update[column] = key === "isSelfReported" || key === "score" ? body[key] : body[key] || null; const result = await client.from("data_benchmark_results").update(update).eq("id", c.req.param("id")); if (result.error) return c.json({ error: result.error.message }, 503, PRIVATE_NO_STORE_HEADERS); c.executionCtx.waitUntil(purgeWorkerCacheTags(c.executionCtx, ["web-api-models", "web-api-model-benchmarks", "web-api-benchmarks"])); return c.json({ success: true }, 200, PRIVATE_NO_STORE_HEADERS); });
accountModelsRouter.delete("/catalog/benchmark-results/:id", async (c) => { const client = await getAdminClient(c.req.raw, c.env); if (!client) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS); try { const result = await deleteBenchmarkResultData(client, c.req.param("id")); c.executionCtx.waitUntil(purgeWorkerCacheTags(c.executionCtx, ["web-api-models", "web-api-model-benchmarks", "web-api-benchmarks"])); return c.json({ success: true, ...result }, 200, PRIVATE_NO_STORE_HEADERS); } catch (error) { return c.json({ error: error instanceof Error ? error.message : "benchmark_result_delete_failed" }, 503, PRIVATE_NO_STORE_HEADERS); } });

accountModelsRouter.delete("/catalog/models/:id", async (c) => { const client = await getAdminClient(c.req.raw, c.env); if (!client) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS); const modelId = c.req.param("id"); try { await deleteModelGraphData(client, modelId); } catch (error) { return c.json({ error: error instanceof Error ? error.message : "model_delete_failed" }, 503, PRIVATE_NO_STORE_HEADERS); } c.executionCtx.waitUntil(purgeWorkerCacheTags(c.executionCtx, ["web-api-models", "web-api-model-details", "web-api-model-benchmarks", "web-api-model-pricing", "web-api-model-subscriptions", "web-api-providers", "web-api-search"])); return c.json({ success: true }, 200, PRIVATE_NO_STORE_HEADERS); });

accountModelsRouter.post("", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env);
	const role = await client.from("users").select("role").eq("user_id", user.id).maybeSingle();
	if (role.error) return c.json({ error: "admin_check_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (String(role.data?.role ?? "").toLowerCase() !== "admin") return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const input: Record<string, any> = await c.req.json<Record<string, any>>().catch(() => ({}));
	const modelId = String(input.modelId ?? "").trim();
	const name = String(input.name ?? "").trim();
	if (!modelId || !name) return c.json({ error: "invalid_model" }, 400, PRIVATE_NO_STORE_HEADERS);
	const organisationId = input.organisationId || null;
	const apiModel = await client.from("data_api_models").upsert({ api_model_id: modelId, organisation_id: organisationId, display_name: name, updated_at: new Date().toISOString() }, { onConflict: "api_model_id" });
	if (apiModel.error) return c.json({ error: apiModel.error.message }, 503, PRIVATE_NO_STORE_HEADERS);
	const result = await client.from("data_models").insert({ model_id: modelId, name, organisation_id: organisationId, family_id: input.familyId || null, previous_model_id: input.previousModelId || null, release_date: input.releaseDate || null, announcement_date: input.announcementDate || null, deprecation_date: input.deprecationDate || null, retirement_date: input.retirementDate || null, license: input.license || null, status: input.status || "Released", hidden: Boolean(input.hidden), input_types: input.inputTypes ?? null, output_types: input.outputTypes ?? null });
	if (result.error) return c.json({ error: result.error.message }, 503, PRIVATE_NO_STORE_HEADERS);
	c.executionCtx.waitUntil(purgeWorkerCacheTags(c.executionCtx, ["web-api-models", "web-api-model-details", "web-api-reference-data", "web-api-search", "web-api-organisations"]));
	return c.json({ success: true }, 201, PRIVATE_NO_STORE_HEADERS);
});

accountModelsRouter.patch("/:modelId", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env);
	const role = await client.from("users").select("role").eq("user_id", user.id).maybeSingle();
	if (role.error) return c.json({ error: "admin_check_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (String(role.data?.role ?? "").toLowerCase() !== "admin") return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const input: Record<string, any> = await c.req.json<Record<string, any>>().catch(() => ({}));
	const update: Record<string, unknown> = {};
	for (const [inputKey, column] of Object.entries({ name: "name", organisationId: "organisation_id", releaseDate: "release_date", retirementDate: "retirement_date", announcementDate: "announcement_date", deprecationDate: "deprecation_date", status: "status", hidden: "hidden", license: "license", familyId: "family_id", previousModelId: "previous_model_id", inputTypes: "input_types", outputTypes: "output_types" })) if (input[inputKey] !== undefined) update[column] = input[inputKey];
	if (!Object.keys(update).length) return c.json({ error: "no_changes" }, 400, PRIVATE_NO_STORE_HEADERS);
	const modelId = c.req.param("modelId");
	const result = await client.from("data_models").update(update).eq("model_id", modelId);
	if (result.error) return c.json({ error: result.error.message }, 503, PRIVATE_NO_STORE_HEADERS);
	c.executionCtx.waitUntil(purgeWorkerCacheTags(c.executionCtx, ["web-api-models", "web-api-model-details", "web-api-reference-data", "web-api-search", "web-api-organisations"]));
	return c.json({ success: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountModelsRouter.put("/:modelId/graph", async (c) => {
	const client = await getAdminClient(c.req.raw, c.env); if (!client) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const payload: Record<string, any> = await c.req.json<Record<string, any>>().catch(() => ({})); const modelId = c.req.param("modelId"); if (!payload.modelId || payload.modelId !== modelId) return c.json({ error: "model_id_mismatch" }, 400, PRIVATE_NO_STORE_HEADERS);
	try { const result = await updateModelData(client, payload as any); c.executionCtx.waitUntil(purgeWorkerCacheTags(c.executionCtx, ["web-api-models", "web-api-model-details", "web-api-model-benchmarks", "web-api-model-pricing", "web-api-model-subscriptions", "web-api-providers", "web-api-organisations", "web-api-reference-data", "web-api-search"])); return c.json(result, 200, PRIVATE_NO_STORE_HEADERS); } catch (error) { return c.json({ error: error instanceof Error ? error.message : "model_update_failed" }, 503, PRIVATE_NO_STORE_HEADERS); }
});

accountModelsRouter.delete("/:modelId/benchmark-results/:id", async (c) => { const client = await getAdminClient(c.req.raw, c.env); if (!client) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS); try { const result = await deleteBenchmarkResultData(client, c.req.param("id")); c.executionCtx.waitUntil(purgeWorkerCacheTags(c.executionCtx, ["web-api-models", "web-api-model-benchmarks", "web-api-benchmarks"])); return c.json(result, 200, PRIVATE_NO_STORE_HEADERS); } catch (error) { return c.json({ error: error instanceof Error ? error.message : "benchmark_delete_failed" }, 503, PRIVATE_NO_STORE_HEADERS); } });
accountModelsRouter.delete("/:modelId/pricing-rules/:id", async (c) => { const client = await getAdminClient(c.req.raw, c.env); if (!client) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS); try { const result = await deletePricingRuleData(client, c.req.param("id")); c.executionCtx.waitUntil(purgeWorkerCacheTags(c.executionCtx, ["web-api-models", "web-api-model-pricing", "web-api-providers"])); return c.json(result, 200, PRIVATE_NO_STORE_HEADERS); } catch (error) { return c.json({ error: error instanceof Error ? error.message : "pricing_delete_failed" }, 503, PRIVATE_NO_STORE_HEADERS); } });
accountModelsRouter.delete("/:modelId/provider-models/:id", async (c) => { const client = await getAdminClient(c.req.raw, c.env); if (!client) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS); try { const result = await deleteProviderModelData(client, c.req.param("id")); c.executionCtx.waitUntil(purgeWorkerCacheTags(c.executionCtx, ["web-api-models", "web-api-model-details", "web-api-model-pricing", "web-api-providers"])); return c.json(result, 200, PRIVATE_NO_STORE_HEADERS); } catch (error) { return c.json({ error: error instanceof Error ? error.message : "provider_model_delete_failed" }, 503, PRIVATE_NO_STORE_HEADERS); } });

accountModelsRouter.get("/:modelId/source", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env); const roleResult = await client.from("users").select("role").eq("user_id", user.id).maybeSingle();
	if (roleResult.error) return c.json({ error: "admin_check_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (String(roleResult.data?.role ?? "").toLowerCase() !== "admin") return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const requestedModelId = c.req.param("modelId");
	try {
		const [direct, alias, api, providerApi, providerSlug] = await Promise.all([
			client.from("data_models").select("model_id").eq("model_id", requestedModelId).maybeSingle(),
			client.from("data_api_model_aliases").select("api_model_id").eq("alias_slug", requestedModelId).eq("is_enabled", true).maybeSingle(),
			client.from("data_api_models").select("api_model_id").eq("api_model_id", requestedModelId).maybeSingle(),
			client.from("data_api_provider_models").select("model_id,api_model_id").eq("provider_api_model_id", requestedModelId).limit(1),
			client.from("data_api_provider_models").select("model_id,api_model_id").eq("provider_model_slug", requestedModelId).limit(1),
		]);
		for (const result of [direct, alias, api, providerApi, providerSlug]) if (result.error) throw result.error;
		const canonicalApiId = direct.data?.model_id ?? alias.data?.api_model_id ?? api.data?.api_model_id ?? providerApi.data?.[0]?.api_model_id ?? providerSlug.data?.[0]?.api_model_id ?? requestedModelId;
		let internalModelId = direct.data?.model_id ?? providerApi.data?.[0]?.model_id ?? providerSlug.data?.[0]?.model_id ?? null;
		if (!internalModelId) { const mapped = await client.from("data_api_provider_models").select("model_id").eq("api_model_id", canonicalApiId).not("model_id", "is", null).limit(1); if (mapped.error) throw mapped.error; internalModelId = mapped.data?.[0]?.model_id ?? null; }
		const lookupModelId = internalModelId ?? canonicalApiId;
		const modelResult = await client.from("data_models").select(`model_id,name,description,status,previous_model_id,organisation_id,hidden,announcement_date,release_date,deprecation_date,retirement_date,license,input_types,output_types,family_id,timeline,updated_at,organisation:data_organisations!data_models_organisation_id_fkey(name,country_code),model_links:data_model_links(url,platform,kind,title),model_family:data_model_families(family_name),model_details:data_model_details(detail_name,detail_value),benchmark_results:data_benchmark_results(id,score,is_self_reported,other_info,source_link,created_at,updated_at,benchmark:data_benchmarks(id,name,category,ascending_order,link,type))`).eq("model_id", lookupModelId).maybeSingle();
		if (modelResult.error) throw modelResult.error;
		const providerSelect = `provider_api_model_id,provider_id,api_model_id,model_id,provider_model_slug,is_active_gateway,routing_status,input_modalities,output_modalities,quantization_scheme,context_length,max_output_tokens,prompt_training_policy_override,prompt_training_override_notes,prompt_training_override_source_url,effective_from,effective_to,created_at,updated_at,data_api_provider_model_capabilities(capability_id,params,max_input_tokens,max_output_tokens,status,effective_from,effective_to),data_api_providers(api_provider_name,provider_family_id,offer_label,offer_scope,colour,link,country_code,status,routing_status,residency_mode,default_execution_regions,default_data_regions,zero_data_retention,residency_source_url,residency_notes,regional_pricing_mode,regional_pricing_uplift_percent,pricing_source_url,regional_pricing_notes,prompt_training_policy,prompt_training_notes,prompt_training_source_url,data_policy_tier,data_policy_confidence,data_policy_contract_mode,data_policy_contract_notes,user_identifier_policy,user_identifier_notes,privacy_policy_url,terms_of_service_url)`;
		const [byInternal, byApi] = await Promise.all([client.from("data_api_provider_models").select(providerSelect).eq("model_id", lookupModelId), client.from("data_api_provider_models").select(providerSelect).eq("api_model_id", canonicalApiId)]);
		if (byInternal.error) throw byInternal.error; if (byApi.error) throw byApi.error;
		const providerMap = new Map<string, Record<string, any>>(); for (const row of [...(byInternal.data ?? []), ...(byApi.data ?? [])] as Array<Record<string, any>>) if (row.provider_api_model_id) providerMap.set(row.provider_api_model_id, row); const providerRows = [...providerMap.values()];
		const modelKeys = providerRows.flatMap((row) => (row.data_api_provider_model_capabilities ?? []).filter((cap: Record<string, unknown>) => cap.capability_id).map((cap: Record<string, unknown>) => `${row.provider_id}:${row.api_model_id}:${cap.capability_id}`));
		const pricing = modelKeys.length ? await client.from("data_api_pricing_rules").select("rule_id,model_key,capability_id,pricing_plan,meter,unit,unit_size,price_per_unit,currency,note,priority,effective_from,effective_to,match,billing_timestamp_basis,time_windows").in("model_key", modelKeys).order("priority", { ascending: false }).order("effective_from", { ascending: false }) : { data: [], error: null }; if (pricing.error) throw pricing.error;
		const modelPlans = internalModelId ? await client.from("data_subscription_plan_models").select("plan_uuid,model_info,rate_limit,other_info").eq("model_id", internalModelId) : { data: [], error: null }; if (modelPlans.error) throw modelPlans.error;
		const planRows = modelPlans.data?.length ? await client.from("data_subscription_plans").select("plan_uuid,plan_id,name,organisation_id,description,frequency,price,currency,link,other_info,created_at,updated_at,organisation:data_organisations!organisation_id(organisation_id,name,colour)").in("plan_uuid", modelPlans.data.map((row) => row.plan_uuid)).order("plan_id", { ascending: true }).order("frequency", { ascending: true }) : { data: [], error: null }; if (planRows.error) throw planRows.error;
		const plans = new Map<string, Record<string, any>>(); for (const row of planRows.data ?? []) { const info = modelPlans.data?.find((item) => item.plan_uuid === row.plan_uuid); const plan = plans.get(row.plan_id) ?? { plan_id: row.plan_id, plan_uuid: row.plan_uuid, name: row.name, organisation_id: row.organisation_id, description: row.description, link: row.link, other_info: row.other_info, created_at: row.created_at, updated_at: row.updated_at, organisation: Array.isArray(row.organisation) ? row.organisation[0] : row.organisation, prices: [], model_info: { model_info: info?.model_info, rate_limit: info?.rate_limit, other_info: info?.other_info } }; plan.prices.push({ price: row.price, currency: row.currency, frequency: row.frequency }); plans.set(row.plan_id, plan); }
		const aliasIds = [...new Set([requestedModelId, canonicalApiId, lookupModelId])]; const aliases = await client.from("data_api_model_aliases").select("api_model_id,alias_slug").in("api_model_id", aliasIds).eq("is_enabled", true).order("alias_slug", { ascending: true }); if (aliases.error) throw aliases.error;
		return c.json({ source: { requestedModelId, canonicalApiId, internalModelId, model: modelResult.data ?? null, providerRows, pricingRules: pricing.data ?? [], subscriptionPlans: [...plans.values()], aliases: aliases.data ?? [] } }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) { console.error("[web-api/account/models] source failed", { requestedModelId, error }); return c.json({ error: "admin_model_source_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS); }
});
