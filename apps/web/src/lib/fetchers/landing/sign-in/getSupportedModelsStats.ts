import { cacheLife, cacheTag } from 'next/cache';
import { createClient } from '@/utils/supabase/client';
import { applyHiddenFilter } from '@/lib/fetchers/models/visibility';

export interface SupportedModelsStats {
    modelsCount: number;
    orgsCount: number;
    apiCount: number;
    recentCount: number;
}

type VisibleModelStatRow = {
    model_id: string | null;
    organisation_id: string | null;
    announcement_date: string | null;
    release_date: string | null;
};

type ActiveGatewayModelRow = {
    model_id?: string | null;
    internal_model_id?: string | null;
    api_model_id?: string | null;
};

const PAGE_SIZE = 1000;

function toDateMs(value: string | null | undefined): number | null {
    if (!value) return null;
    const ms = Date.parse(String(value).trim());
    return Number.isNaN(ms) ? null : ms;
}

async function fetchAllRows<T>(
    fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
) {
    const rows: T[] = [];
    let from = 0;

    while (true) {
        const to = from + PAGE_SIZE - 1;
        const { data, error } = await fetchPage(from, to);
        if (error) throw error;

        const page = Array.isArray(data) ? data : [];
        rows.push(...page);

        if (page.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }

    return rows;
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
        const [visibleModels, apiProviderModels] = await Promise.all([
            fetchAllRows<VisibleModelStatRow>((from, to) =>
                applyHiddenFilter(
                    supabase
                        .from('data_models')
                        .select('model_id, organisation_id, announcement_date, release_date')
                        .range(from, to),
                    includeHidden
                )
            ),
            fetchAllRows<ActiveGatewayModelRow>((from, to) =>
                supabase
                    .from('data_api_provider_models')
                    .select('model_id, internal_model_id, api_model_id')
                    .eq('is_active_gateway', true)
                    .range(from, to)
            ),
        ]);
        const visibleModelIds = new Set(
            visibleModels
                .map((model) => model.model_id)
                .filter((modelId): modelId is string => typeof modelId === 'string' && modelId.length > 0)
        );
        const organisationIds = new Set(
            visibleModels
                .map((model) => model.organisation_id)
                .filter(
                    (organisationId): organisationId is string =>
                        typeof organisationId === 'string' && organisationId.length > 0
                )
        );
        const activeGatewayModels = new Set(
            apiProviderModels
                .map((model) => model.model_id ?? model.internal_model_id ?? model.api_model_id)
                .filter((modelId): modelId is string => typeof modelId === 'string' && visibleModelIds.has(modelId))
        );
        const cutoffMs = Date.parse(cutoff);
        const nowMs = now;
        const recentCount = visibleModels.filter((model) => {
            const announcementMs = toDateMs(model.announcement_date);
            const releaseMs = toDateMs(model.release_date);

            const isRecent = (dateMs: number | null) =>
                dateMs !== null && dateMs >= cutoffMs && dateMs <= nowMs;

            return isRecent(announcementMs) || isRecent(releaseMs);
        }).length;

        return {
            modelsCount: visibleModels.length,
            orgsCount: organisationIds.size,
            apiCount: activeGatewayModels.size,
            recentCount,
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
