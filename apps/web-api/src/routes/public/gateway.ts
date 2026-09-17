import { Hono } from "hono";
import { PUBLIC_MODEL_CATALOGUE_CACHE } from "@/cache/catalogue";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { withPublicCache } from "@/http/cache";

const CACHE = PUBLIC_MODEL_CATALOGUE_CACHE;
export const publicGatewayRouter = new Hono<{ Bindings: Env }>();

function normalizeCapabilityId(value: unknown): string {
	const capabilityId = String(value ?? "").trim().toLowerCase();
	return ["rerank.create", "text.rerank"].includes(capabilityId)
		? "rerank"
		: capabilityId;
}

function activeAt(row: { effective_from?: unknown; effective_to?: unknown }, now = Date.now()): boolean {
	const from = row.effective_from ? Date.parse(String(row.effective_from)) : Number.NEGATIVE_INFINITY;
	const to = row.effective_to ? Date.parse(String(row.effective_to)) : Number.POSITIVE_INFINITY;
	return now >= from && now < to;
}

function pricePerMillion(row: any): number | null {
	const quantity = Number(row?.unit_quantity ?? 1);
	const nanos = Number(row?.price_nanos);
	return Number.isFinite(quantity) && quantity > 0 && Number.isFinite(nanos) && nanos >= 0
		? nanos / 1_000_000_000 * (1_000_000 / quantity)
		: null;
}

