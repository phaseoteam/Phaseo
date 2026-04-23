import type { SupabaseClient } from "@supabase/supabase-js";
import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";

type ActiveProviderModelRow = {
	api_model_id: string | null;
	provider_id: string | null;
	effective_from?: string | null;
	effective_to?: string | null;
};

type GatewayMarketingRollupRow = {
	bucket_hour: string | null;
	requests: number | null;
	success_requests: number | null;
	total_tokens: number | null;
	latency_sum_ms: number | null;
	latency_samples: number | null;
};

type GatewayMarketingRequestRow = {
	created_at: string;
	success: boolean | null;
	usage: unknown;
	latency_ms: number | null;
};

export type GatewayTimeseriesPoint = {
	timestamp: string;
	requests: number;
	uptimePct: number | null;
	p50Ms: number | null;
	p95Ms: number | null;
	avgMs: number | null;
	requestsPerMin: number;
	tokensPerMin: number;
	hoursAgo: number;
};

export type GatewayMarketingMetrics = {
	summary: {
		uptimePct: number | null;
		latencyP95Ms: number | null;
		latencyP50Ms: number | null;
		latencyAvgMs: number | null;
		requests24h: number;
		successful24h: number;
		tokens24h: number;
		requestsPerMinAvg: number | null;
		supportedModels: number | null;
		supportedProviders: number | null;
	};
	timeseries: {
		uptime: GatewayTimeseriesPoint[];
		latency: GatewayTimeseriesPoint[];
		throughput: GatewayTimeseriesPoint[];
	};
	supported: {
		modelIds: string[];
		providerIds: string[];
	};
	fallback: boolean;
	error?: string;
};

const HOURS_DEFAULT = 24;

