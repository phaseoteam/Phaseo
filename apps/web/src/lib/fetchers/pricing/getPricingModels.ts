import { cacheLife, cacheTag } from "next/cache";
import { createClient } from "@/utils/supabase/client";

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
    meters: PricingMeter[];
}

interface PricingRuleWithModel {
    meter: string;
    unit: string;
    unit_size: number;
    price_per_unit: string;
    currency: string;
    match: any;
    priority: number;
    effective_from: string;
    effective_to: string | null;
    data_api_provider_models: {
        id: string;
        api_provider_id: string;
        internal_model_id: string;
        endpoint: string;
        is_active_gateway: boolean;
        effective_from: string;
        effective_to: string | null;
        data_models: {
            model_id: string;
            name: string;
        } | null;
    };
}

/**
 * Fetch all models that have pricing rules configured, grouped by provider/model/endpoint
 */
export default async function getPricingModels(): Promise<PricingModel[]> {
    const supabase = await createClient();
    const nowIso = new Date().toISOString();

    const { data: pricingRules, error: prError } = await supabase
        .from("data_api_pricing_rules")
        .select(`
            meter,
            unit,
            unit_size,
            price_per_unit,
            currency,
            match,
            priority,
            effective_from,
            effective_to,
            data_api_provider_models!inner(
                id,
                api_provider_id,
                internal_model_id,
                endpoint,
                is_active_gateway,
                effective_from,
                effective_to,
                data_models(model_id, name)
            )
        `)
        .eq("data_api_provider_models.is_active_gateway", true)
        .lte("data_api_provider_models.effective_from", nowIso)
        .is("data_api_provider_models.effective_to", null)
        .lte("effective_from", nowIso)
        .is("effective_to", null)
        .order("priority", { ascending: false });

    if (prError) {
        throw new Error(prError.message || "Failed to load pricing rules");
    }

    const typedPricingRules = pricingRules as unknown as PricingRuleWithModel[];

    const modelMap = new Map<string, PricingModel>();

    for (const rule of typedPricingRules ?? []) {
        const pm = rule.data_api_provider_models;
        if (!pm) continue;
        const key = `${pm.api_provider_id}:${pm.internal_model_id}:${pm.endpoint}`;

        if (!modelMap.has(key)) {
            modelMap.set(key, {
                provider: pm.api_provider_id,
                model: pm.internal_model_id,
                endpoint: pm.endpoint,
                display_name: pm.data_models?.name,
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
export async function getPricingModelsCached(): Promise<PricingModel[]> {
    "use cache";

    cacheLife("hours"); // Cache for shorter time since pricing can change
    cacheTag("data:api_pricing_rules");
    cacheTag("data:api_provider_models");
    cacheTag("data:models");

    return getPricingModels();
}
