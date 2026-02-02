import { cacheLife, cacheTag } from 'next/cache';
import { createClient } from '@/utils/supabase/client';
import { applyHiddenFilter } from '@/lib/fetchers/models/visibility';

export interface SupportedModelsStats {
    modelsCount: number;
    orgsCount: number;
    apiCount: number;
    recentCount: number;
}

async function fetchStats(includeHidden: boolean): Promise<SupportedModelsStats> {
    const supabase = await createClient();

    const now = Date.now();
    const cutoff = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();

    const defaultStats: SupportedModelsStats = {
        modelsCount: 0,
        orgsCount: 0,
        apiCount: 0,
        recentCount: 0,
    };

    try {
        const [modelsRes, orgsRes, apiModelsRes, recentRes] = await Promise.all([
            applyHiddenFilter(
                supabase.from('data_models').select('*', { count: 'exact', head: true }),
                includeHidden
            ),
            supabase.from('data_organisations').select('*', { count: 'exact', head: true }),
            supabase
                .from('data_api_provider_models')
                .select('*', { count: 'exact', head: true })
                .eq('is_active_gateway', true),
            applyHiddenFilter(
                supabase
                    .from('data_models')
                    .select('*', { count: 'exact', head: true })
                    .gte('created_at', cutoff),
                includeHidden
            ),
        ]);

        const getCount = (res: { count: number | null; error: any } | any) => {
            if (res?.error) return 0;
            return res.count ?? 0;
        };

        return {
            modelsCount: getCount(modelsRes),
            orgsCount: getCount(orgsRes),
            apiCount: getCount(apiModelsRes),
            recentCount: getCount(recentRes),
        };
    } catch (err) {
        // swallow and return defaults; caller will handle fallback behaviour
        // Consider telemetry here
        return defaultStats;
    }
}

export async function getSupportedModelsStatsCached(
    includeHidden: boolean
): Promise<SupportedModelsStats> {
    "use cache";

    cacheLife("days");
    cacheTag("data:sign-in:supported-models-stats");

    console.log("[fetch] HIT for supported models stats");
    return fetchStats(includeHidden);
}
