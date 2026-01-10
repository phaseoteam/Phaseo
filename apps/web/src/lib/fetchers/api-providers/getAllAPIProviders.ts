// lib/fetchers/api-providers/getAllAPIProviders.ts
import { cacheLife, cacheTag } from "next/cache";

export interface APIProviderCard {
    api_provider_id: string;
    api_provider_name: string;
    country_code: string;
}

import { createClient } from '@/utils/supabase/client';

export async function getAllAPIProviders(): Promise<APIProviderCard[]> {
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

export async function getAllAPIProvidersCached(): Promise<APIProviderCard[]> {
    "use cache";

    cacheLife("days");
    cacheTag("data:api_providers");

    console.log("[fetch] HIT JSON for API providers");
    return getAllAPIProviders();
}
