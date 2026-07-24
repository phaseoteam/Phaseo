import { fetchPublicWebApi } from "@/lib/web-api/client";

export type ProviderRuntimeStats = {
	providerId: string;
	providerName?: string;
	latencyMs30m: number | null;
	throughput30m: number | null;
	uptimePct3d: number | null;
	requestSuccessPct3d?: number | null;
	inputTokens1h: number;
	outputTokens1h: number;
	cachedReadTokens1h: number;
	cacheTokenPct1h: number | null;
	uptimeDaily3d: Array<{
		dayOffset: 0 | 1 | 2;
		uptimePct: number | null;
		requests: number;
		successful: number;
	}>;
	uptimeHourly3h: Array<{
		hourOffset: 0 | 1 | 2;
		uptimePct: number | null;
		requests: number;
		successful: number;
	}>;
	requests30m: number;
	requests3d: number;
	successful3d: number;
	failed3d?: number;
	neutral3d?: number;
	rateLimited3d?: number;
	healthRequests3d?: number;
	healthSuccessful3d?: number;
	latencyP50Ms3d?: number | null;
	latencyP95Ms3d?: number | null;
	avgGenerationMs3d?: number | null;
	totalTokens3d?: number;
	finishReasonCounts3d?: Record<string, number>;
	errorCodeCounts3d?: Record<string, number>;
	lastRequestAt?: string | null;
};

export type ProviderRuntimeStatsMap = Record<string, ProviderRuntimeStats>;

export type ProviderHealthBucket = {
	start: string;
	end: string;
	requests: number;
	successRequests: number;
	healthRequests: number;
	healthSuccessRequests: number;
	uptimePct: number | null;
	requestSuccessPct: number | null;
	avgLatencyMs: number | null;
	avgThroughput: number | null;
};

export type ProviderHealthMetrics = {
	providerId: string;
	providerName: string;
	requests: number;
	successRequests: number;
	failedRequests: number;
	neutralRequests: number;
	rateLimitedRequests: number;
	healthRequests: number;
	healthSuccessRequests: number;
	uptimePct: number | null;
	requestSuccessPct: number | null;
	avgLatencyMs: number | null;
	p50LatencyMs: number | null;
	p95LatencyMs: number | null;
	avgGenerationMs: number | null;
	avgThroughput: number | null;
	totalTokens: number;
	inputTokens: number;
	outputTokens: number;
	finishReasonCounts: Record<string, number>;
	errorCodeCounts: Record<string, number>;
	buckets: ProviderHealthBucket[];
	lastRequestAt: string | null;
};

export type ProviderHealthMetricsMap = Record<string, ProviderHealthMetrics>;

type GatewayRequestStatsRow = {
	provider: string | null;
	success: boolean | null;
	status_code: number | null;
	error_code: string | null;
	created_at: string | null;
	latency_ms: number | null;
	generation_ms: number | null;
	throughput: number | null;
	usage: unknown;
};

type RpcProviderHealthMetricsRow = {
	provider_id: string | null;
	provider_name: string | null;
	requests: number | string | null;
	requests_30m: number | string | null;
	success_requests: number | string | null;
	failed_requests: number | string | null;
	neutral_requests: number | string | null;
	rate_limited_requests: number | string | null;
	health_requests: number | string | null;
	health_success_requests: number | string | null;
	uptime_pct: number | string | null;
	request_success_pct: number | string | null;
	avg_latency_ms_30m: number | string | null;
	avg_throughput_30m: number | string | null;
	p50_latency_ms_30m?: number | string | null;
	median_latency_ms_30m?: number | string | null;
	p50_throughput_30m?: number | string | null;
	median_throughput_30m?: number | string | null;
	percentile_latency_ms_30m?: number | string | null;
	percentile_throughput_30m?: number | string | null;
	avg_latency_ms: number | string | null;
	p50_latency_ms: number | string | null;
	p95_latency_ms: number | string | null;
	percentile_latency_ms?: number | string | null;
	percentile_throughput?: number | string | null;
	avg_generation_ms: number | string | null;
	avg_throughput: number | string | null;
	total_tokens: number | string | null;
	input_tokens_1h: number | string | null;
	output_tokens_1h: number | string | null;
	cached_read_tokens_1h: number | string | null;
	input_tokens: number | string | null;
	output_tokens: number | string | null;
	finish_reason_counts: Record<string, unknown> | null;
	error_code_counts: Record<string, unknown> | null;
	buckets: unknown;
	last_request_at: string | null;
};