async function gatewayModels(env: Env) {
	const client = getDataClient(env); const providerModels: Array<Record<string, unknown>> = [];
	for (let offset = 0; ; offset += 1_000) { const result = await client.from("v2_model_provider_routes").select("provider_api_model_id:provider_model_id,provider_id:provider_slug,api_model_id:model_slug,model_id:model_slug,is_active_gateway:routing_enabled,input_modalities,output_modalities,effective_from,effective_to").eq("is_stealth", false).eq("routing_enabled", true).in("status", ["active", "degraded"]).order("provider_model_id", { ascending: true }).range(offset, offset + 999); if (result.error) throw result.error; providerModels.push(...((result.data ?? []) as Array<Record<string, unknown>>)); if ((result.data?.length ?? 0) < 1_000) break; }
	const providerModelIds = providerModels.map((row) => String(row.provider_api_model_id ?? "")).filter(Boolean); const capabilities = new Map<string, Set<string>>(); const capabilityParams = new Map<string, Record<string, unknown>>();
	for (let offset = 0; offset < providerModelIds.length; offset += 200) { const result = await client.from("v2_route_capabilities").select("provider_api_model_id:provider_model_id,capability_id,params,status").in("provider_model_id", providerModelIds.slice(offset, offset + 200)); if (result.error) throw result.error; for (const row of result.data ?? []) { const capabilityId = normalizeCapabilityId(row.capability_id); if (!row.provider_api_model_id || !capabilityId || ["disabled", "internal_testing"].includes(String(row.status ?? "").toLowerCase())) continue; const values = capabilities.get(row.provider_api_model_id) ?? new Set<string>(); values.add(capabilityId); capabilities.set(row.provider_api_model_id, values); const params = capabilityParams.get(row.provider_api_model_id) ?? {}; params[capabilityId] = row.params && typeof row.params === "object" ? row.params : {}; capabilityParams.set(row.provider_api_model_id, params); } }
	const pricingSkuResults = await Promise.all(Array.from({ length: Math.ceil(providerModelIds.length / 200) }, (_, index) => client.from("v2_pricing_skus").select("sku_id,provider_model_id,service_tier_slug,status,effective_from,effective_to").in("provider_model_id", providerModelIds.slice(index * 200, (index + 1) * 200)).eq("service_tier_slug", "standard").neq("status", "disabled")));
	for (const result of pricingSkuResults) if (result.error) throw result.error;
	const pricingSkus = pricingSkuResults.flatMap((result) => result.data ?? []).filter((row) => activeAt(row));
	const skuIds = pricingSkus.map((row) => String(row.sku_id ?? "")).filter(Boolean);
	const pricingMeterResults = await Promise.all(Array.from({ length: Math.ceil(skuIds.length / 200) }, (_, index) => client.from("v2_pricing_sku_meters").select("sku_id,meter_key,unit_quantity,price_nanos").in("sku_id", skuIds.slice(index * 200, (index + 1) * 200))));
	for (const result of pricingMeterResults) if (result.error) throw result.error;
	const metersBySku = new Map<string, any[]>();
	for (const meter of pricingMeterResults.flatMap((result) => result.data ?? [])) { const skuId = String(meter.sku_id ?? ""); metersBySku.set(skuId, [...(metersBySku.get(skuId) ?? []), meter]); }
	const pricesByProviderModel = new Map<string, { input: number | null; output: number | null }>();
	for (const sku of pricingSkus) { const meters = metersBySku.get(String(sku.sku_id ?? "")) ?? []; const input = meters.filter((meter) => String(meter.meter_key) === "input_text_tokens").map(pricePerMillion).filter((value): value is number => value !== null); const output = meters.filter((meter) => String(meter.meter_key) === "output_text_tokens").map(pricePerMillion).filter((value): value is number => value !== null); const providerModelId = String(sku.provider_model_id ?? ""); const existing = pricesByProviderModel.get(providerModelId) ?? { input: null, output: null }; pricesByProviderModel.set(providerModelId, { input: input.length ? Math.min(existing.input ?? Number.POSITIVE_INFINITY, ...input) : existing.input, output: output.length ? Math.min(existing.output ?? Number.POSITIVE_INFINITY, ...output) : existing.output }); }
	const providerIds = [...new Set(providerModels.map((row) => String(row.provider_id ?? "")).filter(Boolean))]; const modelIds = [...new Set(providerModels.map((row) => String(row.model_id ?? "")).filter(Boolean))];
	const idChunkSize = 200;
	const providerResults = await Promise.all(
		Array.from({ length: Math.ceil(providerIds.length / idChunkSize) }, (_, index) =>
			client.from("v2_providers")
				.select("api_provider_id:provider_slug,api_provider_name:name,provider_family_id:provider_family_slug,offer_label,offer_scope,prompt_training_policy")
				.in("provider_slug", providerIds.slice(index * idChunkSize, (index + 1) * idChunkSize))),
	);
	const modelResults = await Promise.all(
		Array.from({ length: Math.ceil(modelIds.length / idChunkSize) }, (_, index) =>
			client.from("v2_models")
				.select("model_id:model_slug,name,status,organisation_id:lab_slug,input_modalities,output_modalities,previous_model_id:previous_model_slug,release_date:released_at,announcement_date:announced_at,deprecation_date:deprecated_at,retirement_date:retired_at")
				.in("model_slug", modelIds.slice(index * idChunkSize, (index + 1) * idChunkSize))
				.eq("hidden", false)
				.neq("status", "disabled")),
	);
	for (const result of [...providerResults, ...modelResults]) {
		if (result.error) throw result.error;
	}
	const providers = new Map(providerResults.flatMap((result) => result.data ?? []).map((row) => [row.api_provider_id, row]));
	const models = new Map(modelResults.flatMap((result) => result.data ?? []).map((row) => [row.model_id, row]));
	const labIds = [...new Set(Array.from(models.values()).map((model) => String(model.organisation_id ?? "")).filter(Boolean))];
	const labResults = await Promise.all(
		Array.from({ length: Math.ceil(labIds.length / idChunkSize) }, (_, index) =>
			client.from("v2_labs")
				.select("lab_slug,name")
				.in("lab_slug", labIds.slice(index * idChunkSize, (index + 1) * idChunkSize))),
	);
	for (const result of labResults) {
		if (result.error) throw result.error;
	}
	const labs = new Map(labResults.flatMap((result) => result.data ?? []).map((row) => [row.lab_slug, row]));
	const now = Date.now(); const seen = new Set<string>(); const output: Array<Record<string, unknown>> = [];
	for (const row of providerModels) { const providerModelId = String(row.provider_api_model_id ?? ""); const apiModelId = String(row.api_model_id ?? ""); const providerId = String(row.provider_id ?? ""); if (!providerModelId || !apiModelId || !providerId || !capabilities.has(providerModelId)) continue; const key = `${providerId}:${apiModelId}`; if (seen.has(key)) continue; seen.add(key); const model = models.get(String(row.model_id ?? "")); const provider = providers.get(providerId); const from = row.effective_from ? Date.parse(String(row.effective_from)) : Number.NEGATIVE_INFINITY; const to = row.effective_to ? Date.parse(String(row.effective_to)) : Number.POSITIVE_INFINITY; const retirementDate = model?.retirement_date ? Date.parse(String(model.retirement_date)) : Number.POSITIVE_INFINITY; const status = String(model?.status ?? "").toLowerCase(); const isAvailable = Boolean(row.is_active_gateway) && now >= from && now < to && now < retirementDate && status !== "retired"; const internalModelId = model?.model_id ?? null; const selectorModelId = internalModelId || apiModelId; const inputModalities = Array.isArray(row.input_modalities) && row.input_modalities.length > 0 ? row.input_modalities : model?.input_modalities ?? []; const outputModalities = Array.isArray(row.output_modalities) && row.output_modalities.length > 0 ? row.output_modalities : model?.output_modalities ?? []; const prices = pricesByProviderModel.get(providerModelId); output.push({ modelId: apiModelId, internalModelId, selectorModelId, providerId, capabilities: [...(capabilities.get(providerModelId) ?? [])], capabilityParamsById: capabilityParams.get(providerModelId) ?? {}, inputModalities, outputModalities, effectiveFrom: row.effective_from ?? null, effectiveTo: row.effective_to ?? null, providerName: provider?.api_provider_name ?? null, providerFamilyId: provider?.provider_family_id ?? null, providerOfferLabel: provider?.offer_label ?? null, providerOfferScope: provider?.offer_scope ?? null, providerPromptTrainingPolicy: provider?.prompt_training_policy ?? null, modelName: model?.name ?? null, modelStatus: model?.status ?? null, organisationId: model?.organisation_id ?? null, organisationName: labs.get(model?.organisation_id ?? "")?.name ?? null, previousModelId: model?.previous_model_id ?? null, releaseDate: model?.release_date ?? null, announcementDate: model?.announcement_date ?? null, inputPricePerMillion: prices?.input ?? null, outputPricePerMillion: prices?.output ?? null, isAvailable }); }
	return output.sort((a, b) => String(a.providerId).localeCompare(String(b.providerId)) || String(a.modelId).localeCompare(String(b.modelId)));
}

