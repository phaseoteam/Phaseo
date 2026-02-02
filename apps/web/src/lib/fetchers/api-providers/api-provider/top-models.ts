import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";

export type ModelStats = {
    model_id: string;
    model_name: string;
    request_count: number;
    median_latency_ms: number | null;
    median_throughput: number | null;
    total_tokens?: number | null;
};

export async function getTopModels(
    apiProviderId: string,
    includeHidden: boolean,
    count: number = 6
): Promise<ModelStats[]> {
    const supabase = createAdminClient();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    try {
        const { data, error } = await supabase
            .rpc('get_top_models_stats_tokens', {
                p_provider: apiProviderId,
                p_since: since,
                p_limit: count
            });

        if (error) {
            console.error("Error fetching top models:", error);
            return [];
        }

        if (!data || data.length === 0) {
            return [];
        }

        let rows = data as any[];

        if (!includeHidden) {
            const modelIds = rows.map((row) => row.model_id).filter(Boolean);
            if (modelIds.length) {
                const { data: models } = await supabase
                    .from("data_models")
                    .select("model_id, hidden")
                    .in("model_id", modelIds);
                const hiddenById = new Map<string, boolean>();
                for (const model of models ?? []) {
                    if (!model.model_id) continue;
                    hiddenById.set(model.model_id, Boolean(model.hidden));
                }
                rows = rows.filter((row) => !hiddenById.get(row.model_id));
            }
        }

        return rows.map((row: any) => ({
            model_id: row.model_id,
            model_name: row.model_name,
            request_count: Number(row.request_count),
            total_tokens:
                row.total_tokens != null ? Number(row.total_tokens) : null,
            median_latency_ms: row.median_latency_ms
                ? Math.round(Number(row.median_latency_ms))
                : null,
            median_throughput: row.median_throughput
                ? Math.round(Number(row.median_throughput) * 100) / 100
                : null,
        }));
    } catch (err) {
        console.error("Unexpected error fetching top models:", err);
        return [];
    }
}

export async function getTopModelsCached(
    apiProviderId: string,
    includeHidden: boolean,
    count: number = 6
): Promise<ModelStats[]> {
    "use cache";

    cacheLife("hours");
    cacheTag("data:top_models");

    console.log(`[fetch] HIT JSON for top models - ${apiProviderId}`);
    return getTopModels(apiProviderId, includeHidden, count);
}
