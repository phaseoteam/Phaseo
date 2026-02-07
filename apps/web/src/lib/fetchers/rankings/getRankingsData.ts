// lib/fetchers/rankings/getRankingsData.ts
// Purpose: Fetch public rankings data from database
// Why: Provides type-safe data fetching with Next.js caching
// How: Calls Supabase RPC functions directly with proper cache configuration

"use cache";
import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";

const RANKINGS_CACHE = {
    stale: 60 * 5,
    revalidate: 60 * 15,
    expire: 60 * 60 * 2,
};

// Type definitions for API responses
export type RankingModel = {
    model_id: string;
    provider: string;
    requests: number;
    total_tokens: number;
    input_tokens: number;
    output_tokens: number;
    total_cost_usd: number;
    median_latency_ms: number;
    median_throughput: number;
    success_rate: number;
    rank: number;
    prev_rank: number;
    trend: "up" | "down" | "new" | "same";
};

export type TrendingModel = {
    model_id: string;
    provider: string;
    current_week_requests: number;
    previous_week_requests: number;
    two_weeks_ago_requests: number;
    velocity: number;
    momentum_score: number;
};

export type SummaryStats = {
    total_requests_24h: number;
    total_tokens_24h: number;
    total_models: number;
    total_providers: number;
    avg_latency_ms: number;
    success_rate_24h: number;
};

export type RankingsResponse = {
    ok: boolean;
    rankings: RankingModel[];
    trending: TrendingModel[];
    summary: SummaryStats;
};

export type PerformanceData = {
    model_id: string;
    provider: string;
    requests: number;
    cost_per_1m_tokens: number;
    median_latency_ms: number;
    p95_latency_ms: number;
    median_throughput: number;
    success_rate: number;
};

export type MarketShareData = {
    name: string;
    requests: number;
    tokens: number;
    share_pct: number;
};

export type MarketShareTimeseriesData = {
    bucket: string;
    name: string;
    requests: number;
    tokens: number;
    colour?: string | null;
};

export type TimeseriesData = {
    bucket: string;
    model_id: string;
    requests: number;
    tokens: number;
    colour?: string | null;
};

export type ReliabilityData = {
    model_id: string;
    provider: string;
    total_requests: number;
    successful_requests: number;
    success_rate: number;
    median_latency_ms: number;
    p95_latency_ms: number;
    p99_latency_ms: number;
    common_errors: Array<{ error_code: string; count: number }>;
};

export type GeographyData = {
    country: string;
    country_code: string;
    requests: number;
    tokens: number;
    share_pct: number;
};

export type MultimodalData = {
    model_id: string;
    text_tokens: number;
    audio_tokens: number;
    video_tokens: number;
    cached_tokens: number;
    image_count: number;
};

export type TopAppData = {
    app_id: string;
    app_name: string;
    requests: number;
    tokens: number;
    unique_models: number;
    image_url?: string | null;
};

/**
 * Get main rankings data with trending and summary stats
 */
export async function getRankings(
    timeRange: string = "week",
    metric: string = "tokens",
    limit: number = 50
): Promise<RankingsResponse> {
    cacheLife(RANKINGS_CACHE);
    cacheTag("public-rankings");

    console.log("[getRankings] Starting fetch with params:", { timeRange, metric, limit });

    const supabase = createAdminClient();

    // Fetch rankings, trending, and summary in parallel
    const [rankingsRes, trendingRes, summaryRes] = await Promise.all([
        supabase.rpc("get_public_model_rankings", {
            p_time_range: timeRange,
            p_metric: metric,
            p_limit: limit,
        }),
        supabase.rpc("get_public_trending_models", {
            p_limit: 20,
        }),
        supabase.rpc("get_public_summary_stats"),
    ]);

    console.log("[getRankings] Rankings response:", {
        error: rankingsRes.error,
        count: rankingsRes.data?.length,
        data: rankingsRes.data,
    });
    console.log("[getRankings] Trending response:", {
        error: trendingRes.error,
        count: trendingRes.data?.length,
        data: trendingRes.data,
    });
    console.log("[getRankings] Summary response:", {
        error: summaryRes.error,
        data: summaryRes.data,
    });

    if (rankingsRes.error) {
        console.error("[getRankings] Rankings error:", rankingsRes.error);
    }
    if (trendingRes.error) {
        console.error("[getRankings] Trending error:", trendingRes.error);
    }
    if (summaryRes.error) {
        console.error("[getRankings] Summary error:", summaryRes.error);
    }

    return {
        ok: !rankingsRes.error,
        rankings: (rankingsRes.data ?? []) as RankingModel[],
        trending: (trendingRes.data ?? []) as TrendingModel[],
        summary: summaryRes.data?.[0] ?? {
            total_requests_24h: 0,
            total_tokens_24h: 0,
            total_models: 0,
            total_providers: 0,
            avg_latency_ms: 0,
            success_rate_24h: 0,
        },
    };
}

/**
 * Get performance data for scatter chart
 */
