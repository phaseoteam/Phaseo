// lib/fetchers/api-providers/getAPIProvider.ts
import { cacheLife, cacheTag } from "next/cache";

export interface APIProvider {
    api_provider_id: string;
    api_provider_name: string;
}

import { createClient } from '@/utils/supabase/client';
import { applyHiddenFilter } from '@/lib/fetchers/models/visibility';

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
export async function getAPIProviderModels(
    apiProviderId: string,
    outputType: ModelOutputType,
    includeHidden: boolean
): Promise<APIProviderModels[]> {
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
    const { data: providerModels, error: modelsError } = await supabase
        .from('data_api_provider_models')
        .select(`
            provider_api_model_id,
            provider_id,
            api_model_id,
            provider_model_slug,
            internal_model_id,
            is_active_gateway,
            input_modalities,
            output_modalities
        `)
        .eq('provider_id', apiProviderId);

    if (modelsError) {
        throw modelsError;
    }

    if (!providerModels || !Array.isArray(providerModels)) return [];

    const providerModelIds = providerModels
        .map((row) => row.provider_api_model_id)
        .filter((id): id is string => Boolean(id));

    const { data: caps, error: capsError } = await supabase
        .from('data_api_provider_model_capabilities')
        .select('provider_api_model_id, capability_id, status')
        .in('provider_api_model_id', providerModelIds);

    if (capsError) {
        throw capsError;
    }

    const internalIds = Array.from(
        new Set(providerModels.map((row) => row.internal_model_id).filter(Boolean))
    );
    const { data: models } = await applyHiddenFilter(
        supabase
            .from('data_models')
            .select('model_id, name, release_date, hidden')
            .in('model_id', internalIds),
        includeHidden
    );

    const modelMapById = new Map<string, { name: string | null; release_date: string | null }>();
    const visibleInternalIds = new Set<string>();
    for (const model of models ?? []) {
        if (!model.model_id) continue;
        visibleInternalIds.add(model.model_id);
        modelMapById.set(model.model_id, {
            name: model.name ?? null,
            release_date: model.release_date ?? null,
        });
    }

    const capMap = new Map<string, string[]>();
    for (const cap of caps ?? []) {
        if (cap.status === "disabled") continue;
        if (!cap.provider_api_model_id || !cap.capability_id) continue;
        const list = capMap.get(cap.provider_api_model_id) ?? [];
        if (!list.includes(cap.capability_id)) list.push(cap.capability_id);
        capMap.set(cap.provider_api_model_id, list);
    }

    const modelsData = providerModels
        .filter((row: any) => {
            if (includeHidden) return true;
            if (!row.internal_model_id) return true;
            return visibleInternalIds.has(row.internal_model_id);
        })
        .map((row: any) => {
        const modelInfo = row.internal_model_id
            ? modelMapById.get(row.internal_model_id)
            : null;
        return {
            ...row,
            data_models: modelInfo,
            endpoints: capMap.get(row.provider_api_model_id) ?? [],
        };
    });

    const filteredModels = modelsData.filter((row: any) => {
        const outputs = Array.isArray(row.output_modalities)
            ? row.output_modalities
            : typeof row.output_modalities === 'string'
                ? row.output_modalities.split(',').map((part: string) => part.trim())
                : [];
        return outputs.some((item: string) => item.toLowerCase().includes(modality));
    });

    // Group by model_id to merge same models with different endpoints
    const modelMap: Map<string, APIProviderModels> = new Map();
    for (const r of filteredModels) {
        const model_id = r.internal_model_id;
        const endpoints = Array.isArray(r.endpoints) ? r.endpoints : [];
        if (!modelMap.has(model_id)) {
            modelMap.set(model_id, {
                model_id,
                model_name: r.data_models?.name ?? r.model_name ?? '',
                provider_model_slug: r.provider_model_slug ?? null,
                endpoints: endpoints,
                is_active_gateway: r.is_active_gateway ?? null,
                input_modalities: r.input_modalities ?? null,
                output_modalities: r.output_modalities ?? null,
                release_date: r.data_models?.release_date ?? null,
            });
        } else {
            const existing = modelMap.get(model_id)!;
            for (const endpoint of endpoints) {
                if (endpoint && !existing.endpoints!.includes(endpoint)) {
                    existing.endpoints!.push(endpoint);
                }
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
    outputType: ModelOutputType,
    includeHidden: boolean
): Promise<APIProviderModels[]> {
    "use cache";

    cacheLife("days");
    cacheTag("data:api_providers");

    console.log(`[fetch] HIT JSON for API providers - ${apiProviderId} / ${outputType}`);
    return getAPIProviderModels(apiProviderId, outputType, includeHidden);
}

// Backwards-compatible wrappers for previous specific functions
export async function getAPIProviderTextModels(
    apiProviderId: string,
    includeHidden: boolean
): Promise<APIProviderModels[]> {
    return getAPIProviderModels(apiProviderId, 'text', includeHidden);
}

export async function getAPIProviderTextModelsCached(
    apiProviderId: string,
    includeHidden: boolean
): Promise<APIProviderModels[]> {
    "use cache";

    cacheLife("days");
    cacheTag("data:api_providers");

    return getAPIProviderModels(apiProviderId, "text", includeHidden);
}

export async function getAPIProviderImageModels(
    apiProviderId: string,
    includeHidden: boolean
): Promise<APIProviderModels[]> {
    return getAPIProviderModels(apiProviderId, 'image', includeHidden);
}

export async function getAPIProviderImageModelsCached(
    apiProviderId: string,
    includeHidden: boolean
): Promise<APIProviderModels[]> {
    "use cache";

    cacheLife("days");
    cacheTag("data:api_providers");

    return getAPIProviderModels(apiProviderId, "image", includeHidden);
}
