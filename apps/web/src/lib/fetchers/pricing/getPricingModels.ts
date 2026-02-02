import { cacheLife, cacheTag } from "next/cache";
import { createClient } from "@/utils/supabase/client";
import { applyHiddenFilter } from "@/lib/fetchers/models/visibility";

export interface PricingMeter {
    meter: string;
    unit: string;
    unit_size: number;
    price_per_unit: string;
    currency: string;
    conditions?: any[];
}

export interface PricingModel {
    provider: string;
    model: string;
    endpoint: string;
    display_name?: string;
    pricing_plan?: string | null;
    meters: PricingMeter[];
}

interface PricingRuleRow {
    rule_id: string;
    model_key: string;
    capability_id: string;
    pricing_plan: string | null;
    meter: string;
    unit: string;
    unit_size: number;
    price_per_unit: string;
    currency: string;
    priority: number;
    effective_from: string;
    effective_to: string | null;
    match: any[] | null;
}

const parseModelKey = (modelKey: string) => {
    const first = modelKey.indexOf(":");
    const last = modelKey.lastIndexOf(":");
    if (first <= 0 || last <= first) return null;
    return {
        provider_id: modelKey.slice(0, first),
        api_model_id: modelKey.slice(first + 1, last),
        capability_id: modelKey.slice(last + 1),
    };
};

/**
 * Fetch all models that have pricing rules configured, grouped by provider/model/endpoint
 */
export default async function getPricingModels(
    includeHidden: boolean
): Promise<PricingModel[]> {
    const supabase = await createClient();
    const nowIso = new Date().toISOString();

    const { data: providerModels, error: pmError } = await supabase
        .from("data_api_provider_models")
        .select(
            "provider_api_model_id, provider_id, api_model_id, internal_model_id, provider_model_slug, is_active_gateway, effective_from, effective_to"
        )
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
        .select("provider_api_model_id, capability_id, status")
        .in("provider_api_model_id", providerModelIds)
        .neq("status", "disabled");

    if (capError) {
        throw new Error(capError.message || "Failed to load provider capabilities");
    }

    const { data: pricingRules, error: prError } = await supabase
        .from("data_api_pricing_rules")
        .select(
            "rule_id, model_key, capability_id, pricing_plan, meter, unit, unit_size, price_per_unit, currency, priority, effective_from, effective_to, match"
        )
        .lte("effective_from", nowIso)
        .or(`effective_to.is.null,effective_to.gt.${nowIso}`)
        .order("priority", { ascending: false });

    if (prError) {
        throw new Error(prError.message || "Failed to load pricing rules");
    }

    const modelNameMap = new Map<string, string>();
    const visibleInternalIds = new Set<string>();
    const internalIds = Array.from(
        new Set((providerModels ?? []).map((row) => row.internal_model_id).filter(Boolean))
    );
    if (internalIds.length) {
        const { data: models } = await applyHiddenFilter(
            supabase
                .from("data_models")
                .select("model_id, name, hidden")
                .in("model_id", internalIds),
            includeHidden
        );
        for (const model of models ?? []) {
            if (model.model_id) {
                visibleInternalIds.add(model.model_id);
                if (model.name) modelNameMap.set(model.model_id, model.name);
            }
        }
    }

    const modelMap = new Map<string, PricingModel>();
    const providerById = new Map<string, any>();
    for (const row of providerModels ?? []) {
        if (row.provider_api_model_id) {
            providerById.set(row.provider_api_model_id, row);
        }
    }

    const comboMap = new Map<string, { internal_model_id: string | null }>();
    for (const cap of capabilities ?? []) {
        if (!cap.provider_api_model_id || !cap.capability_id) continue;
        const pm = providerById.get(cap.provider_api_model_id);
        if (!pm) continue;
        const comboKey = `${pm.provider_id}:${pm.api_model_id}:${cap.capability_id}`;
        comboMap.set(comboKey, {
            internal_model_id: pm.internal_model_id ?? null,
        });
    }

    for (const rule of (pricingRules ?? []) as PricingRuleRow[]) {
        const parsed = parseModelKey(rule.model_key);
        if (!parsed) continue;
        const comboKey = `${parsed.provider_id}:${parsed.api_model_id}:${rule.capability_id}`;
        const combo = comboMap.get(comboKey);
        if (!combo) continue;
        if (!includeHidden && combo.internal_model_id && !visibleInternalIds.has(combo.internal_model_id)) {
            continue;
        }
        const modelId = combo.internal_model_id ?? parsed.api_model_id;
        const key = `${parsed.provider_id}:${modelId}:${rule.capability_id}:${rule.pricing_plan || "standard"}`;

        if (!modelMap.has(key)) {
            modelMap.set(key, {
                provider: parsed.provider_id,
                model: modelId,
                endpoint: rule.capability_id,
                display_name: combo.internal_model_id
                    ? modelNameMap.get(combo.internal_model_id)
                    : undefined,
                pricing_plan: rule.pricing_plan || "standard",
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
            conditions: rule.match ?? [],
        });
    }

    const pricingModels = Array.from(modelMap.values());

    pricingModels.sort((a, b) => {
        if (a.provider !== b.provider) return a.provider.localeCompare(b.provider);
        if (a.model !== b.model) return a.model.localeCompare(b.model);
        return a.endpoint.localeCompare(b.endpoint);
    });

    return pricingModels;
}

/**
 * Cached version of getPricingModels.
 */
export async function getPricingModelsCached(
    includeHidden: boolean
): Promise<PricingModel[]> {
    "use cache";

    cacheLife("hours"); // Cache for shorter time since pricing can change
    cacheTag("data:data_api_pricing_rules");
    cacheTag("data:data_api_provider_models");
    cacheTag("data:models");

    return getPricingModels(includeHidden);
}
