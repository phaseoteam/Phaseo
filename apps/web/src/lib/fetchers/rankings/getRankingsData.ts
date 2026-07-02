// lib/fetchers/rankings/getRankingsData.ts
// Purpose: Fetch public rankings data from database
// Why: Provides type-safe data fetching with Next.js caching
// How: Calls Supabase RPC functions directly with proper cache configuration

"use cache";
import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";
import { getPublicAppIdsCached } from "@/lib/fetchers/apps/getAppDetails";
import {
	fetchPublicGatewayRequestRows,
	type PublicGatewayRequestRow,
} from "@/lib/fetchers/gateway/fetchPublicGatewayRequests";
import { sumTokens } from "@/lib/utils/sumTokens";


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

const DEFAULT_SUMMARY_STATS: SummaryStats = {
    total_requests_24h: 0,
    total_tokens_24h: 0,
    total_models: 0,
    total_providers: 0,
    avg_latency_ms: 0,
    success_rate_24h: 0,
};

function toFiniteNumber(value: unknown): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

function roundTokens(value: unknown): number {
	return Math.max(0, Math.round(sumTokens(value)));
}

function readUsageNumber(
	usage: Record<string, unknown> | null | undefined,
	...keys: string[]
): number {
	if (!usage) return 0;
	for (const key of keys) {
		const value = usage[key];
		if (typeof value === "number" && Number.isFinite(value)) {
			return Math.max(0, value);
		}
		if (typeof value === "string" && value.trim()) {
			const parsed = Number(value);
			if (Number.isFinite(parsed)) return Math.max(0, parsed);
		}
	}
	return 0;
}

function addFinite(
	total: number,
	value: number | string | null | undefined,
): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? total + parsed : total;
}

function resolveGatewayRequestModelId(row: {
	canonical_model_id?: string | null;
	model_id?: string | null;
	routed_model_id?: string | null;
	requested_model_id?: string | null;
}): string | null {
	for (const value of [
		row.canonical_model_id,
		row.model_id,
		row.routed_model_id,
		row.requested_model_id,
	]) {
		const normalized = String(value ?? "").trim();
		if (normalized) return normalized;
	}
	return null;
}

function emptyMultimodalAggregate(model_id: string): MultimodalData {
	return {
		model_id,
		text_tokens: 0,
		audio_tokens: 0,
		video_tokens: 0,
		cached_tokens: 0,
		image_count: 0,
		input_text_tokens: 0,
		output_text_tokens: 0,
		input_image_tokens: 0,
		output_image_tokens: 0,
		image_inputs: 0,
		image_outputs: 0,
		image_megapixels: 0,
		input_audio_tokens: 0,
		output_audio_tokens: 0,
		audio_inputs: 0,
		audio_outputs: 0,
		audio_seconds: 0,
		input_video_tokens: 0,
		output_video_tokens: 0,
		video_inputs: 0,
		video_outputs: 0,
		video_seconds: 0,
		video_pixel_seconds: 0,
		cached_read_tokens: 0,
		cached_write_tokens: 0,
		cached_read_text_tokens: 0,
		cached_write_text_tokens: 0,
		cached_read_image_tokens: 0,
		cached_write_image_tokens: 0,
		cached_read_audio_tokens: 0,
		cached_write_audio_tokens: 0,
		cached_read_video_tokens: 0,
		cached_write_video_tokens: 0,
		input_quad_tokens: 0,
		output_quad_tokens: 0,
		total_quad_tokens: 0,
		text_quad_tokens: 0,
		rerank_quad_tokens: 0,
		embedding_tokens: 0,
		embedding_quad_tokens: 0,
		total_requests: 0,
		total_cost_nanos: 0,
		avg_latency_ms: null,
		avg_generation_ms: null,
		avg_throughput: null,
	};
}

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
    users?: number;
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
    input_text_tokens?: number;
    output_text_tokens?: number;
    input_image_tokens?: number;
    output_image_tokens?: number;
    image_inputs?: number;
    image_outputs?: number;
    image_megapixels?: number;
    input_audio_tokens?: number;
    output_audio_tokens?: number;
    audio_inputs?: number;
    audio_outputs?: number;
    audio_seconds?: number;
    input_video_tokens?: number;
    output_video_tokens?: number;
    video_inputs?: number;
    video_outputs?: number;
    video_seconds?: number;
    video_pixel_seconds?: number;
    cached_read_tokens?: number;
    cached_write_tokens?: number;
    cached_read_text_tokens?: number;
    cached_write_text_tokens?: number;
    cached_read_image_tokens?: number;
    cached_write_image_tokens?: number;
    cached_read_audio_tokens?: number;
    cached_write_audio_tokens?: number;
    cached_read_video_tokens?: number;
    cached_write_video_tokens?: number;
    input_quad_tokens?: number;
    output_quad_tokens?: number;
    total_quad_tokens?: number;
    text_quad_tokens?: number;
    rerank_quad_tokens?: number;
    embedding_tokens?: number;
    embedding_quad_tokens?: number;
    total_requests?: number;
    total_cost_nanos?: number;
    avg_latency_ms?: number | null;
    avg_generation_ms?: number | null;
    avg_throughput?: number | null;
};

export type ModalityTimeseriesMetric =
	| "text_tokens"
	| "image_inputs"
	| "image_outputs"
	| "audio_tokens"
	| "video_tokens"
	| "video_seconds"
	| "cached_tokens"
	| "audio_seconds"
	| "embedding_tokens"
	| "rerank_quad_tokens";

export type TopAppData = {
    app_id: string;
    app_name: string;
    requests: number;
    tokens: number;
    unique_models: number;
    image_url?: string | null;
};

export type TrendingAppData = {
    app_id: string;
    app_name: string;
    current_week_tokens: number;
    previous_week_tokens: number;
    growth_tokens: number;
    growth_pct: number | null;
};

export type WeeklyModelProviderTokens = {
    week_bucket: string;
    model_id: string;
    provider: string;
    requests: number;
    total_tokens: number;
    total_cost_usd: number;
    success_rate: number | null;
};

