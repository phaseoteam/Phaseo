import { Hono } from "hono";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { withPublicCache } from "@/http/cache";

const CACHE = { edgeTtlSeconds: 5 * 60, staleWhileRevalidateSeconds: 5 * 60, cacheTags: ["web-api-gateway-models"] } as const;
export const publicGatewayRouter = new Hono<{ Bindings: Env }>();

async function gatewayModels(env: Env) {
	const client = getDataClient(env); const providerModels: Array<Record<string, unknown>> = [];
	for (let offset = 0; ; offset += 1_000) { const result = await client.from("data_api_provider_models").select("provider_api_model_id,provider_id,api_model_id,model_id,is_active_gateway,effective_from,effective_to").order("provider_api_model_id", { ascending: true }).range(offset, offset + 999); if (result.error) throw result.error; providerModels.push(...((result.data ?? []) as Array<Record<string, unknown>>)); if ((result.data?.length ?? 0) < 1_000) break; }
	const providerModelIds = providerModels.map((row) => String(row.provider_api_model_id ?? "")).filter(Boolean); const capabilities = new Map<string, Set<string>>(); const capabilityParams = new Map<string, Record<string, unknown>>();
	for (let offset = 0; offset < providerModelIds.length; offset += 200) { const result = await client.from("data_api_provider_model_capabilities").select("provider_api_model_id,capability_id,capability_params,status").in("provider_api_model_id", providerModelIds.slice(offset, offset + 200)); if (result.error) throw result.error; for (const row of result.data ?? []) { if (!row.provider_api_model_id || !row.capability_id || ["disabled", "internal_testing"].includes(String(row.status ?? "").toLowerCase())) continue; const values = capabilities.get(row.provider_api_model_id) ?? new Set<string>(); values.add(row.capability_id); capabilities.set(row.provider_api_model_id, values); const params = capabilityParams.get(row.provider_api_model_id) ?? {}; params[String(row.capability_id)] = row.capability_params && typeof row.capability_params === "object" ? row.capability_params : {}; capabilityParams.set(row.provider_api_model_id, params); } }
	const providerIds = [...new Set(providerModels.map((row) => String(row.provider_id ?? "")).filter(Boolean))]; const modelIds = [...new Set(providerModels.map((row) => String(row.model_id ?? "")).filter(Boolean))];
	const idChunkSize = 200;
	const providerResults = await Promise.all(
		Array.from({ length: Math.ceil(providerIds.length / idChunkSize) }, (_, index) =>
			client.from("data_api_providers")
				.select("api_provider_id,api_provider_name,provider_family_id,offer_label,offer_scope,prompt_training_policy")
				.in("api_provider_id", providerIds.slice(index * idChunkSize, (index + 1) * idChunkSize))),
	);
	const modelResults = await Promise.all(
		Array.from({ length: Math.ceil(modelIds.length / idChunkSize) }, (_, index) =>
			client.from("data_models")
				.select("model_id,name,status,organisation_id,previous_model_id,release_date,announcement_date,organisation:data_organisations!data_models_organisation_id_fkey(name)")
				.in("model_id", modelIds.slice(index * idChunkSize, (index + 1) * idChunkSize))
				.eq("hidden", false)),
	);
	for (const result of [...providerResults, ...modelResults]) {
		if (result.error) throw result.error;
	}
	const providers = new Map(providerResults.flatMap((result) => result.data ?? []).map((row) => [row.api_provider_id, row]));
	const models = new Map(modelResults.flatMap((result) => result.data ?? []).map((row) => [row.model_id, row])); const now = Date.now(); const seen = new Set<string>(); const output: Array<Record<string, unknown>> = [];
	for (const row of providerModels) { const providerModelId = String(row.provider_api_model_id ?? ""); const apiModelId = String(row.api_model_id ?? ""); const providerId = String(row.provider_id ?? ""); if (!providerModelId || !apiModelId || !providerId || !capabilities.has(providerModelId)) continue; const key = `${providerId}:${apiModelId}`; if (seen.has(key)) continue; seen.add(key); const model = models.get(String(row.model_id ?? "")); const provider = providers.get(providerId); const organisation = Array.isArray(model?.organisation) ? model.organisation[0] : model?.organisation; const from = row.effective_from ? Date.parse(String(row.effective_from)) : Number.NEGATIVE_INFINITY; const to = row.effective_to ? Date.parse(String(row.effective_to)) : Number.POSITIVE_INFINITY; const isAvailable = Boolean(row.is_active_gateway) && now >= from && now < to && !["deprecated", "retired"].includes(String(model?.status ?? "").toLowerCase()); const internalModelId = model?.model_id ?? null; const selectorModelId = apiModelId.endsWith(":free") && internalModelId && !String(internalModelId).endsWith(":free") ? `${internalModelId}:free` : internalModelId || apiModelId; output.push({ modelId: apiModelId, internalModelId, selectorModelId, providerId, capabilities: [...(capabilities.get(providerModelId) ?? [])], capabilityParamsById: capabilityParams.get(providerModelId) ?? {}, effectiveFrom: row.effective_from ?? null, effectiveTo: row.effective_to ?? null, providerName: provider?.api_provider_name ?? null, providerFamilyId: provider?.provider_family_id ?? null, providerOfferLabel: provider?.offer_label ?? null, providerOfferScope: provider?.offer_scope ?? null, providerPromptTrainingPolicy: provider?.prompt_training_policy ?? null, modelName: model?.name ?? null, modelStatus: model?.status ?? null, organisationId: model?.organisation_id ?? null, organisationName: organisation?.name ?? null, previousModelId: model?.previous_model_id ?? null, releaseDate: model?.release_date ?? null, announcementDate: model?.announcement_date ?? null, isAvailable }); }
	return output.sort((a, b) => String(a.providerId).localeCompare(String(b.providerId)) || String(a.modelId).localeCompare(String(b.modelId)));
}

publicGatewayRouter.get("/gateway/models", async (c) => { try { const models = await gatewayModels(c.env); const availableOnly = c.req.query("available_only") !== "false"; return withPublicCache(c.json({ models: availableOnly ? models.filter((model) => model.isAvailable) : models }), CACHE); } catch (error) { console.error("[web-api/gateway] models failed", error); return c.json({ error: "gateway_models_unavailable" }, 503); } });

publicGatewayRouter.get("/gateway/model-aliases", async (c) => { try { const models = await gatewayModels(c.env); const byId = new Map<string, Record<string, unknown>[]>(); for (const model of models.filter((row) => row.isAvailable)) for (const id of [model.modelId, model.selectorModelId, model.internalModelId]) if (id) byId.set(String(id), [...(byId.get(String(id)) ?? []), model]); const result = await getDataClient(c.env).from("data_api_model_aliases").select("alias_slug,api_model_id").eq("is_enabled", true).order("alias_slug", { ascending: true }); if (result.error) throw result.error; const aliases: Array<Record<string, unknown>> = []; const seen = new Set<string>(); for (const row of result.data ?? []) { const slug = String(row.alias_slug ?? "").trim(); const [resolved] = byId.get(String(row.api_model_id ?? "")) ?? []; if (!slug || !resolved || seen.has(slug)) continue; seen.add(slug); aliases.push({ ...resolved, modelId: slug, selectorModelId: slug, modelName: slug.split(/[\/_-]+/).filter(Boolean).map((part) => part.slice(0, 1).toUpperCase() + part.slice(1)).join(" ") }); } return withPublicCache(c.json({ aliases }), CACHE); } catch (error) { console.error("[web-api/gateway] aliases failed", error); return c.json({ error: "gateway_aliases_unavailable" }, 503); } });
