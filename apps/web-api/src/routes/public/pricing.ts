import { Hono } from "hono";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { withPublicCache } from "@/http/cache";

export const publicPricingRouter = new Hono<{ Bindings: Env }>();

publicPricingRouter.get("/pricing/models", async (c) => {
	try {
		const client = getDataClient(c.env); const now = Date.now();
		const active = (row: Record<string, unknown>) => { const from = row.effective_from ? Date.parse(String(row.effective_from)) : Number.NEGATIVE_INFINITY; const to = row.effective_to ? Date.parse(String(row.effective_to)) : Number.POSITIVE_INFINITY; return now >= from && now < to; };
		const providerResult = await client.from("data_api_provider_models").select("provider_api_model_id,provider_id,api_model_id,model_id,is_active_gateway,effective_from,effective_to").eq("is_active_gateway", true);
		if (providerResult.error) throw providerResult.error;
		const providerRows = ((providerResult.data ?? []) as Array<Record<string, unknown>>).filter(active);
		const providerIds = providerRows.map((row) => String(row.provider_api_model_id ?? "")).filter(Boolean);
		const capabilities: Array<Record<string, unknown>> = [];
		for (let offset = 0; offset < providerIds.length; offset += 250) { const result = await client.from("data_api_provider_model_capabilities").select("provider_api_model_id,capability_id,status").in("provider_api_model_id", providerIds.slice(offset, offset + 250)).neq("status", "disabled"); if (result.error) throw result.error; capabilities.push(...((result.data ?? []) as Array<Record<string, unknown>>)); }
		const modelIds = [...new Set(providerRows.map((row) => String(row.model_id ?? "")).filter(Boolean))];
		const modelsResult = modelIds.length ? await client.from("data_models").select("model_id,name,release_date,announcement_date").in("model_id", modelIds).eq("hidden", false) : { data: [], error: null };
		if (modelsResult.error) throw modelsResult.error;
		const visible = new Map((modelsResult.data ?? []).map((row) => [row.model_id, row]));
		const providerById = new Map(providerRows.map((row) => [row.provider_api_model_id, row]));
		const combos = new Map<string, { modelId: string | null; apiModelId: string }>();
		for (const capability of capabilities) { const provider = providerById.get(capability.provider_api_model_id); const endpoint = String(capability.capability_id ?? ""); if (!provider || !endpoint) continue; const apiModelId = String(provider.api_model_id ?? ""); combos.set(`${provider.provider_id}:${apiModelId}:${endpoint}`, { modelId: provider.model_id ? String(provider.model_id) : null, apiModelId }); }
		const keys = [...combos.keys()]; const rules: Array<Record<string, unknown>> = [];
		for (let offset = 0; offset < keys.length; offset += 250) { const result = await client.from("data_api_pricing_rules").select("rule_id,model_key,capability_id,pricing_plan,meter,unit,unit_size,price_per_unit,currency,priority,effective_from,effective_to,match,billing_timestamp_basis,time_windows").in("model_key", keys.slice(offset, offset + 250)).order("priority", { ascending: false }); if (result.error) throw result.error; rules.push(...((result.data ?? []) as Array<Record<string, unknown>>).filter(active)); }
		const result = new Map<string, Record<string, any>>();
		for (const rule of rules) { const key = String(rule.model_key ?? ""); const combo = combos.get(key); if (!combo || (combo.modelId && !visible.has(combo.modelId))) continue; const first = key.indexOf(":"); const last = key.lastIndexOf(":"); if (first <= 0 || last <= first) continue; const provider = key.slice(0, first); const apiModelId = key.slice(first + 1, last); const endpoint = String(rule.capability_id ?? key.slice(last + 1)); const modelId = combo.modelId ?? apiModelId; const groupKey = `${provider}:${modelId}:${endpoint}:${rule.pricing_plan || "standard"}`; const metadata = combo.modelId ? visible.get(combo.modelId) : null; const group = result.get(groupKey) ?? { provider, model: modelId, api_model_id: combo.apiModelId, endpoint, display_name: metadata?.name ?? undefined, release_date: metadata?.release_date ?? null, announcement_date: metadata?.announcement_date ?? null, pricing_plan: rule.pricing_plan || "standard", meters: [] }; const meter = { meter: String(rule.meter ?? ""), unit: String(rule.unit ?? ""), unit_size: Number(rule.unit_size ?? 1), price_per_unit: String(rule.price_per_unit ?? "0"), currency: String(rule.currency ?? "USD"), conditions: Array.isArray(rule.match) ? rule.match : [], billing_timestamp_basis: rule.billing_timestamp_basis ?? "request_start", time_windows: Array.isArray(rule.time_windows) ? rule.time_windows : [] }; const existing = group.meters.findIndex((item: Record<string, unknown>) => item.meter === meter.meter && item.unit === meter.unit && item.currency === meter.currency); if (existing < 0) group.meters.push(meter); else { const old = Number(group.meters[existing].price_per_unit) / (Number(group.meters[existing].unit_size) || 1); const next = Number(meter.price_per_unit) / (meter.unit_size || 1); if (next < old) group.meters[existing] = meter; } result.set(groupKey, group); }
		const models = [...result.values()].sort((a, b) => String(a.provider).localeCompare(String(b.provider)) || String(a.model).localeCompare(String(b.model)) || String(a.endpoint).localeCompare(String(b.endpoint)));
		return withPublicCache(c.json({ models }), { edgeTtlSeconds: 60 * 60, staleWhileRevalidateSeconds: 24 * 60 * 60, cacheTags: ["web-api-pricing-models"] });
	} catch (error) { console.error("[web-api/pricing] models failed", error); return c.json({ error: "pricing_models_unavailable" }, 503); }
});