export type DailyAppRollup = {
    day_bucket: string;
    app_id: string;
    requests: number;
    total_tokens: number;
    total_cost_usd: number;
    unique_models: number;
    success_rate: number | null;
};

export type RankingsIndexabilitySnapshot = {
	hasLeaderboardData: boolean;
	hasPerformanceData: boolean;
	hasUsageData: boolean;
	hasAppsData: boolean;
	shouldIndex: boolean;
};

export type AppsIndexabilitySnapshot = {
	hasLeaderboardData: boolean;
	hasTrendingData: boolean;
	shouldIndex: boolean;
};

const APPS_INDEXABILITY_QUERY_LIMIT = 300;

function getDefaultWeeklySinceIso(): string {
    const now = new Date();
    const since = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    since.setUTCDate(since.getUTCDate() - 7);
    return since.toISOString();
}

function hasValidAppId(appId: unknown): appId is string {
    const normalizedId = String(appId ?? "").trim();
    if (!normalizedId) return false;

    const lowerId = normalizedId.toLowerCase();
    return (
        lowerId !== "unknown" &&
        lowerId !== "unknown-app" &&
        lowerId !== "unknown_app"
    );
}

function normalizeAppTitle(value: unknown): string | null {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) return null;

    const normalized = trimmed
        .toLowerCase()
        .replace(/[?.!]+$/g, "")
        .replace(/\s+/g, " ")
        .trim();

    if (
        normalized === "unknown" ||
        normalized === "unknown app" ||
        normalized === "app" ||
        normalized === "untitled" ||
        normalized === "n/a" ||
        normalized === "na" ||
        normalized === "none" ||
        normalized === "null" ||
        normalized === "undefined"
    ) {
        return null;
    }

    return trimmed;
}

function deriveTitleFromUrl(value: unknown): string | null {
    const raw = String(value ?? "").trim();
    if (!raw) return null;

    try {
        const url = new URL(raw);
        if (url.protocol !== "http:" && url.protocol !== "https:") return null;
        const hostname = url.hostname.replace(/^www\./i, "").trim();
        return hostname || null;
    } catch {
        return null;
    }
}

function getRangeStart(timeRange: string): Date {
	const now = new Date();
	switch (timeRange) {
		case "today":
			return new Date(Date.UTC(
				now.getUTCFullYear(),
				now.getUTCMonth(),
				now.getUTCDate(),
			));
		case "week":
			return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
		case "4w":
			return new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
		case "month":
			return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
		case "year":
			return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
		default:
			return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
	}
}

function getFetchWindowDays(timeRange: string): number {
	switch (timeRange) {
		case "today":
			return 1;
		case "week":
			return 7;
		case "4w":
			return 28;
		case "month":
			return 30;
		case "year":
			return 365;
		default:
			return 7;
	}
}

function startOfUtcWeek(value: string | null | undefined): string | null {
	if (!value) return null;
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return null;
	const date = new Date(
		Date.UTC(
			parsed.getUTCFullYear(),
			parsed.getUTCMonth(),
			parsed.getUTCDate(),
		),
	);
	const day = (date.getUTCDay() + 6) % 7;
	date.setUTCDate(date.getUTCDate() - day);
	return date.toISOString();
}

function extractGatewayRequestModalityMetrics(
	row: PublicGatewayRequestRow,
): Record<ModalityTimeseriesMetric, number> {
	const usage = row.usage ?? {};
	const endpoint = String(row.endpoint ?? "").trim();
	const inputTextTokens = readUsageNumber(
		usage,
		"input_text_tokens",
		"prompt_text_tokens",
		"text_input_tokens",
	);
	const outputTextTokens = readUsageNumber(
		usage,
		"output_text_tokens",
		"completion_text_tokens",
		"text_output_tokens",
	);
	const inputTokens = readUsageNumber(usage, "input_tokens", "prompt_tokens");
	const outputTokens = readUsageNumber(
		usage,
		"output_tokens",
		"completion_tokens",
	);
	const totalTokens = readUsageNumber(usage, "total_tokens") || roundTokens(usage);
	const textEndpoint =
		endpoint === "chat.completions" ||
		endpoint === "responses" ||
		endpoint === "messages" ||
		endpoint === "completions";
	const embeddingEndpoint = endpoint === "embeddings";
	const rerankEndpoint = endpoint === "rerank";
	const resolvedInputText = inputTextTokens || (textEndpoint ? inputTokens : 0);
	const resolvedOutputText = outputTextTokens || (textEndpoint ? outputTokens : 0);
	const inputAudioTokens = readUsageNumber(
		usage,
		"input_audio_tokens",
		"audio_input_tokens",
	);
	const outputAudioTokens = readUsageNumber(
		usage,
		"output_audio_tokens",
		"audio_output_tokens",
	);
	const inputVideoTokens = readUsageNumber(
		usage,
		"input_video_tokens",
		"video_input_tokens",
	);
	const outputVideoTokens = readUsageNumber(
		usage,
		"output_video_tokens",
		"video_output_tokens",
	);
	const cachedRead = readUsageNumber(
		usage,
		"cached_read_tokens",
		"cache_read_tokens",
	);
	const cachedWrite = readUsageNumber(
		usage,
		"cached_write_tokens",
		"cache_write_tokens",
	);
	return {
		text_tokens: resolvedInputText + resolvedOutputText,
		image_inputs: readUsageNumber(
			usage,
			"image_inputs",
			"input_images",
			"images_input",
		),
		image_outputs: readUsageNumber(
			usage,
			"image_outputs",
			"output_images",
			"images",
			"images_output",
		),
		audio_tokens: inputAudioTokens + outputAudioTokens,
		video_tokens: inputVideoTokens + outputVideoTokens,
		video_seconds: readUsageNumber(
			usage,
			"video_seconds",
			"input_video_seconds",
			"output_video_seconds",
		),
		cached_tokens: cachedRead + cachedWrite,
		audio_seconds: readUsageNumber(
			usage,
			"audio_seconds",
			"input_audio_seconds",
			"output_audio_seconds",
		),
		embedding_tokens:
			readUsageNumber(usage, "embedding_tokens") ||
			(embeddingEndpoint ? totalTokens || inputTokens : 0),
		rerank_quad_tokens:
			readUsageNumber(usage, "rerank_tokens", "rerank_quad_tokens") ||
			(rerankEndpoint ? totalTokens || inputTokens : 0),
	};
}

