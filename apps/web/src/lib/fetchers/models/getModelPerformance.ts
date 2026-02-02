import { createAdminClient } from "@/utils/supabase/admin";
import { cacheLife, cacheTag } from "next/cache";

const HOURS_DEFAULT = 24 * 7;
const SUCCESS_WINDOW_HOURS = 24;
const SUCCESS_BUCKET_MINUTES = 15;
const PROVIDER_WINDOW_HOURS = 24;
const PROVIDER_UPTIME_BUCKET_HOURS = 6;

type RpcModelPerformanceResponse = {
	last_24h?: any;
	prev_24h?: any;
	hourly_24h?: any[];
	provider_uptime_24h?: any[];
	hourly_5d?: any[];
	time_of_day_5d?: any[];
	cumulative_tokens?: any;
};

export type ModelPerformancePoint = {
	bucket: string;
	avgThroughput: number | null;
	avgLatencyMs: number | null;
	avgGenerationMs: number | null;
	requests: number;
	successPct: number | null;
};

export type ModelSuccessPoint = {
	bucket: string;
	overallSuccessPct: number | null;
	worstProviderSuccessPct: number | null;
	requests: number;
};

export type ModelTimeOfDayPoint = {
	hour: number;
	avgThroughput: number | null;
	avgLatencyMs: number | null;
	avgGenerationMs: number | null;
	sampleCount: number;
};

export type ModelProviderUptimeBucket = {
	start: string;
	end: string;
	successPct: number | null;
};

export type ModelProviderPerformance = {
	provider: string;
	providerName: string;
	avgThroughput: number | null;
	avgLatencyMs: number | null;
	avgGenerationMs: number | null;
	requests: number;
	uptimePct: number | null;
	uptimeBuckets: ModelProviderUptimeBucket[];
};

export interface ModelPerformanceSummary {
	avgThroughput: number | null;
	avgLatencyMs: number | null;
	avgGenerationMs: number | null;
	uptimePct: number | null;
	totalRequests: number;
	successfulRequests: number;
}

export interface ModelPerformanceRange {
	start: string;
	end: string;
}

export interface ModelPerformanceMetrics {
	summary: ModelPerformanceSummary;
	prevSummary?: ModelPerformanceSummary | null;
	hourly: ModelPerformancePoint[];
	successSeries: ModelSuccessPoint[];
	timeOfDay: ModelTimeOfDayPoint[];
	providerPerformance: ModelProviderPerformance[];
	dataRange: ModelPerformanceRange;
	cumulativeTokens?: number | null;
	releaseDate?: string | null;
}

export async function getModelPerformanceMetrics(
	modelId: string,
	includeHidden: boolean,
	hours: number = HOURS_DEFAULT
): Promise<ModelPerformanceMetrics> {
	const t0 = Date.now();
	const client = createAdminClient();

	const { data: modelRow, error: modelError } = await client
		.from("data_models")
		.select("hidden")
		.eq("model_id", modelId)
		.maybeSingle();

	if (modelError) {
		throw new Error(modelError.message ?? "Failed to load model metadata");
	}
	if (!modelRow || (!includeHidden && modelRow.hidden)) {
		throw new Error("Model not found");
	}

	console.log(`[perf] querying model_id="${modelId}"`);

	const { data, error } = await client.rpc("get_model_performance_overview", {
		p_model_id: modelId,
	});

	const dur = Date.now() - t0;
	console.log(`[perf] rpc dur=${dur}ms error=${!!error}`);

	if (error) {
		throw new Error(error.message ?? "Failed to load model performance");
	}

	const payload = (data?.[0] ?? {}) as RpcModelPerformanceResponse;

	const last24 = payload.last_24h;
	const hourlyCnt = payload.hourly_24h?.length ?? 0;
	const providerCnt = payload.provider_uptime_24h?.length ?? 0;
	const reqs = Number(last24?.total_requests ?? 0);
	const success = Number(last24?.successful_requests ?? 0);

	console.log(`[perf] summary reqs=${reqs} success=${success} hourly=${hourlyCnt} providers=${providerCnt}`);

	const summary = mapSummary(last24);
	const prevSummary = mapSummary(payload.prev_24h);
	const hourly = (payload.hourly_24h ?? []).map(mapHourlyPoint);
	const successSeries = (payload.hourly_24h ?? []).map(mapSuccessPoint);
	const timeOfDay = (payload.time_of_day_5d ?? []).map(mapTimeOfDayPoint);
	const providerPerformance = (payload.provider_uptime_24h ?? []).map(
		mapProviderPerformance
	);
	const dataRange = mapDataRange(payload.hourly_24h);
	const cumulativeTokens = toNumber(payload.cumulative_tokens?.total_tokens);
	const releaseDate = payload.cumulative_tokens?.release_date ?? null;

	const mapDur = Date.now() - t0 - dur;
	console.log(`[perf] mapped hourlyReqs=[${hourly.map(h => h.requests).join(",")}]`);

	return {
		summary,
		prevSummary,
		hourly,
		successSeries,
		timeOfDay,
		providerPerformance,
		dataRange,
		cumulativeTokens,
		releaseDate,
	};
}

