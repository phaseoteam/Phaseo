import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";

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
	uptimeHourly3h?: Array<{
		hourOffset: 0 | 1 | 2;
		uptimePct: number | null;
		requests?: number;
		successful?: number;
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
	avg_latency_ms: number | string | null;
	p50_latency_ms: number | string | null;
	p95_latency_ms: number | string | null;
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
	throughputSum30m: number;
	throughputSamples30m: number;
	inputTokens1h: number;
	outputTokens1h: number;
	latencySum3d: number;
	latencySamples3d: number;
	throughputSum3d: number;
	throughputSamples3d: number;
	cachedReadTokens1h: number;
	dayRequests: [number, number, number];
	daySuccessful: [number, number, number];
	dayHealthRequests: [number, number, number];
	dayHealthSuccessful: [number, number, number];
};

const PAGE_SIZE = 5000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function toNumber(value: unknown): number {
	const num = Number(value);
	return Number.isFinite(num) ? num : 0;
}

function toInt(value: unknown): number {
	const num = Number(value);
	return Number.isFinite(num) ? Math.max(0, Math.trunc(num)) : 0;
}

function toFiniteNumber(value: unknown): number | null {
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
		throughputSum30m: 0,
		throughputSamples30m: 0,
		inputTokens1h: 0,
		outputTokens1h: 0,
		latencySum3d: 0,
		latencySamples3d: 0,
		throughputSum3d: 0,
		throughputSamples3d: 0,
		cachedReadTokens1h: 0,
		dayRequests: [0, 0, 0],
		daySuccessful: [0, 0, 0],
		dayHealthRequests: [0, 0, 0],
		dayHealthSuccessful: [0, 0, 0],
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

async function fetchGatewayRequestStatsRows(args: {
	client: ReturnType<typeof createAdminClient>;
	modelIds: string[];
	providerIds: string[];
	fromIso: string;
	toIso: string;
}): Promise<GatewayRequestStatsRow[]> {
	const rows: GatewayRequestStatsRow[] = [];

	for (let offset = 0; ; offset += PAGE_SIZE) {
		const to = offset + PAGE_SIZE - 1;
		const { data, error } = await args.client
			.from("gateway_requests")
			.select(
				"provider, success, status_code, error_code, created_at, latency_ms, generation_ms, throughput, usage",
			)
			.in("model_id", args.modelIds)
			.in("provider", args.providerIds)
			.gte("created_at", args.fromIso)
			.lte("created_at", args.toIso)
			.order("created_at", { ascending: true })
			.range(offset, to);

		if (error) {
			throw new Error(error.message ?? "Failed to fetch model provider request stats");
		}
		if (!Array.isArray(data) || data.length === 0) break;
		rows.push(...(data as GatewayRequestStatsRow[]));
		if (data.length < PAGE_SIZE) break;
	}

	return rows;
}

function mapRpcRuntimeStatsRows(args: {
	rows: RpcProviderHealthMetricsRow[];
	providerIds: string[];
	now?: Date;
}): ProviderRuntimeStatsMap {
	const now = args.now ?? new Date();
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
		const uptimeDaily3d: ProviderRuntimeStats["uptimeDaily3d"] = [
			{ dayOffset: 0, uptimePct: null, requests: 0, successful: 0 },
			{ dayOffset: 1, uptimePct: null, requests: 0, successful: 0 },
			{ dayOffset: 2, uptimePct: null, requests: 0, successful: 0 },
		];

		if (row && Array.isArray(row.buckets)) {
			for (const bucket of row.buckets) {
				const bucketRecord = toRecord(bucket);
				const start = new Date(String(bucketRecord?.start ?? ""));
				const dayOffset = dayOffsetFromUtcMidnight(nowUtcMidnightMs, start);
				if (dayOffset == null) continue;
				uptimeDaily3d[dayOffset] = {
					dayOffset,
					uptimePct: toFiniteNumber(bucketRecord?.uptime_pct),
					requests: toInt(bucketRecord?.requests),
					successful: toInt(bucketRecord?.success_requests),
				};
			}
		}

		out[providerId] = {
			providerId,
			...(row?.provider_name ? { providerName: row.provider_name } : {}),
			latencyMs30m:
				toFiniteNumber(row?.avg_latency_ms_30m) ??
				toFiniteNumber(row?.avg_latency_ms),
			throughput30m:
				toFiniteNumber(row?.avg_throughput_30m) ??
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

async function fetchRuntimeStatsViaRpc(args: {
	client: ReturnType<typeof createAdminClient>;
	modelIds: string[];
	providerIds: string[];
}): Promise<ProviderRuntimeStatsMap | null> {
	const { data, error } = await args.client.rpc("get_model_provider_health_metrics", {
		p_model_ids: args.modelIds,
		p_provider_ids: args.providerIds,
		p_window_days: 3,
		p_bucket_hours: 24,
	});

	if (error) {
		const message = String(error.message ?? "");
		if (
			message.includes("get_model_provider_health_metrics") ||
			message.includes("Could not find the function") ||
			message.includes("does not exist")
		) {
			return null;
		}
		throw new Error(message || "Failed to fetch model provider health metrics");
	}

	return mapRpcRuntimeStatsRows({
		rows: (data ?? []) as RpcProviderHealthMetricsRow[],
		providerIds: args.providerIds,
	});
}

export async function getModelProviderRuntimeStats(args: {
	modelId: string;
	providerIds: string[];
	modelAliases: string[];
}): Promise<ProviderRuntimeStatsMap> {
	const providerIds = Array.from(new Set(args.providerIds.filter(Boolean))).sort((a, b) =>
		a.localeCompare(b),
	);
	const modelIds = Array.from(
		new Set([args.modelId, ...args.modelAliases].filter(Boolean)),
	).sort((a, b) => a.localeCompare(b));

	if (!providerIds.length || !modelIds.length) return {};

	const now = new Date();
	const nowMs = now.getTime();
	const windowStart3d = new Date(nowMs - THREE_DAYS_MS);
	const fromIso = windowStart3d.toISOString();
	const toIso = now.toISOString();
	const nowUtcMidnightMs = Date.UTC(
		now.getUTCFullYear(),
		now.getUTCMonth(),
		now.getUTCDate(),
	);

	const client = createAdminClient();
	try {
		const rpcStats = await fetchRuntimeStatsViaRpc({
			client,
			modelIds,
			providerIds,
		});
		if (rpcStats) return rpcStats;
	} catch (error) {
		console.warn("Failed to fetch model provider runtime stats via RPC", {
			modelId: args.modelId,
			error,
		});
	}

	let requestRows: GatewayRequestStatsRow[];
	try {
		requestRows = await fetchGatewayRequestStatsRows({
			client,
			modelIds,
			providerIds,
			fromIso,
			toIso,
		});
	} catch (error) {
		console.warn("Failed to fetch model provider runtime stats", {
			modelId: args.modelId,
			error,
		});
		return {};
	}

	const aggregateByProvider = new Map<string, Aggregate>();

	for (const row of requestRows) {
		const providerId = String(row?.provider ?? "").trim();
		if (!providerId) continue;
		const createdAt = new Date(String(row?.created_at ?? ""));
		if (!Number.isFinite(createdAt.getTime())) continue;
		const createdAtMs = createdAt.getTime();

		const aggregate = aggregateByProvider.get(providerId) ?? emptyAggregate();
		const latencyMs = toFiniteNumber(row.latency_ms);
		const explicitThroughput = toFiniteNumber(row.throughput);
		const generationMs = toFiniteNumber(row.generation_ms);
		const inputTokens = extractInputTokensFromUsage(row.usage) ?? 0;
		const outputTokens = extractOutputTokensFromUsage(row.usage) ?? 0;
		const cachedReadTokens = extractCachedReadTokensFromUsage(row.usage) ?? 0;
		const derivedThroughput =
			explicitThroughput != null && explicitThroughput > 0
				? explicitThroughput
				: generationMs != null &&
				  generationMs > 0 &&
				  outputTokens > 0
				? (outputTokens * 1000) / generationMs
				: null;
		const success = row.success === true ? 1 : 0;

		aggregate.requests3d += 1;
		aggregate.successful3d += success;

		if (latencyMs != null && latencyMs > 0) {
			aggregate.latencySum3d += latencyMs;
			aggregate.latencySamples3d += 1;
		}
		if (derivedThroughput != null && derivedThroughput > 0) {
			aggregate.throughputSum3d += derivedThroughput;
			aggregate.throughputSamples3d += 1;
		}

		const dayOffset = dayOffsetFromUtcMidnight(nowUtcMidnightMs, createdAt);
		if (dayOffset != null) {
			aggregate.dayRequests[dayOffset] += 1;
			aggregate.daySuccessful[dayOffset] += success;
		}

		if (createdAtMs >= nowMs - THIRTY_MINUTES_MS) {
			aggregate.requests30m += 1;
			if (latencyMs != null && latencyMs > 0) {
				aggregate.latencySum30m += latencyMs;
				aggregate.latencySamples30m += 1;
			}
			if (derivedThroughput != null && derivedThroughput > 0) {
				aggregate.throughputSum30m += derivedThroughput;
				aggregate.throughputSamples30m += 1;
			}
		}
		if (createdAtMs >= nowMs - ONE_HOUR_MS) {
			aggregate.inputTokens1h += inputTokens;
			aggregate.outputTokens1h += outputTokens;
			aggregate.cachedReadTokens1h += cachedReadTokens;
		}
		const healthImpact = classifyRequestHealthImpact(row);
		if (healthImpact !== "neutral") {
			aggregate.healthRequests3d += 1;
			if (healthImpact === "success") {
				aggregate.healthSuccessful3d += 1;
			}

			const dayOffset = dayOffsetFromUtcMidnight(nowUtcMidnightMs, createdAt);
			if (dayOffset != null) {
				aggregate.dayHealthRequests[dayOffset] += 1;
				if (healthImpact === "success") {
					aggregate.dayHealthSuccessful[dayOffset] += 1;
				}
			}
		}

		aggregateByProvider.set(providerId, aggregate);
	}

	const out: ProviderRuntimeStatsMap = {};

	for (const providerId of providerIds) {
		const aggregate = aggregateByProvider.get(providerId) ?? emptyAggregate();
		const latencyMs30m =
			average(aggregate.latencySum30m, aggregate.latencySamples30m) ??
			average(aggregate.latencySum3d, aggregate.latencySamples3d);
		const throughput30m =
			average(aggregate.throughputSum30m, aggregate.throughputSamples30m) ??
			average(aggregate.throughputSum3d, aggregate.throughputSamples3d);

		out[providerId] = {
			providerId,
			latencyMs30m,
			throughput30m,
			uptimePct3d:
				aggregate.healthRequests3d > 0
					? (aggregate.healthSuccessful3d / aggregate.healthRequests3d) * 100
					: null,
			inputTokens1h: aggregate.inputTokens1h,
			outputTokens1h: aggregate.outputTokens1h,
			cachedReadTokens1h: aggregate.cachedReadTokens1h,
			cacheTokenPct1h: normaliseCacheTokenPct(
				aggregate.cachedReadTokens1h,
				aggregate.inputTokens1h + aggregate.outputTokens1h,
			),
			uptimeDaily3d: [
				{
					dayOffset: 0,
					requests: aggregate.dayRequests[0],
					successful: aggregate.daySuccessful[0],
					uptimePct:
						aggregate.dayHealthRequests[0] > 0
							? (aggregate.dayHealthSuccessful[0] / aggregate.dayHealthRequests[0]) * 100
							: null,
				},
				{
					dayOffset: 1,
					requests: aggregate.dayRequests[1],
					successful: aggregate.daySuccessful[1],
					uptimePct:
						aggregate.dayHealthRequests[1] > 0
							? (aggregate.dayHealthSuccessful[1] / aggregate.dayHealthRequests[1]) * 100
							: null,
				},
				{
					dayOffset: 2,
					requests: aggregate.dayRequests[2],
					successful: aggregate.daySuccessful[2],
					uptimePct:
						aggregate.dayHealthRequests[2] > 0
							? (aggregate.dayHealthSuccessful[2] / aggregate.dayHealthRequests[2]) * 100
							: null,
				},
			],
			requests30m: aggregate.requests30m,
			requests3d: aggregate.requests3d,
			successful3d: aggregate.successful3d,
		};
	}

	return out;
}

export async function getModelProviderRuntimeStatsCached(args: {
	modelId: string;
	providerIds: string[];
	modelAliases: string[];
}): Promise<ProviderRuntimeStatsMap> {
	"use cache";

	cacheLife("hours");
	cacheTag("data:gateway_usage_rollups");
	cacheTag("data:gateway_requests");
	cacheTag(`data:gateway_usage_rollups:model:${args.modelId}`);

	return getModelProviderRuntimeStats(args);
}

export async function getModelProviderHealthMetrics(args: {
	modelId: string;
	providerIds: string[];
	modelAliases: string[];
	windowDays?: number;
	bucketHours?: number;
}): Promise<ProviderHealthMetricsMap> {
	const providerIds = Array.from(new Set(args.providerIds.filter(Boolean))).sort((a, b) =>
		a.localeCompare(b),
	);
	const modelIds = Array.from(
		new Set([args.modelId, ...args.modelAliases].filter(Boolean)),
	).sort((a, b) => a.localeCompare(b));

	if (!providerIds.length || !modelIds.length) return {};

	const client = createAdminClient();
	const { data, error } = await client.rpc("get_model_provider_health_metrics", {
		p_model_ids: modelIds,
		p_provider_ids: providerIds,
		p_window_days: Math.max(1, Math.min(90, Math.round(args.windowDays ?? 30))),
		p_bucket_hours: Math.max(1, Math.min(24 * 7, Math.round(args.bucketHours ?? 24))),
	});

	if (error) {
		console.warn("Failed to fetch model provider health metrics", {
			modelId: args.modelId,
			error,
		});
		return {};
	}

	return mapRpcHealthMetricsRows({
		rows: (data ?? []) as RpcProviderHealthMetricsRow[],
		providerIds,
	});
}

export async function getModelProviderHealthMetricsCached(args: {
	modelId: string;
	providerIds: string[];
	modelAliases: string[];
	windowDays?: number;
	bucketHours?: number;
}): Promise<ProviderHealthMetricsMap> {
	"use cache";

	cacheLife("hours");
	cacheTag("data:gateway_usage_rollups");
	cacheTag("data:gateway_requests");
	cacheTag(`data:gateway_usage_rollups:model:${args.modelId}`);
	cacheTag(`data:gateway_requests:model:${args.modelId}`);
	cacheTag(`model:health:${args.modelId}`);

	return getModelProviderHealthMetrics(args);
}