type Aggregate = {
	requests30m: number;
	requests3d: number;
	successful3d: number;
	healthRequests3d: number;
	healthSuccessful3d: number;
	latencySum30m: number;
	latencySamples30m: number;
	latencyValues30m: number[];
	throughputSum30m: number;
	throughputSamples30m: number;
	throughputValues30m: number[];
	inputTokens1h: number;
	outputTokens1h: number;
	latencySum3d: number;
	latencySamples3d: number;
	latencyValues3d: number[];
	throughputSum3d: number;
	throughputSamples3d: number;
	throughputValues3d: number[];
	cachedReadTokens1h: number;
	dayRequests: [number, number, number];
	daySuccessful: [number, number, number];
	dayHealthRequests: [number, number, number];
	dayHealthSuccessful: [number, number, number];
	hourRequests: [number, number, number];
	hourSuccessful: [number, number, number];
	hourHealthRequests: [number, number, number];
	hourHealthSuccessful: [number, number, number];
};

const PAGE_SIZE = 5000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function toInt(value: unknown): number {
	const num = Number(value);
	return Number.isFinite(num) ? Math.max(0, Math.trunc(num)) : 0;
}

function toFiniteNumber(value: unknown): number | null {
	if (value === null || value === undefined || value === "") return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function toCountRecord(value: unknown): Record<string, number> {
	const record = toRecord(value);
	if (!record) return {};
	const out: Record<string, number> = {};
	for (const [key, raw] of Object.entries(record)) {
		const count = toInt(raw);
		if (!key || count <= 0) continue;
		out[key] = count;
	}
	return out;
}

function average(sum: number, samples: number): number | null {
	if (!Number.isFinite(sum) || !Number.isFinite(samples) || samples <= 0) return null;
	return sum / samples;
}

function median(values: number[]): number | null {
	const finite = values
		.filter((value) => Number.isFinite(value))
		.sort((a, b) => a - b);
	if (!finite.length) return null;
	const midpoint = Math.floor(finite.length / 2);
	if (finite.length % 2 === 1) return finite[midpoint] ?? null;
	const lower = finite[midpoint - 1];
	const upper = finite[midpoint];
	if (lower == null || upper == null) return null;
	return (lower + upper) / 2;
}

function toRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object") return null;
	return value as Record<string, unknown>;
}

