import { cacheLife, cacheTag } from "next/cache";
import { createClient } from "@/utils/supabase/client";

/** mirrors new rules schema */
export interface PricingRule {
    id: string;                 // rule_id
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
    id: string;                 // provider_api_model_id
    api_provider_id: string;
    provider_model_slug?: string | null;
    model_id: string;
    endpoint: string;
    is_active_gateway: boolean;
    input_modalities: string;   // CSV in your current schema
    output_modalities: string;  // CSV in your current schema
    quantization_scheme?: string | null;
    effective_from?: string | null;
    effective_to?: string | null;
    created_at?: string;
    updated_at?: string;
    params?: Record<string, unknown> | null;
    max_input_tokens?: number | null;
    max_output_tokens?: number | null;
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

type ProviderModelCapability = {
    capability_id?: string | null;
    params?: Record<string, unknown> | null;
    max_input_tokens?: number | null;
    max_output_tokens?: number | null;
    status?: string | null;
};

export default async function getModelPricing(
    modelId: string,
    includeHidden: boolean
): Promise<ProviderPricing[]> {
    // console.log(`[getModelPricing] Starting for modelId: ${modelId}`);
    const supabase = await createClient();

    const { data: modelRow, error: modelError } = await supabase
        .from("data_models")
        .select("hidden")
        .eq("model_id", modelId)
        .maybeSingle();

    if (modelError) throw new Error(modelError.message || "Failed to load model metadata");
    if (!modelRow || (!includeHidden && modelRow.hidden)) {
        throw new Error("Model not found");
    }

    // Fetch provider models with capabilities and provider info in one query
    const { data: pmRows, error: pmError } = await supabase
        .from("data_api_provider_models")
        .select(`
            provider_api_model_id,
            provider_id,
            api_model_id,
            provider_model_slug,
            internal_model_id,
            is_active_gateway,
            input_modalities,
            output_modalities,
            quantization_scheme,
            effective_from,
            effective_to,
            created_at,
            updated_at,
            data_api_provider_model_capabilities (
                capability_id,
                params,
                max_input_tokens,
                max_output_tokens,
                status
            ),
            data_api_providers (
                api_provider_name,
                link,
                country_code
            )
        `)
        .eq("internal_model_id", modelId);

    if (pmError) throw new Error(pmError.message || "Failed to fetch provider models");

    // console.log(`[getModelPricing] Fetched ${pmRows?.length || 0} provider model rows for providers: ${(pmRows ?? []).map(r => r.provider_id).join(', ')}`);

    // Build provider models list
    const providerModels: any[] = [];
    const providerMap = new Map<string, ProviderPricing>();

    const providerModelPrefixes = new Set<string>();

    for (const row of (pmRows ?? []) as any[]) {
        // console.log(`[getModelPricing] Processing row:`, JSON.stringify(row, null, 2));
        const pid = row.provider_id;
        const apiModelId = row.api_model_id;
        if (pid && apiModelId) {
            providerModelPrefixes.add(`${pid}:${apiModelId}:`);
        }
        if (!providerMap.has(pid)) {
            providerMap.set(pid, {
                provider: {
                    api_provider_id: pid,
                    api_provider_name: row.data_api_providers?.api_provider_name || pid,
                    link: row.data_api_providers?.link || null,
                    country_code: row.data_api_providers?.country_code || null,
                },
                provider_models: [],
                pricing_rules: [],
            });
        }

        const capabilities = Array.isArray(row.data_api_provider_model_capabilities)
            ? (row.data_api_provider_model_capabilities as ProviderModelCapability[])
            : [];
        const enabledCapabilities = capabilities.filter((cap) => cap?.status !== "disabled");
        const entry = providerMap.get(pid)!;

        for (const capability of enabledCapabilities) {
            if (!capability?.capability_id) continue;
            const providerModel: ProviderModel = {
                id: row.provider_api_model_id,
                api_provider_id: row.provider_id,
                provider_model_slug: row.provider_model_slug,
                model_id: row.api_model_id,
                endpoint: capability.capability_id,
                is_active_gateway: row.is_active_gateway,
                input_modalities: Array.isArray(row.input_modalities)
                    ? row.input_modalities.join(",")
                    : row.input_modalities ?? "",
                output_modalities: Array.isArray(row.output_modalities)
                    ? row.output_modalities.join(",")
                    : row.output_modalities ?? "",
                effective_from: row.effective_from,
                effective_to: row.effective_to,
                created_at: row.created_at,
                updated_at: row.updated_at,
                params: capability.params ?? null,
                quantization_scheme: row.quantization_scheme ?? null,
                max_input_tokens: capability.max_input_tokens ?? null,
                max_output_tokens: capability.max_output_tokens ?? null,
            };

            providerModels.push(providerModel);
            entry.provider_models.push(providerModel);
        }
    }

    // console.log(`[getModelPricing] Built ${providerModels.length} provider models, ${providerMap.size} providers: ${Array.from(providerMap.keys()).join(', ')}`);
    const modelKeys = Array.from(
        new Set(
            providerModels.map(
                (pm) => `${pm.api_provider_id}:${pm.model_id}:${pm.endpoint}`
            )
        )
    ).filter(Boolean);

    // console.log(`[getModelPricing] Model keys: ${modelKeys.join(', ')}`);

    // Fetch all rules for those keys in one query
    let rules: PricingRule[] = [];
    const mapRule = (x: any): PricingRule => ({
        id: x.rule_id,
        model_key: x.model_key,
        pricing_plan: x.pricing_plan ?? "standard",
        meter: x.meter,
        unit: x.unit ?? "token",
        unit_size: Number(x.unit_size ?? 1),
        price_per_unit: Number(x.price_per_unit),
        currency: x.currency ?? "USD",
        tiering_mode: x.tiering_mode ?? null,
        note: x.note ?? null,
        match: x.match ?? [],
        priority: Number(x.priority ?? 100),
        effective_from: x.effective_from,
        effective_to: x.effective_to ?? null,
    });

    if (modelKeys.length) {
        const { data: r, error: prErr } = await supabase
            .from("data_api_pricing_rules")
            .select(
                "rule_id, model_key, pricing_plan, meter, unit, unit_size, price_per_unit, currency, tiering_mode, note, priority, effective_from, effective_to, match"
            )
            .in("model_key", modelKeys)
            .order("priority", { ascending: false })
            .order("effective_from", { ascending: false });

        if (prErr) throw new Error(prErr.message || "Failed to fetch pricing rules");

        rules = (r || []).map(mapRule);

        // console.log(`[getModelPricing] Fetched ${rules.length} pricing rules: ${rules.slice(0, 5).map(r => `${r.id} (${r.meter})`).join(', ')}${rules.length > 5 ? '...' : ''}`);
    }

    // Fallback for incomplete capability rows in DB: fetch rules by provider:model:* prefix.
    if (providerModelPrefixes.size > 0) {
        const knownPrefixes = new Set<string>();
        for (const rule of rules) {
            const lastColon = rule.model_key.lastIndexOf(":");
            if (lastColon <= 0) continue;
            knownPrefixes.add(`${rule.model_key.slice(0, lastColon)}:`);
        }

        const missingPrefixes = [...providerModelPrefixes].filter(
            (prefix) => !knownPrefixes.has(prefix)
        );

        for (const prefix of missingPrefixes) {
            const { data: fallbackRows, error: fallbackError } = await supabase
                .from("data_api_pricing_rules")
                .select(
                    "rule_id, model_key, pricing_plan, meter, unit, unit_size, price_per_unit, currency, tiering_mode, note, priority, effective_from, effective_to, match"
                )
                .like("model_key", `${prefix}%`)
                .order("priority", { ascending: false })
                .order("effective_from", { ascending: false });

            if (fallbackError) {
                console.warn(
                    "[getModelPricing] Fallback pricing lookup failed",
                    modelId,
                    prefix,
                    fallbackError.message
                );
                continue;
            }

            for (const row of fallbackRows ?? []) {
                rules.push(mapRule(row));
            }
        }
    }

    if (rules.length > 1) {
        const dedup = new Map<string, PricingRule>();
        for (const rule of rules) dedup.set(rule.id, rule);
        rules = [...dedup.values()];
    }

    // Attach rules to providers
    const byKeyToProvider = new Map<string, string>();
    const byPrefixToProvider = new Map<string, string>();
    for (const [pid, entry] of providerMap) {
        for (const pm of entry.provider_models) {
            byKeyToProvider.set(
                `${pm.api_provider_id}:${pm.model_id}:${pm.endpoint}`,
                pid
            );
            byPrefixToProvider.set(`${pm.api_provider_id}:${pm.model_id}:`, pid);
        }
    }
    for (const rule of rules) {
        const lastColon = rule.model_key.lastIndexOf(":");
        const prefix =
            lastColon > 0 ? `${rule.model_key.slice(0, lastColon)}:` : null;
        const pid = byKeyToProvider.get(rule.model_key) ||
            (prefix ? byPrefixToProvider.get(prefix) : undefined);
        if (!pid) continue;
        providerMap.get(pid)!.pricing_rules.push(rule);
    }

    const result = [...providerMap.values()].sort((a, b) => {
        const an = a.provider.api_provider_name || a.provider.api_provider_id;
        const bn = b.provider.api_provider_name || b.provider.api_provider_id;
        return an.localeCompare(bn);
    });

    // console.log(`[getModelPricing] Returning ${result.length} providers with pricing: ${result.map(p => p.provider.api_provider_name || p.provider.api_provider_id).join(', ')}`);

    return result;
}

/**
 * Cached version of getModelPricing.
 *
 * Usage: await getModelPricingCached(modelId)
 *
 * This wraps the fetcher with `unstable_cache` for at least 1 week of caching.
 */
export async function getModelPricingCached(
    modelId: string,
    includeHidden: boolean
): Promise<ProviderPricing[]> {
    "use cache";

    cacheLife("days");
    cacheTag("data:models");
    cacheTag(`data:models:${modelId}`);
    cacheTag("data:data_api_pricing_rules");
    cacheTag("data:data_api_provider_models");

    // console.log("[fetch] HIT DB for model pricing", modelId);
    return getModelPricing(modelId, includeHidden);
}
