import { cacheLife, cacheTag } from "next/cache";
import { createClient } from "@/utils/supabase/client";

/** mirrors new rules schema */
export interface PricingRule {
    id: string;                 // uuid
    model_key: string;          // `${provider}:${model}:${endpoint}`
    pricing_plan: string;       // standard|batch|flex|priority
    meter: string;              // e.g. input_text_tokens
    unit: string;               // token|image|second|minute|...
    unit_size: number;
    price_per_unit: number;     // numeric -> number (cast below)
    currency: string;           // USD (for now)
    tiering_mode: "flat" | "cliff" | "marginal" | null;
    note: string | null;
    match: any[];               // conditions
    priority: number;
    effective_from: string;     // timestamptz
    effective_to: string | null;
}

export interface ProviderModel {
    id: string;                 // you’re storing composed key in `id`
    api_provider_id: string;
    provider_model_slug?: string | null;
    model_id: string;
    endpoint: string;
    is_active_gateway: boolean;
    input_modalities: string;   // CSV in your current schema
    output_modalities: string;  // CSV in your current schema
    effective_from?: string | null;
    effective_to?: string | null;
    created_at?: string;
    updated_at?: string;
}

export interface ProviderInfo {
    api_provider_id: string;
    api_provider_name: string;
    link?: string | null;
    country_code?: string | null;
}

export interface ProviderPricing {
    provider: ProviderInfo;
    provider_models: ProviderModel[];
    pricing_rules: PricingRule[];
}

/**
 * Fetch pricing information for a model grouped by provider, for rules "active now".
 * If you want to show historical/future windows, add a param and relax the WHERE.
 */
export default async function getModelPricing(modelId: string): Promise<ProviderPricing[]> {
    const supabase = await createClient();

    // 1) Provider models for this modelId
    const { data: pms, error: pmError } = await supabase
        .from("data_api_provider_models")
        .select(`
      id,
      api_provider_id,
      provider_model_slug,
      api_model_id,
      endpoint,
      is_active_gateway,
      input_modalities,
      output_modalities,
      effective_from,
      effective_to,
      created_at,
      updated_at,
      provider:data_api_providers(api_provider_id, api_provider_name, link, country_code)
    `)
        .eq("internal_model_id", modelId);

    if (pmError) throw new Error(pmError.message || "Failed to fetch provider models");

    const providerModels = (pms || []) as any[];

    // Gather keys to fetch rules against
    const modelKeys = Array.from(new Set(providerModels.map(pm => pm.id))).filter(Boolean);
    const nowFilter = {
        // effective_from <= now()
        lte_from: new Date().toISOString(),
    };

    // 2) Current rules for those keys
    let rules: any[] = [];
    if (modelKeys.length) {
        const { data: r, error: prErr } = await supabase
            .from("data_api_pricing_rules")
            .select(`
        id,
        model_key,
        pricing_plan,
        meter,
        unit,
        unit_size,
        price_per_unit,
        currency,
        tiering_mode,
        note,
        match,
        priority,
        effective_from,
        effective_to
      `)
            .in("model_key", modelKeys)
            .lte("effective_from", nowFilter.lte_from)
            .or("effective_to.is.null,effective_to.gt." + nowFilter.lte_from)
            .order("priority", { ascending: false })
            .order("effective_from", { ascending: false });

        if (prErr) throw new Error(prErr.message || "Failed to fetch pricing rules");
        rules = (r || []).map(x => ({ ...x, price_per_unit: Number(x.price_per_unit) }));
    }

    // 3) Group by provider
    const providerMap = new Map<string, ProviderPricing>();

    for (const pm of providerModels) {
        const pid: string = pm.api_provider_id;
        if (!providerMap.has(pid)) {
            const prov = pm.provider || { api_provider_id: pid, api_provider_name: pid };
            providerMap.set(pid, {
                provider: prov,
                provider_models: [],
                pricing_rules: [],
            });
        }
        // normalise provider model record
        providerMap.get(pid)!.provider_models.push({
            id: pm.id,
            api_provider_id: pm.api_provider_id,
            provider_model_slug: pm.provider_model_slug,
            model_id: pm.model_id,
            endpoint: pm.endpoint,
            is_active_gateway: pm.is_active_gateway,
            input_modalities: pm.input_modalities,
            output_modalities: pm.output_modalities,
            effective_from: pm.effective_from,
            effective_to: pm.effective_to,
            created_at: pm.created_at,
            updated_at: pm.updated_at,
        });
    }

    // Attach rules based on model_key → find owning provider via provider_models
    const byKeyToProvider = new Map<string, string>();
    for (const [pid, entry] of providerMap) {
        for (const pm of entry.provider_models) {
            byKeyToProvider.set(pm.id, pid);
        }
    }
    for (const rule of rules as PricingRule[]) {
        const pid = byKeyToProvider.get(rule.model_key);
        if (!pid) continue; // orphaned rule (shouldn’t happen)
        providerMap.get(pid)!.pricing_rules.push(rule);
    }

    // Fill missing provider names if any
    const missing = [...providerMap.values()]
        .filter(p => !p.provider.api_provider_name || p.provider.api_provider_name === p.provider.api_provider_id)
        .map(p => p.provider.api_provider_id);
    if (missing.length) {
        const { data: provs } = await supabase
            .from("data_api_providers")
            .select("api_provider_id, api_provider_name, link, country_code")
            .in("api_provider_id", Array.from(new Set(missing)));
        (provs || []).forEach(p => {
            const slot = providerMap.get(p.api_provider_id);
            if (slot) slot.provider = p;
        });
    }

    return [...providerMap.values()].sort((a, b) => {
        const an = a.provider.api_provider_name || a.provider.api_provider_id;
        const bn = b.provider.api_provider_name || b.provider.api_provider_id;
        return an.localeCompare(bn);
    });
}

/**
 * Cached version of getModelPricing.
 *
 * Usage: await getModelPricingCached(modelId)
 *
 * This wraps the fetcher with `unstable_cache` for at least 1 week of caching.
 */
export async function getModelPricingCached(modelId: string): Promise<ProviderPricing[]> {
    "use cache";

    cacheLife("days");
    cacheTag("data:models");
    cacheTag(`data:models:${modelId}`);
    cacheTag("data:api_pricing_rules");
    cacheTag("data:api_provider_models");

    console.log("[fetch] HIT DB for model pricing", modelId);
    return getModelPricing(modelId);
}