function readNestedNumber(
	record: Record<string, unknown> | null,
	key: string,
): number | null {
	if (!record) return null;
	const value = record[key];
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function extractCachedReadTokensFromUsage(usage: unknown): number | null {
	const record = toRecord(usage);
	if (!record) return null;

	const explicitKeys = [
		"cached_read_text_tokens",
		"cached_read_image_tokens",
		"cached_read_audio_tokens",
		"cached_read_video_tokens",
		"cached_read_tokens",
	] as const;
	let explicitTotal = 0;
	let hasExplicit = false;
	for (const key of explicitKeys) {
		const value = readNestedNumber(record, key);
		if (value == null || value <= 0) continue;
		explicitTotal += value;
		hasExplicit = true;
	}
	if (hasExplicit) return explicitTotal;

	const inputDetails = toRecord(record.input_tokens_details);
	const promptDetails = toRecord(record.prompt_tokens_details);
	const nestedFallback =
		readNestedNumber(inputDetails, "cached_tokens") ??
		readNestedNumber(promptDetails, "cached_tokens") ??
		readNestedNumber(record, "cache_read_input_tokens");
	return nestedFallback != null && nestedFallback > 0 ? nestedFallback : null;
}

function extractInputTokensFromUsage(usage: unknown): number | null {
	const record = toRecord(usage);
	if (!record) return null;

	const keysInPriorityOrder = [
		"input_tokens",
		"prompt_tokens",
		"inputTokens",
		"promptTokens",
		"total_input_tokens",
		"totalInputTokens",
	] as const;

	for (const key of keysInPriorityOrder) {
		const value = toFiniteNumber(record[key]);
		if (value != null && value > 0) return value;
	}
	return null;
}

function extractOutputTokensFromUsage(usage: unknown): number | null {
	const record = toRecord(usage);
	if (!record) return null;

	const keysInPriorityOrder = [
		"output_tokens",
		"completion_tokens",
		"generated_tokens",
		"response_tokens",
		"outputTokens",
		"completionTokens",
		"total_output_tokens",
		"totalOutputTokens",
		"total_tokens",
		"totalTokens",
	] as const;

	for (const key of keysInPriorityOrder) {
		const value = toFiniteNumber(record[key]);
		if (value != null && value > 0) return value;
	}
	return null;
}

function normalizeHealthSignal(value: unknown): string {
	return String(value ?? "").trim().toLowerCase();
}

function isRateLimitSignal(value: unknown): boolean {
	const normalized = normalizeHealthSignal(value);
	if (!normalized) return false;
	return (
		normalized.includes("rate limit") ||
		normalized.includes("rate_limit") ||
		normalized.includes("too many requests") ||
		normalized.includes("ratelimit") ||
		normalized.includes("quota exceeded")
	);
}

function classifyRequestHealthImpact(row: GatewayRequestStatsRow):
	| "success"
	| "failure"
	| "neutral" {
	if (row.success === true) return "success";
	const status = Number(row.status_code ?? 0);
	if (status === 429) return "neutral";
	if (isRateLimitSignal(row.error_code)) return "neutral";
	return "failure";
}

function normaliseCacheTokenPct(numerator: number, denominator: number): number | null {
	if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
		return null;
	}
	const ratio = (numerator / denominator) * 100;
	if (!Number.isFinite(ratio)) return null;
	return Math.min(100, Math.max(0, ratio));
}

function emptyAggregate(): Aggregate {
	return {
		requests30m: 0,
		requests3d: 0,
		successful3d: 0,
		healthRequests3d: 0,
		healthSuccessful3d: 0,
		latencySum30m: 0,
		latencySamples30m: 0,
		latencyValues30m: [],
		throughputSum30m: 0,
		throughputSamples30m: 0,
		throughputValues30m: [],
		inputTokens1h: 0,
		outputTokens1h: 0,
		latencySum3d: 0,
		latencySamples3d: 0,
		latencyValues3d: [],
		throughputSum3d: 0,
		throughputSamples3d: 0,
		throughputValues3d: [],
		cachedReadTokens1h: 0,
		dayRequests: [0, 0, 0],
		daySuccessful: [0, 0, 0],
		dayHealthRequests: [0, 0, 0],
		dayHealthSuccessful: [0, 0, 0],
		hourRequests: [0, 0, 0],
		hourSuccessful: [0, 0, 0],
		hourHealthRequests: [0, 0, 0],
		hourHealthSuccessful: [0, 0, 0],
	};
}

function dayOffsetFromUtcMidnight(nowUtcMidnightMs: number, bucketDate: Date): 0 | 1 | 2 | null {
	const bucketUtcMidnightMs = Date.UTC(
		bucketDate.getUTCFullYear(),
		bucketDate.getUTCMonth(),
		bucketDate.getUTCDate(),
	);
	const offset = Math.floor((nowUtcMidnightMs - bucketUtcMidnightMs) / DAY_MS);
	if (offset < 0 || offset > 2) return null;
	return offset as 0 | 1 | 2;
}

function hourOffsetFromUtcHour(nowUtcHourMs: number, bucketDate: Date): 0 | 1 | 2 | null {
	const bucketUtcHourMs = Date.UTC(
		bucketDate.getUTCFullYear(),
		bucketDate.getUTCMonth(),
		bucketDate.getUTCDate(),
		bucketDate.getUTCHours(),
	);
	const offset = Math.floor((nowUtcHourMs - bucketUtcHourMs) / ONE_HOUR_MS);
	if (offset < 0 || offset > 2) return null;
	return offset as 0 | 1 | 2;
}