export async function getModelPerformanceMetricsCached(
	modelId: string,
	includeHidden: boolean,
	hours: number = HOURS_DEFAULT
): Promise<ModelPerformanceMetrics> {
	"use cache";

	cacheLife("days");
	cacheTag("data:gateway_requests");

	return getModelPerformanceMetrics(modelId, includeHidden, hours);
}

function toNumber(value: any): number | null {
	if (value === null || value === undefined) return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function mapSummary(value: any): ModelPerformanceSummary {
	return {
		avgThroughput: toNumber(value?.avg_throughput),
		avgLatencyMs: toNumber(value?.avg_latency_ms),
		avgGenerationMs: toNumber(value?.avg_generation_ms),
		uptimePct: toNumber(value?.uptime_pct),
		totalRequests: Number(value?.total_requests ?? 0),
		successfulRequests: Number(value?.successful_requests ?? 0),
	};
}

function mapHourlyPoint(value: any): ModelPerformancePoint {
	return {
		bucket: value?.bucket ?? "",
		avgThroughput: toNumber(value?.avg_throughput),
		avgLatencyMs: toNumber(value?.avg_latency_ms),
		avgGenerationMs: toNumber(value?.avg_generation_ms),
		requests: Number(value?.requests ?? 0),
		successPct: toNumber(value?.success_pct),
	};
}

function mapSuccessPoint(value: any): ModelSuccessPoint {
	return {
		bucket: value?.bucket ?? "",
		overallSuccessPct: toNumber(value?.success_pct),
		worstProviderSuccessPct: toNumber(value?.worst_provider_success_pct),
		requests: Number(value?.requests ?? 0),
	};
}

function mapTimeOfDayPoint(value: any): ModelTimeOfDayPoint {
	return {
		hour: Number(value?.hour ?? 0),
		avgThroughput: toNumber(value?.avg_throughput),
		avgLatencyMs: toNumber(value?.avg_latency_ms),
		avgGenerationMs: toNumber(value?.avg_generation_ms),
		sampleCount: Number(value?.sample_count ?? 0),
	};
}

function mapProviderPerformance(value: any): ModelProviderPerformance {
	const uptimeBuckets: ModelProviderUptimeBucket[] = (value?.uptime_buckets ?? []).map(
		(bucket: any) => ({
			start: bucket?.start ?? "",
			end: bucket?.end ?? "",
			successPct: toNumber(bucket?.success_pct),
		})
	);

	return {
		provider: value?.provider ?? "",
		providerName: value?.provider_name ?? value?.provider ?? "",
		avgThroughput: toNumber(value?.avg_throughput),
		avgLatencyMs: toNumber(value?.avg_latency_ms),
		avgGenerationMs: toNumber(value?.avg_generation_ms),
		requests: Number(value?.requests ?? 0),
		uptimePct: toNumber(value?.uptime_pct),
		uptimeBuckets,
	};
}

function mapDataRange(hourly: any[] | undefined): ModelPerformanceRange {
	if (!hourly || hourly.length === 0) {
		return { start: "", end: "" };
	}
	return {
		start: hourly[0]?.bucket ?? "",
		end: hourly[hourly.length - 1]?.bucket ?? "",
	};
}
