// src/routes/v1/control/pricing.ts
import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { getSupabaseAdmin } from "@/runtime/env";
import { guardAuth, type GuardErr } from "@pipeline/before/guards";
import { json, withRuntime } from "@/routes/utils";
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

async function handlePricingModels(req: Request) {
    const auth = await guardAuth(req);
    if (!auth.ok) {
        return (auth as GuardErr).response;
    }

    try {
        const supabase = getSupabaseAdmin();
        const nowIso = new Date().toISOString();

        // Get all active provider models
        const { data: providerModels, error: pmError } = await supabase
            .from("data_api_provider_models")
            .select("api_provider_id, model_id, endpoint, is_active_gateway, effective_from, effective_to")
            .eq("is_active_gateway", true)
            .lte("effective_from", nowIso)
            .or(`effective_to.is.null,effective_to.gt.${nowIso}`);

        if (pmError) {
            throw new Error(pmError.message || "Failed to load provider models");
        }

        // Get model names
        const modelIds = Array.from(new Set((providerModels ?? []).map(pm => pm.model_id).filter(Boolean)));
        const { data: models, error: mError } = await supabase
            .from("data_models")
            .select("model_id, name")
            .in("model_id", modelIds);

        if (mError) {
            throw new Error(mError.message || "Failed to load model names");
        }

        const modelNameMap = new Map<string, string>();
        for (const model of models ?? []) {
            if (model.model_id && model.name) {
                modelNameMap.set(model.model_id, model.name);
            }
        }

        // Get pricing rules for each provider/model/endpoint
        const pricingModels: PricingModel[] = [];

        for (const pm of providerModels ?? []) {
            if (!pm.model_id || !pm.api_provider_id || !pm.endpoint) continue;

            const { data: rules, error: rError } = await supabase
                .from("data_api_pricing_rules")
                .select("meter, unit, unit_size, price_per_unit, currency, match, priority")
                .eq("model_key", `${pm.api_provider_id}:${pm.model_id}:${pm.endpoint}`)
                .lte("effective_from", nowIso)
                .or(`effective_to.is.null,effective_to.gt.${nowIso}`)
                .order("priority", { ascending: false });

            if (rError) continue;

            const meters = (rules ?? []).map(rule => ({
                meter: rule.meter,
                unit: rule.unit,
                unit_size: Number(rule.unit_size ?? 1),
                price_per_unit: String(rule.price_per_unit ?? "0"),
                currency: rule.currency ?? "USD",
                conditions: Array.isArray(rule.match) ? rule.match : [],
            }));

            if (meters.length > 0) {
                pricingModels.push({
                    provider: pm.api_provider_id,
                    model: pm.model_id,
                    endpoint: pm.endpoint,
                    display_name: modelNameMap.get(pm.model_id),
                    meters,
                });
            }
        }

        // Sort by provider, then model
        pricingModels.sort((a, b) => {
            if (a.provider !== b.provider) return a.provider.localeCompare(b.provider);
            if (a.model !== b.model) return a.model.localeCompare(b.model);
            return a.endpoint.localeCompare(b.endpoint);
        });

        return json(
            { ok: true, models: pricingModels },
            200,
            { "Cache-Control": "no-store" }
        );
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