export async function getPerformanceData(hours: number = 24): Promise<{ data: PerformanceData[] }> {
    cacheLife(RANKINGS_CACHE);
    cacheTag("public-performance");

    console.log("[getPerformanceData] Starting fetch with hours:", hours);

    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("get_public_model_performance", {
        p_hours: hours,
    });

    console.log("[getPerformanceData] Response:", { error, count: data?.length, data });

    if (error) {
        console.error("[getPerformanceData] Error:", error);
    }

    return { data: (data ?? []) as PerformanceData[] };
}

/**
 * Get market share data
 */
export async function getMarketShare(
    dimension: "organization" | "provider" = "organization",
    timeRange: string = "week"
): Promise<{ data: MarketShareData[] }> {
    cacheLife(RANKINGS_CACHE);
    cacheTag("public-market-share");

    console.log("[getMarketShare] Starting fetch with params:", { dimension, timeRange });

    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("get_public_market_share", {
        p_dimension: dimension,
        p_time_range: timeRange,
    });

    console.log("[getMarketShare] Response:", { error, count: data?.length, data });

    if (error) {
        console.error("[getMarketShare] Error:", error);
    }

    return { data: (data ?? []) as MarketShareData[] };
}

/**
 * Get timeseries data for usage charts
 */
export async function getTimeseriesData(
    timeRange: string = "week",
    bucketSize: string = "hour",
    topN: number = 10
): Promise<{ data: TimeseriesData[] }> {
    cacheLife(RANKINGS_CACHE);
    cacheTag("public-timeseries");

    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("get_public_usage_timeseries", {
        p_time_range: timeRange,
        p_bucket_size: bucketSize,
        p_top_n: topN,
    });

    if (error) {
        console.error("[getTimeseriesData] Error:", error);
    }

    return { data: (data ?? []) as TimeseriesData[] };
}

/**
 * Resolve model names for display labels
 */
export async function getModelNamesByIds(
    modelIds: string[]
): Promise<Record<string, string>> {
    cacheLife("hours");
    cacheTag("data:models");

    const uniqueIds = Array.from(new Set(modelIds.filter(Boolean)));
    if (uniqueIds.length === 0) return {};

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("data_models")
        .select("model_id, name")
        .in("model_id", uniqueIds);

    if (error) {
        console.error("[getModelNamesByIds] Error:", error);
        return {};
    }

    const out: Record<string, string> = {};
    for (const row of data ?? []) {
        if (!row?.model_id || !row?.name) continue;
        out[row.model_id] = row.name;
    }

    return out;
}

/**
 * Resolve provider names for display labels
 */
export async function getProviderNamesByIds(
    providerIds: string[]
): Promise<Record<string, string>> {
    cacheLife("hours");
    cacheTag("data:api_providers");

    const uniqueIds = Array.from(new Set(providerIds.filter(Boolean)));
    if (uniqueIds.length === 0) return {};

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("data_api_providers")
        .select("api_provider_id, api_provider_name")
        .in("api_provider_id", uniqueIds);

    if (error) {
        console.error("[getProviderNamesByIds] Error:", error);
        return {};
    }

    const out: Record<string, string> = {};
    for (const row of data ?? []) {
        if (!row?.api_provider_id) continue;
        const label = row.api_provider_name ?? row.api_provider_id;
        out[row.api_provider_id] = label;
    }

    return out;
}

export type ProviderMeta = {
    name: string;
    colour: string | null;
};

/**
 * Resolve provider display metadata for leaderboard/chart rendering
 */
export async function getProviderMetaByIds(
    providerIds: string[]
): Promise<Record<string, ProviderMeta>> {
    cacheLife("hours");
    cacheTag("data:api_providers");

    const uniqueIds = Array.from(new Set(providerIds.filter(Boolean)));
    if (uniqueIds.length === 0) return {};

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("data_api_providers")
        .select("api_provider_id, api_provider_name")
        .in("api_provider_id", uniqueIds);

    if (error) {
        console.error("[getProviderMetaByIds] Error:", error);
        return {};
    }

    const out: Record<string, ProviderMeta> = {};
    for (const row of data ?? []) {
        if (!row?.api_provider_id) continue;
        out[row.api_provider_id] = {
            name: row.api_provider_name ?? row.api_provider_id,
            colour: null,
        };
    }

    return out;
}

/**
 * Resolve organisation ids for display logos
 */
export async function getOrganisationLogoIdsByNames(
    names: string[]
): Promise<Record<string, string>> {
    cacheLife("hours");
    cacheTag("data:organisations");

    const uniqueNames = Array.from(new Set(names.filter(Boolean)));
    if (uniqueNames.length === 0) return {};

    const supabase = createAdminClient();
    const [byNameRes, byIdRes] = await Promise.all([
        supabase
            .from("data_organisations")
            .select("organisation_id, name")
            .in("name", uniqueNames),
        supabase
            .from("data_organisations")
            .select("organisation_id")
            .in("organisation_id", uniqueNames),
    ]);

    if (byNameRes.error) {
        console.error(
            "[getOrganisationLogoIdsByNames] Name lookup error:",
            byNameRes.error
        );
    }
    if (byIdRes.error) {
        console.error(
            "[getOrganisationLogoIdsByNames] Id lookup error:",
            byIdRes.error
        );
    }

    const out: Record<string, string> = {};
    for (const row of byNameRes.data ?? []) {
        if (!row?.name || !row?.organisation_id) continue;
        out[row.name] = row.organisation_id;
    }
    for (const row of byIdRes.data ?? []) {
        if (!row?.organisation_id) continue;
        out[row.organisation_id] = row.organisation_id;
    }

    return out;
}

