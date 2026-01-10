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
    params: any;
    key: string;
    provider: {
        api_provider_id: string;
        api_provider_name: string;
        country_code: string | null;
    };
}

export default async function getModelAvailability(modelId: string): Promise<ModelAvailabilityItem[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from("data_api_provider_models")
        .select(`
            id,
            api_provider_id,
            api_model_id,
            provider_model_slug,
            endpoint,
            is_active_gateway,
            input_modalities,
            output_modalities,
            effective_from,
            effective_to,
            created_at,
            updated_at,
            provider: data_api_providers (
                api_provider_id,
                api_provider_name,
                country_code
            )
        `)
        .eq("internal_model_id", modelId)
        .is("effective_to", null) // Only active records
        .order("api_provider_id", { ascending: true });

    if (error) {
        throw new Error(error.message || "Failed to fetch model availability");
    }

    if (!data || !Array.isArray(data)) return [];

    return data as unknown as ModelAvailabilityItem[];
}

/**
 * Cached version of getModelAvailability.
 *
 * Usage: await getModelAvailabilityCached(modelId)
 *
 * This wraps the fetcher with `unstable_cache` for at least 1 week of caching.
 */
export async function getModelAvailabilityCached(modelId: string): Promise<ModelAvailabilityItem[]> {
    "use cache";

    cacheLife("days");
    cacheTag("data:models");
    cacheTag(`data:models:${modelId}`);
    cacheTag("data:api_provider_models");

    console.log("[fetch] HIT DB for model availability", modelId);
    return getModelAvailability(modelId);
}