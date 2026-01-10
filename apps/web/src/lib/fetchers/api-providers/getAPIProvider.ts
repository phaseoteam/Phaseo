// lib/fetchers/api-providers/getAPIProvider.ts
import { cacheLife, cacheTag } from "next/cache";

export interface APIProvider {
    api_provider_id: string;
    api_provider_name: string;
}

import { createClient } from '@/utils/supabase/client';

export async function getAPIProvider(): Promise<APIProvider[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('data_api_providers')
        .select('api_provider_id, api_provider_name, country_code')
        .order('api_provider_name', { ascending: true });

    if (error) {
        throw error;
    }

    if (!data || !Array.isArray(data)) return [];

    return data
        .map((r: any) => ({
            api_provider_id: r.api_provider_id,
            api_provider_name: r.api_provider_name ?? r.name ?? '',
            country_code: r.country_code ?? null,
        }))
        .filter((p) => p.api_provider_id);
}

export async function getAPIProviderPricesCached(): Promise<APIProvider[]> {
    "use cache";

    cacheLife("days");
    cacheTag("data:api_providers");

    console.log("[fetch] HIT JSON for API providers");
    return getAPIProvider();
}

// -------------------------- GET MODELS BY TYPE -------------------------- //

export interface APIProviderModels {
    model_id: string;
    model_name: string;
    provider_model_slug?: string | null;
    endpoints?: string[] | null;
    is_active_gateway?: boolean | null;
    input_modalities?: string[] | string | null;
    output_modalities?: string[] | string | null;
    release_date?: string | null;
}
export type ModelOutputType = 'text' | 'image' | 'video' | 'audio' | 'embeddings' | 'moderations';

/**
 * Generic function for fetching models for a provider filtered by output modality.
 * Supports: text, image, video, audio, embeddings
 */
export async function getAPIProviderModels(apiProviderId: string, outputType: ModelOutputType): Promise<APIProviderModels[]> {
    const modalityLookup: Record<ModelOutputType, string> = {
        text: 'text',
        image: 'image',
        video: 'video',
        audio: 'audio',
        // DB column likely stores singular/partial token like "embedding"
        embeddings: 'embedding',
        moderations: 'moderations'
    };

    const modality = modalityLookup[outputType];
    if (!modality) {
        throw new Error(`Unsupported output type: ${outputType}`);
    }

    const supabase = await createClient();
    const { data: modelsData, error: modelsError } = await supabase
        .from('data_api_provider_models')
        .select(`
            api_model_id,
            provider_model_slug,
            internal_model_id,
            endpoint,
            is_active_gateway,
            input_modalities,
            output_modalities,
            data_models (name, release_date)
        `)
        .eq('api_provider_id', apiProviderId)
        .or(`output_modalities.ilike.%${modality}%`);

    if (modelsError) {
        throw modelsError;
    }

    if (!modelsData || !Array.isArray(modelsData)) return [];

    // Client-side sort: release_date desc (newest first), then model name asc
    modelsData.sort((a: any, b: any) => {
        const aDate = a.data_models?.release_date ?? null;
        const bDate = b.data_models?.release_date ?? null;

        const aTime = aDate ? new Date(aDate).getTime() : Number.NEGATIVE_INFINITY;
        const bTime = bDate ? new Date(bDate).getTime() : Number.NEGATIVE_INFINITY;

        if (aTime === bTime) {
            const aName = (a.data_models?.name ?? a.model_name ?? '').toString();
            const bName = (b.data_models?.name ?? b.model_name ?? '').toString();
            return aName.localeCompare(bName);
        }

        // Descending by date
        return bTime - aTime;
    });

    // Group by model_id to merge same models with different endpoints
    const modelMap: Map<string, APIProviderModels> = new Map();
    for (const r of modelsData) {
        const model_id = r.internal_model_id;
        const endpoint = r.endpoint ?? null;
        if (!modelMap.has(model_id)) {
            modelMap.set(model_id, {
                model_id,
                model_name: r.data_models?.name ?? r.model_name ?? '',
                provider_model_slug: r.provider_model_slug ?? null,
                endpoints: endpoint ? [endpoint] : [],
                is_active_gateway: r.is_active_gateway ?? null,
                input_modalities: r.input_modalities ?? null,
                output_modalities: r.output_modalities ?? null,
                release_date: r.data_models?.release_date ?? null,
            });
        } else {
            const existing = modelMap.get(model_id)!;
            if (endpoint && !existing.endpoints!.includes(endpoint)) {
                existing.endpoints!.push(endpoint);
            }
            // Assume other fields are consistent
        }
    }

    const results: APIProviderModels[] = Array.from(modelMap.values()).filter((m) => m.model_id);

    // Sort results again by release_date desc, then name asc
    results.sort((a, b) => {
        const aDate = a.release_date ?? null;
        const bDate = b.release_date ?? null;

        const aTime = aDate ? new Date(aDate).getTime() : Number.NEGATIVE_INFINITY;
        const bTime = bDate ? new Date(bDate).getTime() : Number.NEGATIVE_INFINITY;

        if (aTime === bTime) {
            return a.model_name.localeCompare(b.model_name);
        }

        return bTime - aTime;
    });

    return results;
}

export async function getAPIProviderModelsCached(
    apiProviderId: string,
    outputType: ModelOutputType
): Promise<APIProviderModels[]> {
    "use cache";

    cacheLife("days");
    cacheTag("data:api_providers");

    console.log(`[fetch] HIT JSON for API providers - ${apiProviderId} / ${outputType}`);
    return getAPIProviderModels(apiProviderId, outputType);
}

// Backwards-compatible wrappers for previous specific functions
export async function getAPIProviderTextModels(apiProviderId: string): Promise<APIProviderModels[]> {
    return getAPIProviderModels(apiProviderId, 'text');
}

export async function getAPIProviderTextModelsCached(
    apiProviderId: string
): Promise<APIProviderModels[]> {
    "use cache";

    cacheLife("days");
    cacheTag("data:api_providers");

    return getAPIProviderModels(apiProviderId, "text");
}

export async function getAPIProviderImageModels(apiProviderId: string): Promise<APIProviderModels[]> {
    return getAPIProviderModels(apiProviderId, 'image');
}

export async function getAPIProviderImageModelsCached(
    apiProviderId: string
): Promise<APIProviderModels[]> {
    "use cache";

    cacheLife("days");
    cacheTag("data:api_providers");

    return getAPIProviderModels(apiProviderId, "image");
}