publicGatewayRouter.get("/gateway/models", async (c) => { try { const models = await gatewayModels(c.env); const availableOnly = c.req.query("available_only") !== "false"; return withPublicCache(c.json({ models: availableOnly ? models.filter((model) => model.isAvailable) : models }), CACHE); } catch (error) { console.error("[web-api/gateway] models failed", error); return c.json({ error: "gateway_models_unavailable" }, 503); } });

publicGatewayRouter.get("/gateway/model-aliases", async (c) => { try { const models = await gatewayModels(c.env); const byId = new Map<string, Record<string, unknown>[]>(); for (const model of models.filter((row) => row.isAvailable)) for (const id of [model.modelId, model.selectorModelId, model.internalModelId]) if (id) byId.set(String(id), [...(byId.get(String(id)) ?? []), model]); const result = await getDataClient(c.env).from("v2_model_aliases").select("alias_slug,api_model_id:model_slug").eq("enabled", true).order("alias_slug", { ascending: true }); if (result.error) throw result.error; const aliases: Array<Record<string, unknown>> = []; const seen = new Set<string>(); for (const row of result.data ?? []) { const slug = String(row.alias_slug ?? "").trim(); const [resolved] = byId.get(String(row.api_model_id ?? "")) ?? []; if (!slug || !resolved || seen.has(slug)) continue; seen.add(slug); aliases.push({ ...resolved, modelId: slug, selectorModelId: slug, modelName: slug.split(/[\/_-]+/).filter(Boolean).map((part) => part.slice(0, 1).toUpperCase() + part.slice(1)).join(" ") }); } return withPublicCache(c.json({ aliases }), CACHE); } catch (error) { console.error("[web-api/gateway] aliases failed", error); return c.json({ error: "gateway_aliases_unavailable" }, 503); } });