function isMissingRollupRelationError(error: unknown): boolean {
	const message =
		typeof error === "object" && error && "message" in error
			? String((error as { message?: unknown }).message ?? "")
			: String(error ?? "");

	return (
		message.includes('relation "public.gateway_usage_rollup_daily_app" does not exist') ||
		message.includes('relation "public.gateway_usage_rollup_daily_app_model" does not exist')
	);
}

async function fetchTopAppsFromGatewayRequests(
	timeRange: string,
	limit: number,
): Promise<TopAppData[]> {
	const rangeStart = getRangeStart(timeRange);
	const rows = await fetchPublicGatewayRequestRows(getFetchWindowDays(timeRange), {
		successOnly: false,
	});
	const aggregate = new Map<
		string,
		{ requests: number; tokens: number; modelIds: Set<string> }
	>();

	for (const row of rows) {
		const appId = String(row.app_id ?? "").trim();
		if (!hasValidAppId(appId)) continue;

		const createdAt = row.created_at ? new Date(row.created_at) : null;
		if (!createdAt || Number.isNaN(createdAt.getTime()) || createdAt < rangeStart) {
			continue;
		}

		const current = aggregate.get(appId) ?? {
			requests: 0,
			tokens: 0,
			modelIds: new Set<string>(),
		};
		current.requests += 1;
		current.tokens += roundTokens(row.usage);

		const modelId = String(row.model_id ?? "").trim();
		if (modelId) {
			current.modelIds.add(modelId);
		}

		aggregate.set(appId, current);
	}

	const appIds = Array.from(aggregate.keys());
	const fallbackTitlesById = await resolveFallbackAppTitlesById(appIds);

	return appIds
		.map((appId) => {
			const metrics = aggregate.get(appId);
			if (!metrics) return null;

			return {
				app_id: appId,
				app_name: fallbackTitlesById.get(appId) ?? appId,
				requests: metrics.requests,
				tokens: metrics.tokens,
				unique_models: metrics.modelIds.size,
			};
		})
		.filter((row): row is TopAppData => Boolean(row))
		.sort((a, b) => {
			if (b.requests !== a.requests) return b.requests - a.requests;
			return b.tokens - a.tokens;
		})
		.slice(0, limit);
}

async function fetchTrendingAppsFromGatewayRequests(
	limit: number,
	minWeekTokens: number,
): Promise<TrendingAppData[]> {
	const rows = await fetchPublicGatewayRequestRows(14, { successOnly: false });
	const now = Date.now();
	const currentWeekStart = now - 7 * 24 * 60 * 60 * 1000;
	const previousWeekStart = now - 14 * 24 * 60 * 60 * 1000;
	const aggregate = new Map<
		string,
		{ currentWeekTokens: number; previousWeekTokens: number }
	>();

	for (const row of rows) {
		const appId = String(row.app_id ?? "").trim();
		if (!hasValidAppId(appId)) continue;

		const createdAtMs = row.created_at ? Date.parse(row.created_at) : Number.NaN;
		if (!Number.isFinite(createdAtMs) || createdAtMs < previousWeekStart) continue;

		const current = aggregate.get(appId) ?? {
			currentWeekTokens: 0,
			previousWeekTokens: 0,
		};
		const tokens = roundTokens(row.usage);

		if (createdAtMs >= currentWeekStart) {
			current.currentWeekTokens += tokens;
		} else {
			current.previousWeekTokens += tokens;
		}

		aggregate.set(appId, current);
	}

	const appIds = Array.from(aggregate.keys());
	const fallbackTitlesById = await resolveFallbackAppTitlesById(appIds);

	return appIds
		.map((appId) => {
			const metrics = aggregate.get(appId);
			if (!metrics) return null;

			const growthTokens = metrics.currentWeekTokens - metrics.previousWeekTokens;
			if (metrics.currentWeekTokens < minWeekTokens || growthTokens <= 0) {
				return null;
			}

			return {
				app_id: appId,
				app_name: fallbackTitlesById.get(appId) ?? appId,
				current_week_tokens: metrics.currentWeekTokens,
				previous_week_tokens: metrics.previousWeekTokens,
				growth_tokens: growthTokens,
				growth_pct:
					metrics.previousWeekTokens > 0
						? Number(
								(
									((metrics.currentWeekTokens - metrics.previousWeekTokens) /
										metrics.previousWeekTokens) *
									100
								).toFixed(2),
						)
						: null,
			};
		})
		.filter((row): row is TrendingAppData => Boolean(row))
		.sort((a, b) => b.growth_tokens - a.growth_tokens)
		.slice(0, limit);
}

async function resolveFallbackAppTitlesById(
    appIds: string[]
): Promise<Map<string, string>> {
    const uniqueIds = Array.from(new Set(appIds.filter(hasValidAppId)));
    if (uniqueIds.length === 0) return new Map();

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("api_apps")
        .select("id, title, url")
        .in("id", uniqueIds);

    if (error) {
        console.error("[resolveFallbackAppTitlesById] Error:", error);
        return new Map();
    }

    const titleById = new Map<string, string>();
    for (const row of data ?? []) {
        const appId = String(row?.id ?? "").trim();
        if (!hasValidAppId(appId)) continue;

        const resolvedTitle =
            normalizeAppTitle(row?.title) ?? deriveTitleFromUrl(row?.url);
        if (!resolvedTitle) continue;

        titleById.set(appId, resolvedTitle);
    }

    return titleById;
}

export type TopModelWithMetadata = {
    model_id: string;
    model_name: string;
    organisation_id: string | null;
    organisation_name: string | null;
    total_tokens: number;
};

/**
 * Get main rankings data with trending and summary stats
 */