export type ModelLeaderboardMeta = {
    model_id: string;
    name: string | null;
    organisation_id: string | null;
    organisation_name: string | null;
    organisation_colour: string | null;
};

/**
 * Resolve model metadata for leaderboard rendering
 */
export async function getModelLeaderboardMetaByIds(
    modelIds: string[]
): Promise<Record<string, ModelLeaderboardMeta>> {
    cacheLife("hours");
    cacheTag("data:models");

    const uniqueIds = Array.from(new Set(modelIds.filter(Boolean)));
    if (uniqueIds.length === 0) return {};

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("data_models")
        .select(
            "model_id, name, organisation_id, organisation:data_organisations!data_models_organisation_id_fkey(name, colour)"
        )
        .in("model_id", uniqueIds);

    if (error) {
        console.error("[getModelLeaderboardMetaByIds] Error:", error);
        return {};
    }

    const out: Record<string, ModelLeaderboardMeta> = {};
    for (const row of data ?? []) {
        if (!row?.model_id) continue;
        const organisation = (row as any).organisation ?? null;
        out[row.model_id] = {
            model_id: row.model_id,
            name: row.name ?? null,
            organisation_id: row.organisation_id ?? null,
            organisation_name: organisation?.name ?? null,
            organisation_colour: organisation?.colour ?? null,
        };
    }

    return out;
}

/**
 * Get market share timeseries data
 */
export async function getMarketShareTimeseries(
    dimension: "organization" | "provider" = "organization",
    timeRange: string = "year",
    bucketSize: string = "week",
    topN: number = 8
): Promise<{ data: MarketShareTimeseriesData[] }> {
    cacheLife(RANKINGS_CACHE);
    cacheTag("public-market-share-timeseries");

    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("get_public_market_share_timeseries", {
        p_dimension: dimension,
        p_time_range: timeRange,
        p_bucket_size: bucketSize,
        p_top_n: topN,
    });

    if (error) {
        console.error("[getMarketShareTimeseries] Error:", error);
    }

    return { data: (data ?? []) as MarketShareTimeseriesData[] };
}

/**
 * Get reliability metrics
 */
export async function getReliabilityMetrics(
    timeRange: string = "week"
): Promise<{ data: ReliabilityData[] }> {
    cacheLife(RANKINGS_CACHE);
    cacheTag("public-reliability");

    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("get_public_reliability_metrics", {
        p_time_range: timeRange,
    });

    return { data: (data ?? []) as ReliabilityData[] };
}

/**
 * Get geographic distribution
 */
export async function getGeographicDistribution(
    timeRange: string = "week",
    limit: number = 20
): Promise<{ data: GeographyData[] }> {
    cacheLife(RANKINGS_CACHE);
    cacheTag("public-geography");

    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("get_public_geographic_distribution", {
        p_time_range: timeRange,
        p_limit: limit,
    });

    return { data: (data ?? []) as GeographyData[] };
}

/**
 * Get multimodal breakdown
 */
export async function getMultimodalBreakdown(
    timeRange: string = "week"
): Promise<{ data: MultimodalData[] }> {
    cacheLife(RANKINGS_CACHE);
    cacheTag("public-multimodal");

    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("get_public_multimodal_breakdown", {
        p_time_range: timeRange,
    });

    return { data: (data ?? []) as MultimodalData[] };
}

/**
 * Get top apps
 */
export async function getTopApps(
    timeRange: string = "week",
    limit: number = 20
): Promise<{ data: TopAppData[] }> {
    cacheLife(RANKINGS_CACHE);
    cacheTag("public-top-apps");

    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("get_public_top_apps", {
        p_time_range: timeRange,
        p_limit: limit,
    });

    return { data: (data ?? []) as TopAppData[] };
}

/**
 * Resolve app image URLs for Top Apps list rendering.
 */
export async function getAppImageUrlsByIds(
    appIds: string[]
): Promise<Record<string, string | null>> {
    cacheLife("hours");
    cacheTag("data:apps");

    const uniqueIds = Array.from(new Set(appIds.filter(Boolean)));
    if (uniqueIds.length === 0) return {};

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("api_apps")
        .select("id, image_url")
        .in("id", uniqueIds);

    if (error) {
        console.error("[getAppImageUrlsByIds] Error:", error);
        return {};
    }

    const out: Record<string, string | null> = {};
    for (const row of data ?? []) {
        if (!row?.id) continue;
        out[row.id] = row.image_url ?? null;
    }
    return out;
}
