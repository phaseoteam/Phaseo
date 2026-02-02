import { createClient } from '@/utils/supabase/server';
import { applyHiddenFilter, resolveIncludeHidden } from '@/lib/fetchers/models/visibility';

export type DeprecationWarning = {
    modelId: string;
    deprecationDate: string | null;
    retirementDate: string | null;
    successorModelId?: string | null;
    daysUntil: number;
};

function calculateDaysUntil(dateStr: string | null): number {
    if (!dateStr) return Infinity;
    const targetDate = new Date(dateStr);
    const now = new Date();
    const utcTarget = Date.UTC(
        targetDate.getFullYear(),
        targetDate.getMonth(),
        targetDate.getDate()
    );
    const utcNow = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const diffTime = utcTarget - utcNow;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export async function getDeprecationWarningsForTeam(
    teamId: string
): Promise<DeprecationWarning[]> {
    const supabase = await createClient();
    const includeHidden = await resolveIncludeHidden();

    // 1) Fetch distinct models used in last 14 days for this team
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
        .toISOString();

    const { data: recentModels, error: recentErr, status: recentStatus } = await supabase
        .from('gateway_requests')
        .select('model_id', { count: 'exact' })
        .eq('team_id', teamId)
        .gte('created_at', fourteenDaysAgo)
        // Ensure model_id is not null/empty. `.is('model_id', null)` was filtering FOR nulls.
        .not('model_id', 'is', null)
        .neq('model_id', '') // ensure non-empty string
        .limit(1000);

    console.log('Recent models fetch status:', recentStatus);
    console.log('Recent models fetch error:', recentErr);
    console.log('Recent models raw response length:', recentModels?.length);

    // If we got no results, run a less restrictive debug query to help investigate
    if ((!recentModels || recentModels.length === 0) && !recentErr) {
        console.log('No recent models found with non-null model_id. Running fallback debug query (no model_id filters)...');
        const { data: debugModels, error: debugErr, status: debugStatus } = await supabase
            .from('gateway_requests')
            .select('model_id, created_at', { count: 'exact' })
            .eq('team_id', teamId)
            .gte('created_at', fourteenDaysAgo)
            .limit(50);

        console.log('Fallback debug query status:', debugStatus);
        console.log('Fallback debug query error:', debugErr);
        console.log('Fallback debug raw count:', debugModels?.length);

        if (debugModels && debugModels.length > 0) {
            // If fallback returns rows but earlier query didn't, show a sample to help debug filtering
            console.log('Fallback sample rows:', debugModels.slice(0, 10));
        }
    }

    // If the previous query returned null or error, try again without the null check
    let modelIds: string[] = [];

    modelIds = (recentModels ?? [])
        .map((r: any) => r.model_id)
        .filter(Boolean);

    // Deduplicate and limit
    modelIds = Array.from(new Set(modelIds)).slice(0, 500);

    if (modelIds.length === 0) {
        return [];
    }

    // 2) Query data_models for these model_ids
    const { data: modelsData, error: modelsErr } = await applyHiddenFilter(
        supabase
            .from('data_models')
            .select('model_id,deprecation_date,retirement_date,previous_model_id')
            .in('model_id', modelIds),
        includeHidden
    );

    if (modelsErr) {
        console.error('deprecation fetch error:', modelsErr);
        return [];
    }

    const warnings: DeprecationWarning[] = (modelsData ?? [])
        .map((m: any) => {
            const dep = m.deprecation_date ?? null;
            const ret = m.retirement_date ?? null;
            const daysUntil = calculateDaysUntil(dep);
            return {
                modelId: m.model_id,
                deprecationDate: dep,
                retirementDate: ret,
                successorModelId: m.previous_model_id ?? null,
                daysUntil,
            } as DeprecationWarning;
        })
        .filter((w: DeprecationWarning) => Number.isFinite(w.daysUntil) && w.daysUntil >= 0 && w.daysUntil <= 90)
        .sort((a: DeprecationWarning, b: DeprecationWarning) => a.daysUntil - b.daysUntil);

    return warnings;
}