function mapRpcRuntimeStatsRows(args: {
	rows: RpcProviderHealthMetricsRow[];
	providerIds: string[];
	now?: Date;
}): ProviderRuntimeStatsMap {
	const now = args.now ?? new Date();
	const nowUtcHourMs = Date.UTC(
		now.getUTCFullYear(),
		now.getUTCMonth(),
		now.getUTCDate(),
		now.getUTCHours(),
	);
	const nowUtcMidnightMs = Date.UTC(
		now.getUTCFullYear(),
		now.getUTCMonth(),
		now.getUTCDate(),
	);
	const byProvider = new Map<string, RpcProviderHealthMetricsRow>();
	for (const row of args.rows) {
		const providerId = String(row.provider_id ?? "").trim();
		if (!providerId) continue;
		byProvider.set(providerId, row);
	}

	const out: ProviderRuntimeStatsMap = {};
	for (const providerId of args.providerIds) {
		const row = byProvider.get(providerId);
		const uptimeDaily3dTotals = [
			{ requests: 0, successful: 0, healthRequests: 0, healthSuccessful: 0 },
			{ requests: 0, successful: 0, healthRequests: 0, healthSuccessful: 0 },
			{ requests: 0, successful: 0, healthRequests: 0, healthSuccessful: 0 },
		];
		const uptimeDaily3d: ProviderRuntimeStats["uptimeDaily3d"] = [
			{ dayOffset: 0, uptimePct: null, requests: 0, successful: 0 },
			{ dayOffset: 1, uptimePct: null, requests: 0, successful: 0 },
			{ dayOffset: 2, uptimePct: null, requests: 0, successful: 0 },
		];
		const uptimeHourly3h: ProviderRuntimeStats["uptimeHourly3h"] = [
			{ hourOffset: 0, uptimePct: null, requests: 0, successful: 0 },
			{ hourOffset: 1, uptimePct: null, requests: 0, successful: 0 },
			{ hourOffset: 2, uptimePct: null, requests: 0, successful: 0 },
		];

		if (row && Array.isArray(row.buckets)) {
			for (const bucket of row.buckets) {
				const bucketRecord = toRecord(bucket);
				const start = new Date(String(bucketRecord?.start ?? ""));
				if (!Number.isFinite(start.getTime())) continue;
				const requests = toInt(bucketRecord?.requests);
				const successful = toInt(bucketRecord?.success_requests);
				const healthRequests = toInt(bucketRecord?.health_requests);
				const healthSuccessful = toInt(bucketRecord?.health_success_requests);
				const dayOffset = dayOffsetFromUtcMidnight(nowUtcMidnightMs, start);
				if (dayOffset != null) {
					uptimeDaily3dTotals[dayOffset]!.requests += requests;
					uptimeDaily3dTotals[dayOffset]!.successful += successful;
					uptimeDaily3dTotals[dayOffset]!.healthRequests += healthRequests;
					uptimeDaily3dTotals[dayOffset]!.healthSuccessful += healthSuccessful;
				}
				const hourOffset = hourOffsetFromUtcHour(nowUtcHourMs, start);
				if (hourOffset != null) {
					uptimeHourly3h[hourOffset] = {
						hourOffset,
						uptimePct:
							healthRequests > 0
								? (healthSuccessful / healthRequests) * 100
								: toFiniteNumber(bucketRecord?.uptime_pct),
						requests,
						successful,
					};
				}
			}
		}

		for (const dayOffset of [0, 1, 2] as const) {
			const bucket = uptimeDaily3dTotals[dayOffset];
			uptimeDaily3d[dayOffset] = {
				dayOffset,
				uptimePct:
					bucket.healthRequests > 0
						? (bucket.healthSuccessful / bucket.healthRequests) * 100
						: null,
				requests: bucket.requests,
				successful: bucket.successful,
			}
		}

		out[providerId] = {
			providerId,
			...(row?.provider_name ? { providerName: row.provider_name } : {}),
			latencyMs30m:
				toFiniteNumber(row?.percentile_latency_ms_30m) ??
				toFiniteNumber(row?.p50_latency_ms_30m) ??
				toFiniteNumber(row?.median_latency_ms_30m) ??
				toFiniteNumber(row?.avg_latency_ms_30m) ??
				toFiniteNumber(row?.percentile_latency_ms) ??
				toFiniteNumber(row?.avg_latency_ms),
			throughput30m:
				toFiniteNumber(row?.percentile_throughput_30m) ??
				toFiniteNumber(row?.p50_throughput_30m) ??
				toFiniteNumber(row?.median_throughput_30m) ??
				toFiniteNumber(row?.avg_throughput_30m) ??
				toFiniteNumber(row?.percentile_throughput) ??
				toFiniteNumber(row?.avg_throughput),
			uptimePct3d: toFiniteNumber(row?.uptime_pct),
			requestSuccessPct3d: toFiniteNumber(row?.request_success_pct),
			inputTokens1h: toInt(row?.input_tokens_1h),
			outputTokens1h: toInt(row?.output_tokens_1h),
			cachedReadTokens1h: toInt(row?.cached_read_tokens_1h),
			cacheTokenPct1h: normaliseCacheTokenPct(
				toInt(row?.cached_read_tokens_1h),
				toInt(row?.input_tokens_1h) + toInt(row?.output_tokens_1h),
			),
			uptimeDaily3d,
			uptimeHourly3h,
			requests30m: toInt(row?.requests_30m),
			requests3d: toInt(row?.requests),
			successful3d: toInt(row?.success_requests),
			failed3d: toInt(row?.failed_requests),
			neutral3d: toInt(row?.neutral_requests),
			rateLimited3d: toInt(row?.rate_limited_requests),
			healthRequests3d: toInt(row?.health_requests),
			healthSuccessful3d: toInt(row?.health_success_requests),
			latencyP50Ms3d: toFiniteNumber(row?.p50_latency_ms),
			latencyP95Ms3d: toFiniteNumber(row?.p95_latency_ms),
			avgGenerationMs3d: toFiniteNumber(row?.avg_generation_ms),
			totalTokens3d: toInt(row?.total_tokens),
			finishReasonCounts3d: toCountRecord(row?.finish_reason_counts),
			errorCodeCounts3d: toCountRecord(row?.error_code_counts),
			lastRequestAt: row?.last_request_at ?? null,
		};
	}

	return out;
}

