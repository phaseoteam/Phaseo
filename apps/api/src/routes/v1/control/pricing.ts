// src/routes/v1/control/pricing.ts
// Purpose: Control-plane route handler for pricing operations.
// Why: Separates admin/control traffic from data-plane requests.
// How: Wires HTTP routes to pipeline entrypoints and response helpers.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { getSupabaseAdmin } from "@/runtime/env";
import { guardAuth, type GuardErr } from "@pipeline/before/guards";
import { json, withRuntime, cacheHeaders, cacheResponse } from "@/routes/utils";
import type { PriceCard } from "@pipeline/pricing/types";

type PricingModel = {
    provider: string;
    model: string;
    endpoint: string;
    display_name?: string;
    meters: Array<{
        meter: string;
        unit: string;
        unit_size: number;
        price_per_unit: string;
        currency: string;
        conditions?: any[];
    }>;
};

function parseModelKey(value?: string | null): {
    providerId: string;
    apiModelId: string;
    capabilityId: string;
} | null {
    if (!value) return null;
    const parts = value.split(":");
    if (parts.length < 3) return null;
    const capabilityId = parts.pop() ?? "";
    const providerId = parts.shift() ?? "";
    const apiModelId = parts.join(":");
    if (!providerId || !apiModelId || !capabilityId) return null;
    return { providerId, apiModelId, capabilityId };
}

async function handlePricingModels(req: Request) {
    const auth = await guardAuth(req);
    if (!auth.ok) {
        return (auth as GuardErr).response;
    }

    try {
        const supabase = getSupabaseAdmin();
        const nowIso = new Date().toISOString();

        const { data: providerModels, error: pmError } = await supabase
            .from("data_api_provider_models")
            .select("provider_api_model_id, provider_id, api_model_id, internal_model_id, is_active_gateway, effective_from, effective_to")
            .eq("is_active_gateway", true)
            .lte("effective_from", nowIso)
            .or(`effective_to.is.null,effective_to.gt.${nowIso}`);

        if (pmError) {
            throw new Error(pmError.message || "Failed to load provider models");
        }

        const providerModelIds = (providerModels ?? [])
            .map((row) => row.provider_api_model_id)
            .filter((id): id is string => Boolean(id));

        const { data: capabilities, error: capError } = await supabase
            .from("data_api_provider_model_capabilities")
            .select("provider_api_model_id, capability_id, effective_from, effective_to")
            .eq("status", "active")
            .in("provider_api_model_id", providerModelIds)
            .lte("effective_from", nowIso)
            .or(`effective_to.is.null,effective_to.gt.${nowIso}`);

        if (capError) {
            throw new Error(capError.message || "Failed to load provider capabilities");
        }

        // Get model names
        const modelIds = Array.from(
            new Set((providerModels ?? []).map(pm => pm.internal_model_id).filter(Boolean))
        );
        const { data: models, error: mError } = await supabase
            .from("data_models")
            .select("model_id, name, hidden")
            .in("model_id", modelIds);

        if (mError) {
            throw new Error(mError.message || "Failed to load model names");
        }

        const modelNameMap = new Map<string, string>();
        const visibleModelIds = new Set<string>();
        for (const model of models ?? []) {
            if (model.model_id && model.name) {
                modelNameMap.set(model.model_id, model.name);
            }
            if (model.model_id && !model.hidden) {
                visibleModelIds.add(model.model_id);
            }
        }

        const { data: pricingRules, error: prError } = await supabase
            .from("data_api_pricing_rules")
            .select("rule_id, model_key, capability_id, pricing_plan, meter, unit, unit_size, price_per_unit, currency, priority, effective_from, effective_to, match")
            .or([
                "and(effective_from.is.null,effective_to.is.null)",
                `and(effective_from.is.null,effective_to.gt.${nowIso})`,
                `and(effective_from.lte.${nowIso},effective_to.is.null)`,
                `and(effective_from.lte.${nowIso},effective_to.gt.${nowIso})`,
            ].join(","))
            .order("priority", { ascending: false });

        if (prError) {
            throw new Error(prError.message || "Failed to load pricing rules");
        }

        const providerById = new Map<string, any>();
        for (const row of providerModels ?? []) {
            if (row.provider_api_model_id) providerById.set(row.provider_api_model_id, row);
        }

        const comboMap = new Map<string, { internal_model_id: string | null }>();
        for (const cap of capabilities ?? []) {
            if (!cap.provider_api_model_id || !cap.capability_id) continue;
            const pm = providerById.get(cap.provider_api_model_id);
            if (!pm) continue;
            const comboKey = `${pm.provider_id}:${pm.api_model_id}:${cap.capability_id}`;
            comboMap.set(comboKey, { internal_model_id: pm.internal_model_id ?? null });
        }

        const modelMap = new Map<string, PricingModel>();
        for (const rule of (pricingRules ?? []) as any[]) {
            const parsedKey = parseModelKey(rule.model_key);
            if (!parsedKey) continue;
            const capabilityId = parsedKey.capabilityId || rule.capability_id;
            const comboKey = `${parsedKey.providerId}:${parsedKey.apiModelId}:${capabilityId}`;
            const combo = comboMap.get(comboKey);
            if (!combo) continue;
            if (combo.internal_model_id && !visibleModelIds.has(combo.internal_model_id)) {
                continue;
            }
            const modelId = combo.internal_model_id ?? parsedKey.apiModelId;
            const key = `${parsedKey.providerId}:${modelId}:${capabilityId}:${rule.pricing_plan || "standard"}`;

            if (!modelMap.has(key)) {
                modelMap.set(key, {
                    provider: parsedKey.providerId,
                    model: modelId,
                    endpoint: capabilityId,
                    display_name: combo.internal_model_id
                        ? modelNameMap.get(combo.internal_model_id)
                        : undefined,
                    meters: [],
                });
            }

            const model = modelMap.get(key)!;
            model.meters.push({
                meter: rule.meter,
                unit: rule.unit,
                unit_size: Number(rule.unit_size ?? 1),
                price_per_unit: String(rule.price_per_unit ?? "0"),
                currency: rule.currency ?? "USD",
                conditions: Array.isArray(rule.match) ? rule.match : [],
            });
        }

        const pricingModels = Array.from(modelMap.values());

        // Sort by provider, then model
        pricingModels.sort((a, b) => {
            if (a.provider !== b.provider) return a.provider.localeCompare(b.provider);
            if (a.model !== b.model) return a.model.localeCompare(b.model);
            return a.endpoint.localeCompare(b.endpoint);
        });

        const cacheOptions = {
            scope: `pricing-models:${auth.value.teamId}`,
            ttlSeconds: 300,
            staleSeconds: 600,
        };
        const response = json(
            { ok: true, models: pricingModels },
            200,
            cacheHeaders(cacheOptions)
        );
        return cacheResponse(req, response, cacheOptions);
    } catch (error: any) {
        return json(
            { ok: false, error: "failed", message: String(error?.message ?? error) },
            500,
            { "Cache-Control": "no-store" }
        );
    }
}

