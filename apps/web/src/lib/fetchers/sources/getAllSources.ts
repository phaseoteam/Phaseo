// lib/fetchers/sources/getAllSources.ts
import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";

export interface SourceCard {
    api_provider_id: string;
    api_provider_name: string;
    country_code: string;
}

export async function getAllSources(): Promise<SourceCard[]> {
    const supabase = createAdminClient();

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

export async function getAllSourcesCached(): Promise<SourceCard[]> {
    "use cache";

    cacheLife("days");
    cacheTag("public-model-catalogue");
    cacheTag("data:sources");
    cacheTag("frontend:sources");

    console.log("[fetch] HIT DB for sources");
    return getAllSources();
}