function mapRpcHealthBucket(value: unknown): ProviderHealthBucket | null {
	const record = toRecord(value);
	if (!record) return null;
	const start = String(record.start ?? "");
	const end = String(record.end ?? "");
	if (!start || !end) return null;
	return {
		start,
		end,
		requests: toInt(record.requests),
		successRequests: toInt(record.success_requests),
		healthRequests: toInt(record.health_requests),
		healthSuccessRequests: toInt(record.health_success_requests),
		uptimePct: toFiniteNumber(record.uptime_pct),
		requestSuccessPct: toFiniteNumber(record.request_success_pct),
		avgLatencyMs: toFiniteNumber(record.avg_latency_ms),
		avgThroughput: toFiniteNumber(record.avg_throughput),
	};
}

function mapRpcHealthMetricsRows(args: {
	rows: RpcProviderHealthMetricsRow[];
	providerIds: string[];
}): ProviderHealthMetricsMap {
	const byProvider = new Map<string, RpcProviderHealthMetricsRow>();
	for (const row of args.rows) {
		const providerId = String(row.provider_id ?? "").trim();
		if (!providerId) continue;
		byProvider.set(providerId, row);
	}

	const out: ProviderHealthMetricsMap = {};
	for (const providerId of args.providerIds) {
		const row = byProvider.get(providerId);
		const buckets = Array.isArray(row?.buckets)
			? row.buckets
					.map(mapRpcHealthBucket)
					.filter((bucket): bucket is ProviderHealthBucket => bucket !== null)
			: [];

		out[providerId] = {
			providerId,
			providerName: row?.provider_name ?? providerId,
			requests: toInt(row?.requests),
			successRequests: toInt(row?.success_requests),
			failedRequests: toInt(row?.failed_requests),
			neutralRequests: toInt(row?.neutral_requests),
			rateLimitedRequests: toInt(row?.rate_limited_requests),
			healthRequests: toInt(row?.health_requests),
			healthSuccessRequests: toInt(row?.health_success_requests),
			uptimePct: toFiniteNumber(row?.uptime_pct),
			requestSuccessPct: toFiniteNumber(row?.request_success_pct),
			avgLatencyMs: toFiniteNumber(row?.avg_latency_ms),
			p50LatencyMs: toFiniteNumber(row?.p50_latency_ms),
			p95LatencyMs: toFiniteNumber(row?.p95_latency_ms),
			avgGenerationMs: toFiniteNumber(row?.avg_generation_ms),
			avgThroughput: toFiniteNumber(row?.avg_throughput),
			totalTokens: toInt(row?.total_tokens),
			inputTokens: toInt(row?.input_tokens),
			outputTokens: toInt(row?.output_tokens),
			finishReasonCounts: toCountRecord(row?.finish_reason_counts),
			errorCodeCounts: toCountRecord(row?.error_code_counts),
			buckets,
			lastRequestAt: row?.last_request_at ?? null,
		};
	}

	return out;
}