function coerceNumber(value: unknown, fallback = 0): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function coerceNullableNumber(value: unknown): number | null {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function percentile(values: number[], p: number): number | null {
	if (!values.length) return null;
	const sorted = values.slice().sort((a, b) => a - b);
	const rank = (sorted.length - 1) * p;
	const lower = Math.floor(rank);
	const upper = Math.ceil(rank);
	if (lower === upper) return sorted[lower];
	const weight = rank - lower;
	return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function average(values: number[]): number | null {
	if (!values.length) return null;
	return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function bucketStartISOHour(date: Date): string {
	const bucket = new Date(date);
	bucket.setUTCMinutes(0, 0, 0);
	return bucket.toISOString();
}

function normalizeBucketHour(value: string | null): string | null {
	const raw = String(value ?? "").trim();
	if (!raw) return null;

	const parsed = new Date(raw);
	if (Number.isFinite(parsed.getTime())) {
		return bucketStartISOHour(parsed);
	}

	return raw;
}

function toRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object") return null;
	return value as Record<string, unknown>;
}

function readUsageInt(usage: Record<string, unknown> | null, key: string): number {
	if (!usage) return 0;
	const raw = usage[key];
	const parsed = Number(raw);
	return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function getTotalTokensFromUsage(usageValue: unknown): number {
	const usage = toRecord(usageValue);
	const directTotal =
		readUsageInt(usage, "total_tokens") || readUsageInt(usage, "tokens");
	if (directTotal > 0) return directTotal;

	return (
		readUsageInt(usage, "input_tokens") +
		readUsageInt(usage, "output_tokens") +
		readUsageInt(usage, "prompt_tokens") +
		readUsageInt(usage, "completion_tokens")
	);
}

async function fetchActiveGatewayModels(
	client: SupabaseClient,
	now = new Date(),
): Promise<ActiveProviderModelRow[]> {
	const nowIso = now.toISOString();
	const effectiveClause = [
		"and(effective_from.is.null,effective_to.is.null)",
		`and(effective_from.is.null,effective_to.gt.${nowIso})`,
		`and(effective_from.lte.${nowIso},effective_to.is.null)`,
		`and(effective_from.lte.${nowIso},effective_to.gt.${nowIso})`,
	].join(",");

	const { data, error } = await client
		.from("data_api_provider_models")
		.select("api_model_id, provider_id, effective_from, effective_to")
		.eq("is_active_gateway", true)
		.or(effectiveClause);

	if (error) {
		throw new Error(error.message ?? "Failed to load supported models");
	}

	return (data ?? []) as ActiveProviderModelRow[];
}

async function fetchGatewayMarketingRollup(
	client: SupabaseClient,
	hours = HOURS_DEFAULT,
): Promise<GatewayMarketingRollupRow[]> {
	const fromIso = new Date(
		Date.now() - Math.max(1, Math.round(hours)) * 60 * 60 * 1000,
	).toISOString();
	const rows: GatewayMarketingRequestRow[] = [];
	const PAGE_SIZE = 5000;

	for (let offset = 0; ; offset += PAGE_SIZE) {
		const { data, error } = await client
			.from("gateway_requests")
			.select("created_at, success, usage, latency_ms")
			.gte("created_at", fromIso)
			.order("created_at", { ascending: true })
			.range(offset, offset + PAGE_SIZE - 1);

		if (error) {
			throw new Error(error.message ?? "Failed to load gateway marketing rows");
		}
		if (!Array.isArray(data) || data.length === 0) break;
		rows.push(...(data as GatewayMarketingRequestRow[]));
		if (data.length < PAGE_SIZE) break;
	}

	const byHour = new Map<string, GatewayMarketingRollupRow>();
	for (const row of rows) {
		const bucket = normalizeBucketHour(String(row?.created_at ?? ""));
		if (!bucket) continue;

		const current = byHour.get(bucket) ?? {
			bucket_hour: bucket,
			requests: 0,
			success_requests: 0,
			total_tokens: 0,
			latency_sum_ms: 0,
			latency_samples: 0,
		};

		current.requests = coerceNumber(current.requests, 0) + 1;
		if (row?.success) {
			current.success_requests = coerceNumber(current.success_requests, 0) + 1;
		}
		current.total_tokens =
			coerceNumber(current.total_tokens, 0) + getTotalTokensFromUsage(row?.usage);
		const latency = Number(row?.latency_ms ?? 0);
		if (Number.isFinite(latency) && latency > 0) {
			current.latency_sum_ms = coerceNumber(current.latency_sum_ms, 0) + latency;
			current.latency_samples = coerceNumber(current.latency_samples, 0) + 1;
		}
		byHour.set(bucket, current);
	}

	return Array.from(byHour.values()).sort((a, b) =>
		String(a.bucket_hour ?? "").localeCompare(String(b.bucket_hour ?? "")),
	);
}

function buildMetricsFromRollup(
	rollupRows: GatewayMarketingRollupRow[],
	supportedModels: ActiveProviderModelRow[],
	now = new Date(),
	hours = HOURS_DEFAULT,
): GatewayMarketingMetrics {
	const timelineHours =
		Number.isFinite(hours) && hours > 0 ? Math.round(hours) : HOURS_DEFAULT;

	const byHour = new Map<
		string,
		{
			requests: number;
			successRequests: number;
			totalTokens: number;
			latencySum: number;
			latencySamples: number;
		}
	>();

	for (const row of rollupRows) {
		const bucket = normalizeBucketHour(row.bucket_hour);
		if (!bucket) continue;
		byHour.set(bucket, {
			requests: coerceNumber(row.requests, 0),
			successRequests: coerceNumber(row.success_requests, 0),
			totalTokens: coerceNumber(row.total_tokens, 0),
			latencySum: coerceNumber(row.latency_sum_ms, 0),
			latencySamples: coerceNumber(row.latency_samples, 0),
		});
	}

	const uptimeSeries: GatewayTimeseriesPoint[] = [];
	const latencySeries: GatewayTimeseriesPoint[] = [];
	const throughputSeries: GatewayTimeseriesPoint[] = [];
	const hourlyLatencyAverages: number[] = [];

	let totalRequests = 0;
	let totalSuccessful = 0;
	let totalTokens = 0;
	let totalLatencySum = 0;
	let totalLatencySamples = 0;

	for (let h = timelineHours - 1; h >= 0; h--) {
		const ts = new Date(now.getTime() - h * 60 * 60 * 1000);
		const bucket = bucketStartISOHour(ts);
		const row = byHour.get(bucket) ?? {
			requests: 0,
			successRequests: 0,
			totalTokens: 0,
			latencySum: 0,
			latencySamples: 0,
		};

		totalRequests += row.requests;
		totalSuccessful += row.successRequests;
		totalTokens += row.totalTokens;
		totalLatencySum += row.latencySum;
		totalLatencySamples += row.latencySamples;

		const avgLatency =
			row.latencySamples > 0 ? row.latencySum / row.latencySamples : null;
		if (avgLatency != null) hourlyLatencyAverages.push(avgLatency);

		const point: GatewayTimeseriesPoint = {
			timestamp: bucket,
			requests: row.requests,
			uptimePct:
				row.requests > 0 ? (row.successRequests / row.requests) * 100 : null,
			p50Ms: avgLatency,
			p95Ms: avgLatency,
			avgMs: avgLatency,
			requestsPerMin: row.requests / 60,
			tokensPerMin: row.totalTokens / 60,
			hoursAgo: h,
		};

		uptimeSeries.push(point);
		latencySeries.push(point);
		throughputSeries.push(point);
	}

	const modelIds = new Set<string>();
	const providerIds = new Set<string>();
	for (const row of supportedModels) {
		if (row.api_model_id) modelIds.add(row.api_model_id);
		if (row.provider_id) providerIds.add(row.provider_id);
	}

	return {
		summary: {
			uptimePct:
				totalRequests > 0 ? (totalSuccessful / totalRequests) * 100 : null,
			latencyP95Ms: percentile(hourlyLatencyAverages, 0.95),
			latencyP50Ms: percentile(hourlyLatencyAverages, 0.5),
			latencyAvgMs:
				totalLatencySamples > 0 ? totalLatencySum / totalLatencySamples : null,
			requests24h: totalRequests,
			successful24h: totalSuccessful,
			tokens24h: totalTokens,
			requestsPerMinAvg:
				timelineHours > 0 ? totalRequests / (timelineHours * 60) : null,
			supportedModels: modelIds.size || null,
			supportedProviders: providerIds.size || null,
		},
		timeseries: {
			uptime: uptimeSeries,
			latency: latencySeries,
			throughput: throughputSeries,
		},
		supported: {
			modelIds: Array.from(modelIds),
			providerIds: Array.from(providerIds),
		},
		fallback: totalRequests <= 0,
	};
}

function buildFallbackMetrics(
	supportedModels: ActiveProviderModelRow[],
	now = new Date(),
	hours = HOURS_DEFAULT,
	error?: string,
): GatewayMarketingMetrics {
	const points: GatewayTimeseriesPoint[] = [];
	for (let h = hours - 1; h >= 0; h--) {
		const timestamp = bucketStartISOHour(new Date(now.getTime() - h * 60 * 60 * 1000));
		points.push({
			timestamp,
			requests: 0,
			uptimePct: 100,
			p50Ms: null,
			p95Ms: null,
			avgMs: null,
			requestsPerMin: 0,
			tokensPerMin: 0,
			hoursAgo: h,
		});
	}

	const modelIds = new Set<string>();
	const providerIds = new Set<string>();
	for (const row of supportedModels) {
		if (row.api_model_id) modelIds.add(row.api_model_id);
		if (row.provider_id) providerIds.add(row.provider_id);
	}

	return {
		summary: {
			uptimePct: 100,
			latencyP95Ms: null,
			latencyP50Ms: null,
			latencyAvgMs: null,
			requests24h: 0,
			successful24h: 0,
			tokens24h: 0,
			requestsPerMinAvg: null,
			supportedModels: modelIds.size || null,
			supportedProviders: providerIds.size || null,
		},
		timeseries: {
			uptime: points,
			latency: points,
			throughput: points,
		},
		supported: {
			modelIds: Array.from(modelIds),
			providerIds: Array.from(providerIds),
		},
		fallback: true,
		error,
	};
}

export async function getGatewayMarketingMetrics(
	hours = HOURS_DEFAULT,
): Promise<GatewayMarketingMetrics> {
	"use cache";

	const normalizedHours =
		Number.isFinite(hours) && hours > 0 ? Math.round(hours) : HOURS_DEFAULT;
	if (normalizedHours >= 24 * 30) {
		cacheLife("days");
	} else if (normalizedHours >= 24) {
		cacheLife("hours");
	} else {
		cacheLife("minutes");
	}

	cacheTag("gateway:marketing-metrics");
	cacheTag("data:gateway_usage_rollups");

	const now = new Date();
	const client = createAdminClient();

	let supportedRows: ActiveProviderModelRow[] = [];
	let supportedError: string | undefined;
	try {
		supportedRows = await fetchActiveGatewayModels(client, now);
	} catch (err: any) {
		supportedRows = [];
		supportedError = String(err?.message ?? err);
	}

	try {
		const rollupRows = await fetchGatewayMarketingRollup(client, normalizedHours);
		if (!rollupRows.length) {
			return buildFallbackMetrics(
				supportedRows,
				now,
				normalizedHours,
				supportedError ?? "No recent gateway traffic available.",
			);
		}

		const metrics = buildMetricsFromRollup(
			rollupRows,
			supportedRows,
			now,
			normalizedHours,
		);
		if (supportedError && !metrics.error) {
			return { ...metrics, error: supportedError };
		}
		return metrics;
	} catch (err: any) {
		const errorMessage =
			supportedError ??
			String(
				err?.message ??
					"Unable to load rollup gateway metrics; falling back to synthetic data.",
			);
		return buildFallbackMetrics(supportedRows, now, normalizedHours, errorMessage);
	}
}