export async function getRankings(
    timeRange: string = "week",
    metric: string = "tokens",
    limit: number = 50
): Promise<RankingsResponse> {
    "use cache";

    cacheLife("hours");
    cacheTag("public-rankings");
    cacheTag("frontend:model-rankings");

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
        getPublicSummaryStats(),
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
        data: summaryRes,
    });

    if (rankingsRes.error) {
        console.error("[getRankings] Rankings error:", rankingsRes.error);
    }
    if (trendingRes.error) {
        console.error("[getRankings] Trending error:", trendingRes.error);
    }
    return {
        ok: !rankingsRes.error,
        rankings: (rankingsRes.data ?? []) as RankingModel[],
        trending: (trendingRes.data ?? []) as TrendingModel[],
        summary: summaryRes ?? DEFAULT_SUMMARY_STATS,
    };
}

export async function getPublicSummaryStats(): Promise<SummaryStats> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-rankings");
	cacheTag("data:gateway_requests");

	const rows = await fetchPublicGatewayRequestRows(1, { successOnly: false });
	if (!rows.length) {
		return DEFAULT_SUMMARY_STATS;
	}

	let totalRequests = 0;
	let totalTokens = 0;
	let totalModels = 0;
	let totalProviders = 0;
	let totalLatency = 0;
	let latencySamples = 0;
	let successfulRequests = 0;
	const modelIds = new Set<string>();
	const providerIds = new Set<string>();

	for (const row of rows) {
		totalRequests += 1;
		totalTokens += roundTokens(row.usage);
		if (row.model_id) modelIds.add(row.model_id);
		if (row.provider) providerIds.add(row.provider);

		const latency = toFiniteNumber(row.latency_ms);
		if (latency > 0) {
			totalLatency += latency;
			latencySamples += 1;
		}

		if (row.success) {
			successfulRequests += 1;
		}
	}

	totalModels = modelIds.size;
	totalProviders = providerIds.size;

	return {
		total_requests_24h: totalRequests,
		total_tokens_24h: totalTokens,
		total_models: totalModels,
		total_providers: totalProviders,
		avg_latency_ms: latencySamples > 0 ? Math.round(totalLatency / latencySamples) : 0,
		success_rate_24h: totalRequests > 0 ? successfulRequests / totalRequests : 0,
	};
}

export async function getPublicMonthlyTokenTotal(): Promise<number> {
	"use cache";

	cacheLife("days");
	cacheTag("public-rankings");
	cacheTag("data:gateway_requests");

	const rows = await fetchPublicGatewayRequestRows(30, { successOnly: true });
	if (!rows.length) return 0;

	return rows.reduce((total, row) => total + roundTokens(row.usage), 0);
}

/**
 * Get performance data for scatter chart
 */
export async function getPerformanceData(hours: number = 24): Promise<{ data: PerformanceData[] }> {
    "use cache";

    cacheLife("hours");
    cacheTag("public-performance");
    cacheTag("frontend:rankings-performance");

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
    "use cache";

    cacheLife("hours");
    cacheTag("public-market-share");
    cacheTag("frontend:rankings-market-share");

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
    "use cache";

    cacheLife("hours");
    cacheTag("public-timeseries");
    cacheTag("frontend:rankings-timeseries");

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
    "use cache";

    cacheLife("hours");
    cacheTag("public-model-catalogue");
    cacheTag("data:models");
    cacheTag("frontend:model-names");

    const uniqueIds = Array.from(new Set(modelIds.filter(Boolean)));
    if (uniqueIds.length === 0) return {};

    const metaById = await getModelLeaderboardMetaByIds(uniqueIds);

    const out: Record<string, string> = {};
    for (const modelId of uniqueIds) {
        const name = metaById[modelId]?.name?.trim();
        if (name) out[modelId] = name;
    }

    return out;
}

/**
 * Resolve provider names for display labels
 */
export async function getProviderNamesByIds(
    providerIds: string[]
): Promise<Record<string, string>> {
    "use cache";

    cacheLife("hours");
    cacheTag("public-model-catalogue");
    cacheTag("data:api_providers");
    cacheTag("frontend:provider-names");

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
    "use cache";

    cacheLife("hours");
    cacheTag("public-model-catalogue");
    cacheTag("data:api_providers");
    cacheTag("frontend:provider-meta");

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
    "use cache";

    cacheLife("hours");
    cacheTag("public-model-catalogue");
    cacheTag("data:organisations");
    cacheTag("frontend:organisation-logo-ids");

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
    license: string | null;
};

/**
 * Resolve model metadata for leaderboard rendering
 */