export async function getModelProviderRuntimeStats(args: {
	modelId: string;
	providerIds: string[];
	modelAliases: string[];
	percentile?: number;
}): Promise<ProviderRuntimeStatsMap> {
	const providerIds = [...new Set(args.providerIds.filter(Boolean))].sort();
	if (!providerIds.length) return {};
	const query = new URLSearchParams({
		provider_ids: providerIds.join(","),
		model_aliases: [...new Set(args.modelAliases.filter(Boolean))].sort().join(","),
		window_days: "3",
		bucket_hours: "1",
		percentile: String(args.percentile ?? 50),
	});
	const payload = await fetchPublicWebApi<{ rows: RpcProviderHealthMetricsRow[] }>(
		`/api/_web/models/${encodeURIComponent(args.modelId)}/provider-health?${query.toString()}`,
	);
	return mapRpcRuntimeStatsRows({ rows: payload.rows, providerIds });
}

export async function getModelProviderRuntimeStatsCached(args: {
	modelId: string;
	providerIds: string[];
	modelAliases: string[];
	percentile?: number;
}): Promise<ProviderRuntimeStatsMap> {
	return getModelProviderRuntimeStats(args);
}

export async function getModelProviderHealthMetrics(args: {
	modelId: string;
	providerIds: string[];
	modelAliases: string[];
	windowDays?: number;
	bucketHours?: number;
	percentile?: number;
}): Promise<ProviderHealthMetricsMap> {
	const providerIds = [...new Set(args.providerIds.filter(Boolean))].sort();
	if (!providerIds.length) return {};
	const query = new URLSearchParams({
		provider_ids: providerIds.join(","),
		model_aliases: [...new Set(args.modelAliases.filter(Boolean))].sort().join(","),
		window_days: String(args.windowDays ?? 30),
		bucket_hours: String(args.bucketHours ?? 24),
		percentile: String(args.percentile ?? 50),
	});
	const payload = await fetchPublicWebApi<{ rows: RpcProviderHealthMetricsRow[] }>(
		`/api/_web/models/${encodeURIComponent(args.modelId)}/provider-health?${query.toString()}`,
	);
	return mapRpcHealthMetricsRows({ rows: payload.rows, providerIds });
}

export async function getModelProviderHealthMetricsCached(args: {
	modelId: string;
	providerIds: string[];
	modelAliases: string[];
	windowDays?: number;
	bucketHours?: number;
}): Promise<ProviderHealthMetricsMap> {
	return getModelProviderHealthMetrics(args);
}
