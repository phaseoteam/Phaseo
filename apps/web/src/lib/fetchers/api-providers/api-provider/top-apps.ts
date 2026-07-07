import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";
import { isMissingRelationError } from "./missingRelation";

export type AppStats = {
    app_id: string;
    title: string;
    url: string | null;
    image_url: string | null;
    total_tokens: number;
};

function isUnknownAppIdentity(appId: string, title: string | null | undefined): boolean {
    const normalizedId = appId.trim().toLowerCase();
    const normalizedTitle = (title ?? "").trim().toLowerCase();
    if (!normalizedId) return true;

    return (
        normalizedId === "unknown" ||
        normalizedId === "unknown-app" ||
        normalizedId === "unknown_app" ||
        normalizedTitle === "unknown" ||
        normalizedTitle === "unknown app"
    );
}

export async function getTopApps(
    apiProviderId: string,
    period: 'day' | 'week' | 'month' = 'day',
    count: number = 20
): Promise<AppStats[]> {
    const supabase = createAdminClient();

    // Calculate since date
    const now = new Date();
    let since: Date;
    switch (period) {
        case 'day':
            since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            break;
        case 'week':
            since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
        case 'month':
            since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
    }

    try {
        const { data, error } = await supabase
            .rpc('get_top_apps_stats', {
                p_provider: apiProviderId,
                p_since: since.toISOString(),
                p_limit: count
            });

        if (error) {
            if (isMissingRelationError(error)) {
                return [];
            }
            console.error("Error fetching top apps:", error);
            return [];
        }

        if (!data || data.length === 0) {
            return [];
        }

        const filteredRows = data.filter((row: any) => {
            const appId = String(row?.app_id ?? "").trim();
            return !isUnknownAppIdentity(appId, row?.title ?? null);
        });

        const appIds = filteredRows
            .map((row: any) => String(row?.app_id ?? "").trim())
            .filter(Boolean);

        const imageById = new Map<string, string | null>();
        if (appIds.length > 0) {
            const { data: appRows } = await supabase
                .from("api_apps")
                .select("id, image_url")
                .in("id", appIds);

            for (const row of appRows ?? []) {
                if (!row?.id) continue;
                imageById.set(row.id, row.image_url ?? null);
            }
        }

        return filteredRows.map((row: any) => ({
            app_id: row.app_id,
            title: row.title || row.app_id,
            url: row.url || null,
            image_url: imageById.get(row.app_id) ?? null,
            total_tokens: Number(row.total_tokens),
        }));
    } catch (err) {
        if (isMissingRelationError(err)) {
            return [];
        }
        console.error("Unexpected error fetching top apps:", err);
        return [];
    }
}

export async function getTopAppsCached(
    apiProviderId: string,
    period: "day" | "week" | "month" = "day",
    count: number = 20
): Promise<AppStats[]> {
    "use cache";

    cacheLife("days");
    cacheTag("data:top_apps");
    cacheTag(`data:top_apps:provider:${apiProviderId}`);
    cacheTag(`data:api_providers:${apiProviderId}`);

    console.log(`[fetch] HIT JSON for top apps - ${apiProviderId} - ${period}`);
    return getTopApps(apiProviderId, period, count);
}
