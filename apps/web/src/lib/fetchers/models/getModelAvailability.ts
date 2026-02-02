// lib/fetchers/models/getModelAvailability.ts
import { cacheLife, cacheTag } from "next/cache";
import { createClient } from "@/utils/supabase/client";

export interface ModelAvailabilityItem {
    id: string;
    api_provider_id: string;
    api_model_id: string;
    provider_model_slug: string | null;
    endpoint: string;
    is_active_gateway: boolean;
    input_modalities: string;
    output_modalities: string;
    effective_from: string | null;
    effective_to: string | null;
    created_at: string;
    updated_at: string;
    key: string;
    params: any;
    max_input_tokens: number | null;
    max_output_tokens: number | null;
    provider: {
        api_provider_id: string;
        api_provider_name: string;
        country_code: string | null;
    };
}

export default async function getModelAvailability(
    modelId: string,
    includeHidden: boolean
): Promise<ModelAvailabilityItem[]> {
    const supabase = await createClient();

    const { data: modelRow, error: modelError } = await supabase
        .from("data_models")
        .select("hidden")
        .eq("model_id", modelId)
        .maybeSingle();

    if (modelError) {
        throw new Error(modelError.message || "Failed to load model metadata");
    }
    if (!modelRow || (!includeHidden && modelRow.hidden)) {
        throw new Error("Model not found");
    }

    const { data: providerModels, error: providerError } = await supabase
        .from("data_api_provider_models")
        .select(
            "provider_api_model_id, provider_id, api_model_id, provider_model_slug, internal_model_id, is_active_gateway, input_modalities, output_modalities, quantization_scheme, effective_from, effective_to, created_at, updated_at"
        )
        .eq("internal_model_id", modelId)
        .order("provider_id", { ascending: true });

    if (providerError) {
        throw new Error(providerError.message || "Failed to fetch model availability");
    }

    if (!providerModels || !Array.isArray(providerModels)) return [];

    const providerModelIds = providerModels
        .map((row) => row.provider_api_model_id)
        .filter((id): id is string => Boolean(id));

    const { data: caps, error: capsError } = await supabase
        .from("data_api_provider_model_capabilities")
        .select("provider_api_model_id, capability_id, params, status, max_input_tokens, max_output_tokens")
        .in("provider_api_model_id", providerModelIds);

    if (capsError) {
        throw new Error(capsError.message || "Failed to fetch model capabilities");
    }

    const providerIds = Array.from(
        new Set(providerModels.map((row) => row.provider_id).filter(Boolean))
    );
    const { data: providers } = await supabase
        .from("data_api_providers")
        .select("api_provider_id, api_provider_name, country_code")
        .in("api_provider_id", providerIds);

    const providerMap = new Map<string, ModelAvailabilityItem["provider"]>();
    for (const provider of providers ?? []) {
        if (!provider.api_provider_id) continue;
        providerMap.set(provider.api_provider_id, {
            api_provider_id: provider.api_provider_id,
            api_provider_name: provider.api_provider_name ?? provider.api_provider_id,
            country_code: provider.country_code ?? null,
        });
    }

    const modelMap = new Map<string, any>();
    for (const row of providerModels) {
        if (row.provider_api_model_id) modelMap.set(row.provider_api_model_id, row);
    }

    const rows: ModelAvailabilityItem[] = [];
    for (const cap of caps ?? []) {
        if (cap.status === "disabled") continue;
        const pm = modelMap.get(cap.provider_api_model_id);
        if (!pm || !cap.capability_id) continue;
        rows.push({
            id: pm.provider_api_model_id,
            api_provider_id: pm.provider_id,
            api_model_id: pm.api_model_id,
            provider_model_slug: pm.provider_model_slug ?? null,
            endpoint: cap.capability_id,
            is_active_gateway: pm.is_active_gateway,
            input_modalities: Array.isArray(pm.input_modalities)
                ? pm.input_modalities.join(",")
                : pm.input_modalities ?? "",
            output_modalities: Array.isArray(pm.output_modalities)
                ? pm.output_modalities.join(",")
                : pm.output_modalities ?? "",
            effective_from: pm.effective_from,
            effective_to: pm.effective_to,
            created_at: pm.created_at,
            updated_at: pm.updated_at,
            params: cap.params ?? {},
            max_input_tokens: cap.max_input_tokens,
            max_output_tokens: cap.max_output_tokens,
            key: `${pm.provider_id}:${pm.api_model_id}:${cap.capability_id}`,
            provider: providerMap.get(pm.provider_id) ?? {
                api_provider_id: pm.provider_id,
                api_provider_name: pm.provider_id,
                country_code: null,
            },
        });
    }

    return rows;
}

/**
 * Cached version of getModelAvailability.
 *
 * Usage: await getModelAvailabilityCached(modelId, includeHidden)
 *
 * This wraps the fetcher with `unstable_cache` for at least 1 week of caching.
 * Note: The includeHidden parameter must be resolved outside of this function
 * to avoid using dynamic data sources (like cookies) inside a cached scope.
 */
export async function getModelAvailabilityCached(
    modelId: string,
    includeHidden: boolean
): Promise<ModelAvailabilityItem[]> {
    "use cache";

    cacheLife("days");
    cacheTag("data:models");
    cacheTag(`data:models:${modelId}`);
    cacheTag("data:data_api_provider_models");

    console.log("[fetch] HIT DB for model availability", modelId);
    return getModelAvailability(modelId, includeHidden);
}
