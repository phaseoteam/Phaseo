// lib/fetchers/landing/sign-in/getMainModels.ts
import { cacheLife, cacheTag } from "next/cache";
import { createClient } from '@/utils/supabase/client';
import { applyHiddenFilter } from '@/lib/fetchers/models/visibility';

export interface SignInModel {
    model_id: string;
    name: string;
    release_date?: string | number;
    data_organisations: { organisation_id: string; name: string; colour?: string };
}

/**
 * Fetch model records for the provided model IDs from the `data_models` table.
 * Returns a minimal ExtendedModel[] and surfaces DB errors to the caller.
 */
export async function getMainModels(
    modelIds: string[],
    includeHidden: boolean
): Promise<SignInModel[]> {
    if (!modelIds || modelIds.length === 0) return [];
    const supabase = await createClient();

    const { data, error } = await applyHiddenFilter(
        supabase
            .from('data_models')
            .select('model_id, name, release_date, data_organisations (organisation_id, name, colour)')
            .in('model_id', modelIds),
        includeHidden
    );

    console.log('[fetch] Fetched main models', { modelIds, count: data?.length, error });

    if (error) throw error;
    if (!data || !Array.isArray(data)) return [];

    return data.map((r: any) => ({ ...r } as SignInModel));
}

export async function getMainModelsCached(
    modelIds: string[],
    includeHidden: boolean
): Promise<SignInModel[]> {
    "use cache";

    cacheLife("days");
    cacheTag("data:sign-in:models");

    console.log("[fetch] HIT for main models", modelIds);
    return getMainModels(modelIds, includeHidden);
}