export async function getModelLeaderboardMetaByIds(
    modelIds: string[]
): Promise<Record<string, ModelLeaderboardMeta>> {
    "use cache";

    cacheLife("hours");
    cacheTag("public-model-catalogue");
    cacheTag("data:models");
    cacheTag("data:data_api_provider_models");
    cacheTag("frontend:model-leaderboard-meta");

    const uniqueIds = Array.from(new Set(modelIds.filter(Boolean)));
    if (uniqueIds.length === 0) return {};

    const supabase = createAdminClient();

    const toMeta = (row: any): ModelLeaderboardMeta | null => {
        if (!row?.model_id) return null;
        const organisation = row.organisation ?? null;
        return {
            model_id: row.model_id,
            name: row.name ?? null,
            organisation_id: row.organisation_id ?? null,
            organisation_name: organisation?.name ?? null,
            organisation_colour: organisation?.colour ?? null,
            license: row.license ?? null,
        };
    };

    const { data, error } = await supabase
        .from("data_models")
        .select(
            "model_id, name, organisation_id, license, organisation:data_organisations!data_models_organisation_id_fkey(name, colour)"
        )
        .in("model_id", uniqueIds);

    if (error) {
        console.error("[getModelLeaderboardMetaByIds] Error:", error);
        return {};
    }

    const out: Record<string, ModelLeaderboardMeta> = {};
    for (const row of data ?? []) {
        const meta = toMeta(row);
        if (meta) out[meta.model_id] = meta;
    }

    const unresolvedIds = uniqueIds.filter((modelId) => !out[modelId]);
    if (!unresolvedIds.length) return out;

    const unresolvedSet = new Set(unresolvedIds);
    const [
        providerApiIdRes,
        apiModelIdRes,
        providerSlugRes,
    ] = await Promise.all([
        supabase
            .from("data_api_provider_models")
            .select("provider_api_model_id, api_model_id, provider_model_slug, model_id")
            .in("provider_api_model_id", unresolvedIds),
        supabase
            .from("data_api_provider_models")
            .select("provider_api_model_id, api_model_id, provider_model_slug, model_id")
            .in("api_model_id", unresolvedIds),
        supabase
            .from("data_api_provider_models")
            .select("provider_api_model_id, api_model_id, provider_model_slug, model_id")
            .in("provider_model_slug", unresolvedIds),
    ]);

    for (const result of [providerApiIdRes, apiModelIdRes, providerSlugRes]) {
        if (result.error) {
            console.error("[getModelLeaderboardMetaByIds] Alias lookup error:", result.error);
        }
    }

    const aliasToCanonical = new Map<string, string>();
    for (const row of [
        ...(providerApiIdRes.data ?? []),
        ...(apiModelIdRes.data ?? []),
        ...(providerSlugRes.data ?? []),
    ]) {
        const canonicalId = String(row?.model_id ?? "").trim();
        if (!canonicalId) continue;
        for (const alias of [
            row?.provider_api_model_id,
            row?.api_model_id,
            row?.provider_model_slug,
        ]) {
            const normalizedAlias = String(alias ?? "").trim();
            if (unresolvedSet.has(normalizedAlias) && !aliasToCanonical.has(normalizedAlias)) {
                aliasToCanonical.set(normalizedAlias, canonicalId);
            }
        }
    }

    const canonicalIds = Array.from(new Set(aliasToCanonical.values()));
    if (!canonicalIds.length) return out;

    const { data: canonicalData, error: canonicalError } = await supabase
        .from("data_models")
        .select(
            "model_id, name, organisation_id, license, organisation:data_organisations!data_models_organisation_id_fkey(name, colour)"
        )
        .in("model_id", canonicalIds);

    if (canonicalError) {
        console.error("[getModelLeaderboardMetaByIds] Canonical lookup error:", canonicalError);
        return out;
    }

    const canonicalMetaById = new Map<string, ModelLeaderboardMeta>();
    for (const row of canonicalData ?? []) {
        const meta = toMeta(row);
        if (meta) canonicalMetaById.set(meta.model_id, meta);
    }

    for (const [alias, canonicalId] of aliasToCanonical.entries()) {
        const canonicalMeta = canonicalMetaById.get(canonicalId);
        out[alias] =
            canonicalMeta ?? {
                model_id: canonicalId,
                name: null,
                organisation_id: null,
                organisation_name: null,
                organisation_colour: null,
                license: null,
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
    "use cache";

    cacheLife("hours");
    cacheTag("public-market-share-timeseries");
    cacheTag("frontend:rankings-market-share-timeseries");

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
    "use cache";

    cacheLife("hours");
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
    "use cache";

    cacheLife("hours");
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
async function getMultimodalBreakdownFromGatewayRequests(
	timeRange: string,
): Promise<MultimodalData[]> {
	const rows = await fetchPublicGatewayRequestRows(getFetchWindowDays(timeRange), {
		successOnly: true,
	});
	const aggregate = new Map<
		string,
		MultimodalData & {
			latency_sum_ms: number;
			latency_samples: number;
			generation_sum_ms: number;
			generation_samples: number;
			throughput_sum: number;
			throughput_samples: number;
		}
	>();

	for (const row of rows) {
		const modelId = resolveGatewayRequestModelId(row);
		if (!modelId) continue;

		const usage = row.usage ?? {};
		const endpoint = String(row.endpoint ?? "").trim();
		const current =
			aggregate.get(modelId) ??
			({
				...emptyMultimodalAggregate(modelId),
				latency_sum_ms: 0,
				latency_samples: 0,
				generation_sum_ms: 0,
				generation_samples: 0,
				throughput_sum: 0,
				throughput_samples: 0,
			});

		const inputTextTokens = readUsageNumber(
			usage,
			"input_text_tokens",
			"prompt_text_tokens",
			"text_input_tokens",
		);
		const outputTextTokens = readUsageNumber(
			usage,
			"output_text_tokens",
			"completion_text_tokens",
			"text_output_tokens",
		);
		const inputTokens = readUsageNumber(usage, "input_tokens", "prompt_tokens");
		const outputTokens = readUsageNumber(
			usage,
			"output_tokens",
			"completion_tokens",
		);
		const totalTokens = readUsageNumber(usage, "total_tokens") || roundTokens(usage);
		const textEndpoint =
			endpoint === "chat.completions" ||
			endpoint === "responses" ||
			endpoint === "messages" ||
			endpoint === "completions";
		const embeddingEndpoint = endpoint === "embeddings";
		const rerankEndpoint = endpoint === "rerank";

		const resolvedInputText = inputTextTokens || (textEndpoint ? inputTokens : 0);
		const resolvedOutputText = outputTextTokens || (textEndpoint ? outputTokens : 0);
		current.input_text_tokens =
			Number(current.input_text_tokens ?? 0) + resolvedInputText;
		current.output_text_tokens =
			Number(current.output_text_tokens ?? 0) + resolvedOutputText;
		current.text_tokens =
			Number(current.text_tokens ?? 0) + resolvedInputText + resolvedOutputText;

		const inputImageTokens = readUsageNumber(
			usage,
			"input_image_tokens",
			"image_input_tokens",
		);
		const outputImageTokens = readUsageNumber(
			usage,
			"output_image_tokens",
			"image_output_tokens",
		);
		const imageInputs = readUsageNumber(
			usage,
			"image_inputs",
			"input_images",
			"images_input",
		);
		const imageOutputs = readUsageNumber(
			usage,
			"image_outputs",
			"output_images",
			"images",
			"images_output",
		);
		current.input_image_tokens =
			Number(current.input_image_tokens ?? 0) + inputImageTokens;
		current.output_image_tokens =
			Number(current.output_image_tokens ?? 0) + outputImageTokens;
		current.image_inputs = Number(current.image_inputs ?? 0) + imageInputs;
		current.image_outputs = Number(current.image_outputs ?? 0) + imageOutputs;
		current.image_count =
			Number(current.image_count ?? 0) + imageInputs + imageOutputs;
		current.image_megapixels =
			Number(current.image_megapixels ?? 0) +
			readUsageNumber(usage, "image_megapixels", "output_image_megapixels");

		const inputAudioTokens = readUsageNumber(
			usage,
			"input_audio_tokens",
			"audio_input_tokens",
		);
		const outputAudioTokens = readUsageNumber(
			usage,
			"output_audio_tokens",
			"audio_output_tokens",
		);
		current.input_audio_tokens =
			Number(current.input_audio_tokens ?? 0) + inputAudioTokens;
		current.output_audio_tokens =
			Number(current.output_audio_tokens ?? 0) + outputAudioTokens;
		current.audio_tokens =
			Number(current.audio_tokens ?? 0) + inputAudioTokens + outputAudioTokens;
		current.audio_inputs =
			Number(current.audio_inputs ?? 0) +
			readUsageNumber(usage, "audio_inputs", "input_audio_count");
		current.audio_outputs =
			Number(current.audio_outputs ?? 0) +
			readUsageNumber(usage, "audio_outputs", "output_audio_count");
		current.audio_seconds =
			Number(current.audio_seconds ?? 0) +
			readUsageNumber(
				usage,
				"audio_seconds",
				"input_audio_seconds",
				"output_audio_seconds",
			);

		const inputVideoTokens = readUsageNumber(
			usage,
			"input_video_tokens",
			"video_input_tokens",
		);
		const outputVideoTokens = readUsageNumber(
			usage,
			"output_video_tokens",
			"video_output_tokens",
		);
		current.input_video_tokens =
			Number(current.input_video_tokens ?? 0) + inputVideoTokens;
		current.output_video_tokens =
			Number(current.output_video_tokens ?? 0) + outputVideoTokens;
		current.video_tokens =
			Number(current.video_tokens ?? 0) + inputVideoTokens + outputVideoTokens;
		current.video_inputs =
			Number(current.video_inputs ?? 0) +
			readUsageNumber(usage, "video_inputs", "input_video_count");
		current.video_outputs =
			Number(current.video_outputs ?? 0) +
			readUsageNumber(usage, "video_outputs", "output_video_count");
		current.video_seconds =
			Number(current.video_seconds ?? 0) +
			readUsageNumber(
				usage,
				"video_seconds",
				"input_video_seconds",
				"output_video_seconds",
			);
		current.video_pixel_seconds =
			Number(current.video_pixel_seconds ?? 0) +
			readUsageNumber(usage, "video_pixel_seconds");

		const cachedRead = readUsageNumber(
			usage,
			"cached_read_tokens",
			"cache_read_tokens",
		);
		const cachedWrite = readUsageNumber(
			usage,
			"cached_write_tokens",
			"cache_write_tokens",
		);
		current.cached_read_tokens = Number(current.cached_read_tokens ?? 0) + cachedRead;
		current.cached_write_tokens =
			Number(current.cached_write_tokens ?? 0) + cachedWrite;
		current.cached_tokens =
			Number(current.cached_tokens ?? 0) + cachedRead + cachedWrite;

		const embeddingTokens =
			readUsageNumber(usage, "embedding_tokens") ||
			(embeddingEndpoint ? totalTokens || inputTokens : 0);
		const rerankTokens =
			readUsageNumber(usage, "rerank_tokens") ||
			(rerankEndpoint ? totalTokens || inputTokens : 0);
		current.embedding_tokens =
			Number(current.embedding_tokens ?? 0) + embeddingTokens;
		current.embedding_quad_tokens =
			Number(current.embedding_quad_tokens ?? 0) +
			readUsageNumber(usage, "embedding_quad_tokens");
		current.rerank_quad_tokens =
			Number(current.rerank_quad_tokens ?? 0) + rerankTokens;
		current.input_quad_tokens =
			Number(current.input_quad_tokens ?? 0) + (inputTokens || resolvedInputText);
		current.output_quad_tokens =
			Number(current.output_quad_tokens ?? 0) + (outputTokens || resolvedOutputText);
		current.total_quad_tokens =
			Number(current.total_quad_tokens ?? 0) + totalTokens;
		current.text_quad_tokens =
			Number(current.text_quad_tokens ?? 0) + resolvedInputText + resolvedOutputText;
		current.total_requests = Number(current.total_requests ?? 0) + 1;
		current.total_cost_nanos = addFinite(
			Number(current.total_cost_nanos ?? 0),
			row.cost_nanos,
		);

		const latency = Number(row.latency_ms);
		if (Number.isFinite(latency) && latency > 0) {
			current.latency_sum_ms += latency;
			current.latency_samples += 1;
		}
		const generation = Number(row.generation_ms);
		if (Number.isFinite(generation) && generation > 0) {
			current.generation_sum_ms += generation;
			current.generation_samples += 1;
		}
		const throughput = Number(row.throughput);
		if (Number.isFinite(throughput) && throughput > 0) {
			current.throughput_sum += throughput;
			current.throughput_samples += 1;
		}

		aggregate.set(modelId, current);
	}

	return Array.from(aggregate.values())
		.map((row) => {
			const {
				latency_sum_ms,
				latency_samples,
				generation_sum_ms,
				generation_samples,
				throughput_sum,
				throughput_samples,
				...publicRow
			} = row;
			return {
				...publicRow,
				avg_latency_ms:
					latency_samples > 0
						? Number((latency_sum_ms / latency_samples).toFixed(2))
						: null,
				avg_generation_ms:
					generation_samples > 0
						? Number((generation_sum_ms / generation_samples).toFixed(2))
						: null,
				avg_throughput:
					throughput_samples > 0
						? Number((throughput_sum / throughput_samples).toFixed(2))
						: null,
			};
		})
		.filter((row) => {
			const total =
				Number(row.text_tokens ?? 0) +
				Number(row.image_count ?? 0) +
				Number(row.audio_tokens ?? 0) +
				Number(row.video_tokens ?? 0) +
				(Number(row.embedding_tokens ?? 0) ||
					Number(row.embedding_quad_tokens ?? 0)) +
				Number(row.rerank_quad_tokens ?? 0);
			return total > 0;
		})
		.sort((left, right) => {
			const leftTotal =
				Number(left.text_tokens ?? 0) +
				Number(left.image_count ?? 0) +
				Number(left.audio_tokens ?? 0) +
				Number(left.video_tokens ?? 0) +
				(Number(left.embedding_tokens ?? 0) ||
					Number(left.embedding_quad_tokens ?? 0)) +
				Number(left.rerank_quad_tokens ?? 0);
			const rightTotal =
				Number(right.text_tokens ?? 0) +
				Number(right.image_count ?? 0) +
				Number(right.audio_tokens ?? 0) +
				Number(right.video_tokens ?? 0) +
				(Number(right.embedding_tokens ?? 0) ||
					Number(right.embedding_quad_tokens ?? 0)) +
				Number(right.rerank_quad_tokens ?? 0);
			return rightTotal - leftTotal;
		});
}

export async function getMultimodalBreakdown(
    timeRange: string = "week"
): Promise<{ data: MultimodalData[] }> {
    "use cache";

    cacheLife("hours");
    cacheTag("public-multimodal");

    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("get_public_multimodal_breakdown", {
        p_time_range: timeRange,
    });

    if (error) {
		console.error("[getMultimodalBreakdown] Error:", error);
		return { data: [] };
	}

    return { data: (data ?? []) as MultimodalData[] };
}

export async function getModalityWeeklyTimeseries(
	metric: ModalityTimeseriesMetric,
	timeRange: string = "year",
): Promise<{ data: TimeseriesData[] }> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-multimodal");
	cacheTag("public-timeseries");
	cacheTag("frontend:rankings-modality-timeseries");
	cacheTag("data:gateway_model_usage_daily");

	const supabase = createAdminClient();
	const { data, error } = await supabase.rpc("get_public_modality_usage_timeseries", {
		p_metric: metric,
		p_time_range: timeRange,
		p_top_n: 20,
	});

	if (error) {
		console.error("[getModalityWeeklyTimeseries] Error:", error);
	}

	return { data: (data ?? []) as TimeseriesData[] };
}

export async function getUniqueUserTimeseriesData(
	timeRange: string = "year",
	bucketSize: string = "week",
	topN: number = 10,
): Promise<{ data: TimeseriesData[] }> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-timeseries");
	cacheTag("public-unique-users");
	cacheTag("frontend:rankings-unique-users");

	const supabase = createAdminClient();
	const { data, error } = await supabase.rpc("get_public_unique_user_timeseries", {
		p_time_range: timeRange,
		p_bucket_size: bucketSize,
		p_top_n: topN,
	});

	if (error) {
		console.error("[getUniqueUserTimeseriesData] Error:", error);
		return { data: [] };
	}

	return { data: (data ?? []) as TimeseriesData[] };
}

/**
 * Get top apps
 */
export async function getTopApps(
    timeRange: string = "week",
    limit: number = 20
): Promise<{ data: TopAppData[] }> {
    "use cache";

    cacheLife("hours");
    cacheTag("public-top-apps");
    cacheTag("frontend:app-rankings");

    let supabase: ReturnType<typeof createAdminClient> | null = null;
    try {
        supabase = createAdminClient();
    } catch (error) {
        console.warn(
            "[getTopApps] admin client unavailable; returning no top apps.",
            error instanceof Error ? error.message : String(error),
        );
        return { data: [] };
    }
    const { data, error } = await supabase.rpc("get_public_top_apps", {
        p_time_range: timeRange,
        p_limit: limit,
    });

    if (error) {
        console.error("[getTopApps] Error:", error);
        if (isMissingRollupRelationError(error)) {
			try {
				return {
					data: await fetchTopAppsFromGatewayRequests(timeRange, limit),
				};
			} catch (fallbackError) {
				console.error("[getTopApps] raw fallback failed:", fallbackError);
			}
		}
        return { data: [] };
    }

    const filteredData = ((data ?? []) as TopAppData[])
        .filter((row) => hasValidAppId(row?.app_id))
        .map((row) => ({
            ...row,
            app_id: row.app_id.trim(),
        }));

    const unresolvedIds = filteredData
        .filter((row) => !normalizeAppTitle(row.app_name))
        .map((row) => row.app_id);
    const fallbackTitlesById = await resolveFallbackAppTitlesById(unresolvedIds);

    return {
        data: filteredData.map((row) => ({
            ...row,
            app_name:
                normalizeAppTitle(row.app_name) ??
                fallbackTitlesById.get(row.app_id) ??
                row.app_id,
        })),
	};
}

export async function getRankingsIndexabilitySnapshot(): Promise<RankingsIndexabilitySnapshot> {
	"use cache";

	cacheLife("hours");
	cacheTag("frontend:rankings-indexability");

	const [rankingsResult, performanceResult, usageResult, appsResult] =
		await Promise.all([
			getRankings("week", "tokens", 1),
			getPerformanceData(24),
			getTimeseriesData("year", "week", 1),
			getTopApps("week", 1),
		]);

	const hasLeaderboardData = rankingsResult.rankings.some(
		(row) =>
			Boolean(row.model_id) &&
			row.model_id.toLowerCase() !== "unknown" &&
			row.model_id.toLowerCase() !== "other" &&
			Number(row.total_tokens ?? 0) > 0,
	);
	const hasPerformanceData = performanceResult.data.some(
		(row) =>
			Boolean(row.model_id) &&
			Boolean(row.provider) &&
			Number.isFinite(Number(row.median_throughput ?? 0)) &&
			Number(row.median_throughput ?? 0) > 0,
	);
	const hasUsageData = usageResult.data.some(
		(row) =>
			Boolean(row.model_id) &&
			row.model_id.toLowerCase() !== "unknown" &&
			row.model_id.toLowerCase() !== "other" &&
			Number(row.tokens ?? 0) > 0,
	);
	const hasAppsData = appsResult.data.some((row) => Number(row.tokens ?? 0) > 0);

	return {
		hasLeaderboardData,
		hasPerformanceData,
		hasUsageData,
		hasAppsData,
		shouldIndex:
			hasLeaderboardData || hasPerformanceData || hasUsageData || hasAppsData,
	};
}

/**
 * Get model rankings rows only (without trending + summary companion RPCs).
 */
export async function getModelRankingsRows(
    timeRange: string = "week",
    metric: string = "tokens",
    limit: number = 50
): Promise<RankingModel[]> {
    "use cache";

    cacheLife("hours");
    cacheTag("public-rankings");
    cacheTag("frontend:model-rankings");

    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("get_public_model_rankings", {
        p_time_range: timeRange,
        p_metric: metric,
        p_limit: limit,
    });

    if (error) {
        console.error("[getModelRankingsRows] Error:", error);
        return [];
    }

    return (data ?? []) as RankingModel[];
}

/**
 * Get trending apps by week-over-week token growth.
 */
export async function getTrendingApps(
    limit: number = 20,
    minWeekTokens: number = 0
): Promise<{ data: TrendingAppData[] }> {
    "use cache";

    cacheLife("hours");
    cacheTag("public-top-apps");
    cacheTag("frontend:app-rankings");

    let supabase: ReturnType<typeof createAdminClient> | null = null;
    try {
        supabase = createAdminClient();
    } catch (error) {
        console.warn(
            "[getTrendingApps] admin client unavailable; returning no trending apps.",
            error instanceof Error ? error.message : String(error),
        );
        return { data: [] };
    }
    const { data, error } = await supabase.rpc("get_public_trending_apps", {
        p_limit: limit,
        p_min_week_tokens: minWeekTokens,
    });

    if (error) {
        console.error("[getTrendingApps] Error:", error);
        if (isMissingRollupRelationError(error)) {
			try {
				return {
					data: await fetchTrendingAppsFromGatewayRequests(limit, minWeekTokens),
				};
			} catch (fallbackError) {
				console.error("[getTrendingApps] raw fallback failed:", fallbackError);
			}
		}
        return { data: [] };
    }

    const filteredData = ((data ?? []) as TrendingAppData[])
        .filter((row) => hasValidAppId(row?.app_id))
        .map((row) => ({
            ...row,
            app_id: row.app_id.trim(),
        }));

    const unresolvedIds = filteredData
        .filter((row) => !normalizeAppTitle(row.app_name))
        .map((row) => row.app_id);
    const fallbackTitlesById = await resolveFallbackAppTitlesById(unresolvedIds);

    return {
        data: filteredData.map((row) => ({
            ...row,
            app_name:
                normalizeAppTitle(row.app_name) ??
                fallbackTitlesById.get(row.app_id) ??
                row.app_id,
        })),
	};
}

export async function getAppsIndexabilitySnapshot(): Promise<AppsIndexabilitySnapshot> {
	"use cache";

	cacheLife("hours");
	cacheTag("frontend:apps");
	cacheTag("frontend:rankings-indexability");

	const [publicAppIds, topAppsResult, trendingAppsResult] = await Promise.all([
		getPublicAppIdsCached(),
		getTopApps("4w", APPS_INDEXABILITY_QUERY_LIMIT),
		getTrendingApps(APPS_INDEXABILITY_QUERY_LIMIT),
	]);
	const publicAppIdSet = new Set(publicAppIds);

	const hasLeaderboardData = topAppsResult.data.some(
		(row) =>
			publicAppIdSet.has(String(row.app_id ?? "").trim()) &&
			Number(row.tokens ?? 0) > 0,
	);
	const hasTrendingData = trendingAppsResult.data.some(
		(row) =>
			publicAppIdSet.has(String(row.app_id ?? "").trim()) &&
			Number(row.growth_tokens ?? 0) > 0,
	);

	return {
		hasLeaderboardData,
		hasTrendingData,
		shouldIndex: hasLeaderboardData || hasTrendingData,
	};
}

export async function getWeeklyModelProviderTokens(): Promise<{
    data: WeeklyModelProviderTokens[];
}> {
    "use cache";

    cacheLife("hours");
    cacheTag("public-rankings");

    const supabase = createAdminClient();
    const sinceIso = getDefaultWeeklySinceIso();
    const { data, error } = await supabase.rpc(
        "get_usage_tokens_weekly_model_provider",
        {
            p_since: sinceIso,
        },
    );

    if (error) {
        console.error("[getWeeklyModelProviderTokens] Error:", error);
        return { data: [] };
    }

    return { data: (data ?? []) as WeeklyModelProviderTokens[] };
}

export async function getDailyAppRollup(
    sinceIso?: string,
): Promise<{ data: DailyAppRollup[] }> {
    "use cache";

    cacheLife("hours");
    cacheTag("public-top-apps");

    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("get_usage_daily_app", {
        p_since: sinceIso ?? null,
    });

    if (error) {
        console.error("[getDailyAppRollup] Error:", error);
        return { data: [] };
    }

    return { data: (data ?? []) as DailyAppRollup[] };
}

/**
 * Get top models with resolved organisation metadata.
 * Uses DB-side resolution logic for internal/api/provider model identifiers.
 */
export async function getTopModelsWithMetadata(
    timeRange: string = "week",
    limit: number = 6
): Promise<{ data: TopModelWithMetadata[] }> {
    "use cache";

    cacheLife("hours");
    cacheTag("public-rankings");

    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc(
        "get_public_top_models_with_metadata",
        {
            p_time_range: timeRange,
            p_limit: limit,
        }
    );

    if (error) {
        const err = error as any;
        console.error("[getTopModelsWithMetadata] RPC error", {
            message: err?.message ?? null,
            code: err?.code ?? null,
            details: err?.details ?? null,
            hint: err?.hint ?? null,
        });
        throw new Error(
            "Missing or failing RPC get_public_top_models_with_metadata. Apply migration 20260223010000_add_public_top_models_with_metadata.sql to the active database."
        );
    }

    return { data: (data ?? []) as TopModelWithMetadata[] };
}

/**
 * Resolve app image URLs for Top Apps list rendering.
 */
export async function getAppImageUrlsByIds(
    appIds: string[]
): Promise<Record<string, string | null>> {
    "use cache";

    cacheLife("hours");
    cacheTag("public-model-catalogue");
    cacheTag("data:apps");
    cacheTag("frontend:app-images");

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