async function handlePricingCalculate(req: Request) {
    const auth = await guardAuth(req);
    if (!auth.ok) {
        return (auth as GuardErr).response;
    }

    try {
        const body = await req.json();
        const { provider, model, endpoint, usage } = body;

        if (!provider || !model || !endpoint || !usage) {
            return json(
                { ok: false, error: "missing_required_fields", message: "provider, model, endpoint, and usage are required" },
                400
            );
        }

        // Load the price card
        const { loadPriceCard } = await import("@pipeline/pricing/loader");
        const { computeBillSummary } = await import("@pipeline/pricing/engine");

        const card = await loadPriceCard(provider, model, endpoint);
        if (!card) {
            return json(
                { ok: false, error: "pricing_not_found", message: "No pricing data found for this model" },
                404
            );
        }

        // Calculate pricing
        const result = computeBillSummary(usage, card, {}, "standard");

        return json(
            { ok: true, pricing: result },
            200,
            { "Cache-Control": "no-store" }
        );
    } catch (error: any) {
        return json(
            { ok: false, error: "calculation_failed", message: String(error?.message ?? error) },
            500,
            { "Cache-Control": "no-store" }
        );
    }
}

export const pricingRoutes = new Hono<Env>();

pricingRoutes.get("/models", withRuntime(handlePricingModels));
pricingRoutes.post("/calculate", withRuntime(handlePricingCalculate));











