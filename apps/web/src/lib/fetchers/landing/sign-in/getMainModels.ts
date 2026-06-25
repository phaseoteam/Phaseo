// lib/fetchers/landing/sign-in/getMainModels.ts
import { cacheLife, cacheTag } from "next/cache";
import { applyHiddenFilter } from '@/lib/fetchers/models/visibility';
import { createAdminClient } from "@/utils/supabase/admin";

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
    const supabase = createAdminClient();

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
    cacheTag("public-model-catalogue");
    cacheTag("data:sign-in:models");
    cacheTag("frontend:sign-in-main-models");

    console.log("[fetch] HIT for main models", modelIds);
    return getMainModels(modelIds, includeHidden);
}
