import { createAdminClient } from "@/utils/supabase/admin";
import { cacheLife, cacheTag } from "next/cache";

const HOURS_DEFAULT = 24 * 7;
const SUCCESS_WINDOW_HOURS = 24;
const SUCCESS_BUCKET_MINUTES = 15;
const PROVIDER_WINDOW_HOURS = 24;
const PROVIDER_UPTIME_BUCKET_HOURS = 6;
const PAGE_SIZE = 5000;

type RpcModelPerformanceResponse = {
	last_24h?: any;
	prev_24h?: any;
	hourly_24h?: any[];
	provider_uptime_24h?: any[];
	hourly_5d?: any[];
	time_of_day_5d?: any[];
	cumulative_tokens?: any;
};

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
	provider_attempts?: unknown;
};

type GatewayProviderAttemptStatsRow = {
	provider: string | null;
	success: boolean | null;
	status_code: number | null;
	error_code: string | null;
};

type AggregateMetrics = {
	totalRequests: number;
	successfulRequests: number;
	healthRequests: number;
	healthSuccessfulRequests: number;
	latencySum: number;
	latencySamples: number;
	generationSum: number;
	generationSamples: number;
	throughputSum: number;
	throughputSamples: number;
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
	providerCount?: number;
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
	providerColor?: string | null;
	avgThroughput: number | null;
	avgLatencyMs: number | null;
	avgGenerationMs: number | null;
	requests: number;
	uptimePct: number | null;
	uptimeBuckets: ModelProviderUptimeBucket[];
};

export type ModelProviderDailyPoint = {
	day: string;
	provider: string;
	providerName: string;
	providerColor: string | null;
	avgThroughput: number | null;
	avgLatencyMs: number | null;
	avgGenerationMs: number | null;
	requests: number;
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
	providerDaily7d: ModelProviderDailyPoint[];
	dataRange: ModelPerformanceRange;
	cumulativeTokens?: number | null;
	releaseDate?: string | null;
}

export interface ModelPerformanceActivitySnapshot {
	summary: ModelPerformanceSummary;
	providerPerformance: ModelProviderPerformance[];
	cumulativeTokens?: number | null;
}

async function fetchPerformanceOverviewPayload(client: any, modelId: string) {
	const { data, error } = await client.rpc("get_model_performance_overview", {
		p_model_id: modelId,
	});

	if (error) {
		throw new Error(error.message ?? "Failed to load model performance");
	}

	return (data?.[0] ?? {}) as RpcModelPerformanceResponse;
}

export async function getModelPerformanceMetrics(
	modelId: string,
	includeHidden: boolean,
	hours: number = HOURS_DEFAULT
): Promise<ModelPerformanceMetrics> {
	const t0 = Date.now();
	const client = createAdminClient();
	void includeHidden;

	console.log(`[perf] querying model_id="${modelId}"`);

	const payload = await fetchPerformanceOverviewPayload(client, modelId);
	const dur = Date.now() - t0;
	console.log(`[perf] rpc dur=${dur}ms error=false`);

	const last24 = payload.last_24h;
	const hourlyCnt = payload.hourly_24h?.length ?? 0;
	const providerCnt = payload.provider_uptime_24h?.length ?? 0;
	const reqs = Number(last24?.total_requests ?? 0);
	const success = Number(last24?.successful_requests ?? 0);

	console.log(`[perf] summary reqs=${reqs} success=${success} hourly=${hourlyCnt} providers=${providerCnt}`);

	const summary = mapSummary(last24);
	const aliasBackfill = await getAliasBackfilledPerformance({
		client,
		modelId,
		windowHours: hours,
	});
	const useAliasBackfill =
		aliasBackfill != null &&
		aliasBackfill.summary.totalRequests > summary.totalRequests &&
		aliasBackfill.summary.totalRequests > 0;
	const prevSummary = useAliasBackfill
		? aliasBackfill.prevSummary
		: mapSummary(payload.prev_24h);
	const hourly = useAliasBackfill
		? aliasBackfill.hourly
		: (payload.hourly_24h ?? []).map(mapHourlyPoint);
	const providerPerformance = useAliasBackfill
		? aliasBackfill.providerPerformance
		: (payload.provider_uptime_24h ?? []).map(mapProviderPerformance);
	const providerTelemetryCount = providerPerformance.filter(
		(provider) => provider.requests > 0 && provider.uptimePct != null,
	).length;
	const attemptBackfilledSuccessSeries = useAliasBackfill
		? null
		: await getAttemptBackfilledSuccessSeries({
				client,
				modelId,
				windowHours: SUCCESS_WINDOW_HOURS,
			});
	const successSeries = useAliasBackfill
		? aliasBackfill.successSeries
		: (attemptBackfilledSuccessSeries ??
			(payload.hourly_24h ?? []).map((point) =>
					mapSuccessPoint(point, providerTelemetryCount),
				));
	const timeOfDay = (payload.time_of_day_5d ?? []).map(mapTimeOfDayPoint);
	const effectiveSummary = useAliasBackfill ? aliasBackfill.summary : summary;
	const preferredProviders = providerPerformance
		.map((provider) => provider.provider)
		.filter((provider): provider is string => Boolean(provider))
		.slice(0, 3);
	const providerDaily7d = await getProviderDailySeries7d(
		client,
		modelId,
		preferredProviders,
	);
	const dataRange = useAliasBackfill ? mapDataRange(hourly) : mapDataRange(payload.hourly_24h);
	const cumulativeTokens = toNumber(payload.cumulative_tokens?.total_tokens);
	const releaseDate = payload.cumulative_tokens?.release_date ?? null;

	const mapDur = Date.now() - t0 - dur;
	console.log(`[perf] mapped hourlyReqs=[${hourly.map(h => h.requests).join(",")}]`);
	void hours;
	void mapDur;

	return {
		summary: effectiveSummary,
		prevSummary,
		hourly,
		successSeries,
		timeOfDay,
		providerPerformance,
		providerDaily7d,
		dataRange,
		cumulativeTokens,
		releaseDate,
	};
}

export async function getModelPerformanceActivitySnapshot(
	modelId: string,
	includeHidden: boolean,
): Promise<ModelPerformanceActivitySnapshot> {
	const client = createAdminClient();
	void includeHidden;

	const payload = await fetchPerformanceOverviewPayload(client, modelId);
	const summary = mapSummary(payload.last_24h);
	const aliasBackfill = await getAliasBackfilledPerformance({
		client,
		modelId,
		windowHours: SUCCESS_WINDOW_HOURS,
	});
	const useAliasBackfill =
		aliasBackfill != null &&
		aliasBackfill.summary.totalRequests > summary.totalRequests &&
		aliasBackfill.summary.totalRequests > 0;
	const providerPerformance = useAliasBackfill
		? aliasBackfill.providerPerformance
		: (payload.provider_uptime_24h ?? []).map(mapProviderPerformance);

	return {
		summary: useAliasBackfill ? aliasBackfill.summary : summary,
		providerPerformance,
		cumulativeTokens: toNumber(payload.cumulative_tokens?.total_tokens),
	};
}

export async function getModelPerformanceMetricsCached(
	modelId: string,
	includeHidden: boolean,
	hours: number = HOURS_DEFAULT
): Promise<ModelPerformanceMetrics> {
	"use cache";

	cacheLife({
		stale: 60 * 60,
		revalidate: 60 * 60 * 6,
		expire: 60 * 60 * 24,
	});
	cacheTag("data:gateway_usage_rollups");
	cacheTag("data:gateway_requests");
	cacheTag(`data:gateway_usage_rollups:model:${modelId}`);
	cacheTag(`data:gateway_requests:model:${modelId}`);
	cacheTag(`model:performance:${modelId}`);

	return getModelPerformanceMetrics(modelId, includeHidden, hours);
}

export async function getModelPerformanceActivitySnapshotCached(
	modelId: string,
	includeHidden: boolean,
): Promise<ModelPerformanceActivitySnapshot> {
	"use cache";

	cacheLife({
		stale: 60 * 15,
		revalidate: 60 * 60,
		expire: 60 * 60 * 6,
	});
	cacheTag("data:gateway_usage_rollups");
	cacheTag("data:gateway_requests");
	cacheTag(`data:gateway_usage_rollups:model:${modelId}`);
	cacheTag(`data:gateway_requests:model:${modelId}`);
	cacheTag(`model:performance:${modelId}`);

	return getModelPerformanceActivitySnapshot(modelId, includeHidden);
}

function toNumber(value: any): number | null {
	if (value === null || value === undefined) return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function toFiniteNumber(value: unknown): number | null {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
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
	const parsed = Number(record[key]);
	return Number.isFinite(parsed) ? parsed : null;
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
	if (Number(row.status_code ?? 0) === 429) return "neutral";
	if (isRateLimitSignal(row.error_code)) return "neutral";
	return "failure";
}

function classifyAttemptHealthImpact(
	row: GatewayProviderAttemptStatsRow,
): "success" | "failure" | "neutral" {
	const statusCode = Number(row.status_code ?? 0);
	if (row.success === true) return "success";
	if (statusCode >= 200 && statusCode < 300) return "success";
	if (statusCode === 429) return "neutral";
	if (isRateLimitSignal(row.error_code)) return "neutral";

	const normalizedError = normalizeHealthSignal(row.error_code);
	if (
		normalizedError.includes("abort") ||
		normalizedError.includes("cancel") ||
		normalizedError.includes("client_closed")
	) {
		return "neutral";
	}

	return "failure";
}

function normalizeProviderAttemptRecord(
	value: unknown,
): GatewayProviderAttemptStatsRow | null {
	const record = toRecord(value);
	if (!record) return null;

	const provider = String(record.provider ?? "").trim();
	if (!provider) return null;

	const status = toFiniteNumber(record.status ?? record.status_code);
	const outcome = normalizeHealthSignal(record.outcome ?? record.type ?? record.reason);
	const success =
		outcome === "success" ||
		(status != null && status >= 200 && status < 300);
	const errorCode =
		[
			record.upstream_error_code,
			record.error_code,
			record.outcome,
			record.type,
			record.reason,
			record.status_text,
			record.upstream_error_message,
			record.upstream_error_description,
		]
			.map((candidate) => String(candidate ?? "").trim())
			.find(Boolean) ?? null;

	return {
		provider,
		success,
		status_code: status != null ? Math.trunc(status) : null,
		error_code: errorCode,
	};
}

function getProviderAttemptRows(
	row: GatewayRequestStatsRow,
): GatewayProviderAttemptStatsRow[] {
	const attempts = Array.isArray(row.provider_attempts)
		? row.provider_attempts
				.map(normalizeProviderAttemptRecord)
				.filter((attempt): attempt is GatewayProviderAttemptStatsRow => attempt != null)
		: [];

	if (attempts.length > 0) return attempts;

	const provider = String(row.provider ?? "").trim();
	if (!provider) return [];

	return [
		{
			provider,
			success: row.success,
			status_code: row.status_code,
			error_code: row.error_code,
		},
	];
}

function accumulateAttemptHealth(
	target: AggregateMetrics,
	attempt: GatewayProviderAttemptStatsRow,
) {
	target.totalRequests += 1;
	if (attempt.success === true) {
		target.successfulRequests += 1;
	}

	const healthImpact = classifyAttemptHealthImpact(attempt);
	if (healthImpact !== "neutral") {
		target.healthRequests += 1;
		if (healthImpact === "success") {
			target.healthSuccessfulRequests += 1;
		}
	}
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

function mapSuccessPoint(value: any, providerCount = 0): ModelSuccessPoint {
	return {
		bucket: value?.bucket ?? "",
		overallSuccessPct: toNumber(value?.success_pct),
		worstProviderSuccessPct:
			providerCount > 1 ? toNumber(value?.worst_provider_success_pct) : null,
		providerCount,
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
		providerColor: null,
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

function toUtcBucketKey(input: Date | string, bucketMinutes: number): string {
	const date = typeof input === "string" ? new Date(input) : input;
	if (!Number.isFinite(date.getTime())) return "";
	const clampedMinutes = Math.max(1, bucketMinutes);
	const bucketMinute = Math.floor(date.getUTCMinutes() / clampedMinutes) * clampedMinutes;
	return new Date(
		Date.UTC(
			date.getUTCFullYear(),
			date.getUTCMonth(),
			date.getUTCDate(),
			date.getUTCHours(),
			bucketMinute,
		),
	)
		.toISOString()
		.replace(".000Z", "");
}

function buildUtcBucketSeries(args: {
	start: Date;
	end: Date;
	bucketMinutes: number;
}): string[] {
	const bucketMs = Math.max(1, args.bucketMinutes) * 60 * 1000;
	const startBucket = toUtcBucketKey(args.start, args.bucketMinutes);
	const endBucket = toUtcBucketKey(args.end, args.bucketMinutes);
	const startMs = new Date(startBucket).getTime();
	const endMs = new Date(endBucket).getTime();
	if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) {
		return [];
	}

	const buckets: string[] = [];
	for (let cursor = startMs; cursor <= endMs; cursor += bucketMs) {
		buckets.push(new Date(cursor).toISOString().replace(".000Z", ""));
	}
	return buckets;
}

function emptyAggregateMetrics(): AggregateMetrics {
	return {
		totalRequests: 0,
		successfulRequests: 0,
		healthRequests: 0,
		healthSuccessfulRequests: 0,
		latencySum: 0,
		latencySamples: 0,
		generationSum: 0,
		generationSamples: 0,
		throughputSum: 0,
		throughputSamples: 0,
	};
}

function getDerivedThroughput(row: GatewayRequestStatsRow): number | null {
	const explicitThroughput = toFiniteNumber(row.throughput);
	if (explicitThroughput != null && explicitThroughput > 0) return explicitThroughput;

	const generationMs = toFiniteNumber(row.generation_ms);
	const outputTokens = extractOutputTokensFromUsage(row.usage) ?? 0;
	if (generationMs != null && generationMs > 0 && outputTokens > 0) {
		return (outputTokens * 1000) / generationMs;
	}

	return null;
}

function accumulateMetrics(target: AggregateMetrics, row: GatewayRequestStatsRow) {
	target.totalRequests += 1;
	if (row.success === true) {
		target.successfulRequests += 1;
	}

	const healthImpact = classifyRequestHealthImpact(row);
	if (healthImpact !== "neutral") {
		target.healthRequests += 1;
		if (healthImpact === "success") {
			target.healthSuccessfulRequests += 1;
		}
	}

	if (row.success !== true) return;

	const latencyMs = toFiniteNumber(row.latency_ms);
	if (latencyMs != null && latencyMs > 0) {
		target.latencySum += latencyMs;
		target.latencySamples += 1;
	}

	const generationMs = toFiniteNumber(row.generation_ms);
	if (generationMs != null && generationMs > 0) {
		target.generationSum += generationMs;
		target.generationSamples += 1;
	}

	const throughput = getDerivedThroughput(row);
	if (throughput != null && throughput > 0) {
		target.throughputSum += throughput;
		target.throughputSamples += 1;
	}
}

function aggregateToSummary(aggregate: AggregateMetrics): ModelPerformanceSummary {
	return {
		avgThroughput:
			aggregate.throughputSamples > 0
				? aggregate.throughputSum / aggregate.throughputSamples
				: null,
		avgLatencyMs:
			aggregate.latencySamples > 0 ? aggregate.latencySum / aggregate.latencySamples : null,
		avgGenerationMs:
			aggregate.generationSamples > 0
				? aggregate.generationSum / aggregate.generationSamples
				: null,
		uptimePct:
			aggregate.healthRequests > 0
				? (aggregate.healthSuccessfulRequests / aggregate.healthRequests) * 100
				: null,
		totalRequests: aggregate.totalRequests,
		successfulRequests: aggregate.successfulRequests,
	};
}

function toUtcDayKey(input: Date | string): string {
	const date = typeof input === "string" ? new Date(input) : input;
	if (!Number.isFinite(date.getTime())) return "";
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	const day = String(date.getUTCDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function buildLast7DayKeysUtc(now = new Date()): string[] {
	const keys: string[] = [];
	const cursor = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
	);
	for (let i = 6; i >= 0; i -= 1) {
		const day = new Date(cursor);
		day.setUTCDate(cursor.getUTCDate() - i);
		keys.push(toUtcDayKey(day));
	}
	return keys;
}

async function getModelAliases(client: any, modelId: string): Promise<string[]> {
	const aliases = new Set<string>([modelId]);

	const [byModelId, byApiModelId] = await Promise.all([
		client
			.from("data_api_provider_models")
			.select("model_id, api_model_id")
			.eq("model_id", modelId),
		client
			.from("data_api_provider_models")
			.select("model_id, api_model_id")
			.eq("api_model_id", modelId),
	]);

	const queries = [byModelId, byApiModelId];
	for (const query of queries) {
		if (query.error) {
			console.warn("[perf] failed to load model aliases", {
				modelId,
				error: query.error,
			});
			continue;
		}
		for (const row of query.data ?? []) {
			const modelKey = String(row?.model_id ?? "").trim();
			const apiModelKey = String(row?.api_model_id ?? "").trim();
			if (modelKey) aliases.add(modelKey);
			if (apiModelKey) aliases.add(apiModelKey);
		}
	}

	return Array.from(aliases);
}

async function fetchGatewayRequestStatsRows(args: {
	client: ReturnType<typeof createAdminClient>;
	modelIds: string[];
	fromIso: string;
	toIso: string;
	providerIds?: string[];
}): Promise<GatewayRequestStatsRow[]> {
	const rows: GatewayRequestStatsRow[] = [];

	for (let offset = 0; ; offset += PAGE_SIZE) {
		const to = offset + PAGE_SIZE - 1;
		let query = args.client
			.from("gateway_requests")
			.select(
				"provider, success, status_code, error_code, created_at, latency_ms, generation_ms, throughput, usage, provider_attempts",
			)
			.in("model_id", args.modelIds)
			.gte("created_at", args.fromIso)
			.lte("created_at", args.toIso)
			.order("created_at", { ascending: true })
			.range(offset, to);

		if (args.providerIds && args.providerIds.length > 0) {
			query = query.in("provider", args.providerIds);
		}

		const { data, error } = await query;
		if (error) {
			throw new Error(error.message ?? "Failed to fetch model performance request stats");
		}
		if (!Array.isArray(data) || data.length === 0) break;
		rows.push(...(data as GatewayRequestStatsRow[]));
		if (data.length < PAGE_SIZE) break;
	}

	return rows;
}

function buildSuccessSeriesFromRequestRows(args: {
	rows: GatewayRequestStatsRow[];
	start: Date;
	end: Date;
	bucketMinutes: number;
}): ModelSuccessPoint[] {
	const hourlyAggregates = new Map<string, AggregateMetrics>();
	const hourlyProviderAggregates = new Map<string, Map<string, AggregateMetrics>>();

	for (const row of args.rows) {
		const createdAt = new Date(String(row.created_at ?? ""));
		if (!Number.isFinite(createdAt.getTime())) continue;

		const bucket = toUtcBucketKey(createdAt, args.bucketMinutes);
		if (!bucket) continue;

		const hourlyAggregate = hourlyAggregates.get(bucket) ?? emptyAggregateMetrics();
		accumulateMetrics(hourlyAggregate, row);
		hourlyAggregates.set(bucket, hourlyAggregate);

		for (const attempt of getProviderAttemptRows(row)) {
			const providerId = String(attempt.provider ?? "").trim();
			if (!providerId) continue;

			const byProvider =
				hourlyProviderAggregates.get(bucket) ?? new Map<string, AggregateMetrics>();
			const providerAggregate =
				byProvider.get(providerId) ?? emptyAggregateMetrics();
			accumulateAttemptHealth(providerAggregate, attempt);
			byProvider.set(providerId, providerAggregate);
			hourlyProviderAggregates.set(bucket, byProvider);
		}
	}

	return buildUtcBucketSeries({
		start: args.start,
		end: args.end,
		bucketMinutes: args.bucketMinutes,
	}).map((bucket) => {
		const aggregate = hourlyAggregates.get(bucket) ?? emptyAggregateMetrics();
		const providerMetrics = hourlyProviderAggregates.get(bucket);
		const providerUptimes = providerMetrics
			? Array.from(providerMetrics.values())
					.map((value) =>
						value.healthRequests > 0
							? (value.healthSuccessfulRequests / value.healthRequests) * 100
							: null,
					)
					.filter((value): value is number => value != null)
			: [];
		const providerCount = providerUptimes.length;

		return {
			bucket,
			overallSuccessPct:
				aggregate.healthRequests > 0
					? (aggregate.healthSuccessfulRequests / aggregate.healthRequests) * 100
					: null,
			worstProviderSuccessPct:
				providerCount > 1 ? Math.min(...providerUptimes) : null,
			providerCount,
			requests: aggregate.totalRequests,
		};
	});
}

async function getAttemptBackfilledSuccessSeries(args: {
	client: ReturnType<typeof createAdminClient>;
	modelId: string;
	windowHours: number;
}): Promise<ModelSuccessPoint[] | null> {
	const aliases = await getModelAliases(args.client, args.modelId);
	const effectiveWindowHours = Math.max(1, Math.min(24 * 30, Math.round(args.windowHours)));
	const now = new Date();
	const start = new Date(now.getTime() - effectiveWindowHours * 60 * 60 * 1000);
	const rows = await fetchGatewayRequestStatsRows({
		client: args.client,
		modelIds: aliases,
		fromIso: start.toISOString(),
		toIso: now.toISOString(),
	});

	if (!rows.length) return null;

	return buildSuccessSeriesFromRequestRows({
		rows,
		start,
		end: now,
		bucketMinutes: SUCCESS_BUCKET_MINUTES,
	});
}

async function getAliasBackfilledPerformance(args: {
	client: ReturnType<typeof createAdminClient>;
	modelId: string;
	windowHours: number;
}): Promise<{
	summary: ModelPerformanceSummary;
	prevSummary: ModelPerformanceSummary;
	hourly: ModelPerformancePoint[];
	successSeries: ModelSuccessPoint[];
	providerPerformance: ModelProviderPerformance[];
} | null> {
	const aliases = await getModelAliases(args.client, args.modelId);
	if (aliases.length <= 1 || aliases.every((alias) => alias === args.modelId)) {
		return null;
	}

	const effectiveWindowHours = Math.max(1, Math.min(24 * 30, Math.round(args.windowHours)));
	const now = new Date();
	const currentWindowStart = new Date(now.getTime() - effectiveWindowHours * 60 * 60 * 1000);
	const previousWindowStart = new Date(
		currentWindowStart.getTime() - effectiveWindowHours * 60 * 60 * 1000,
	);
	const hourlyBucketMinutes = 60;
	const providerBucketMinutes = PROVIDER_UPTIME_BUCKET_HOURS * 60;

	const rows = await fetchGatewayRequestStatsRows({
		client: args.client,
		modelIds: aliases,
		fromIso: previousWindowStart.toISOString(),
		toIso: now.toISOString(),
	});

	if (!rows.length) return null;

	const summaryAggregate = emptyAggregateMetrics();
	const prevSummaryAggregate = emptyAggregateMetrics();
	const hourlyAggregates = new Map<string, AggregateMetrics>();
	const hourlyProviderAggregates = new Map<string, Map<string, AggregateMetrics>>();
	const providerAggregates = new Map<string, AggregateMetrics>();
	const providerUptimeAggregates = new Map<string, Map<string, AggregateMetrics>>();
	const providerIds = new Set<string>();

	for (const row of rows) {
		const createdAt = new Date(String(row.created_at ?? ""));
		if (!Number.isFinite(createdAt.getTime())) continue;
		const createdAtMs = createdAt.getTime();
		const inCurrentWindow =
			createdAtMs >= currentWindowStart.getTime() && createdAtMs <= now.getTime();
		const inPreviousWindow =
			createdAtMs >= previousWindowStart.getTime() &&
			createdAtMs < currentWindowStart.getTime();

		if (inPreviousWindow) {
			accumulateMetrics(prevSummaryAggregate, row);
		}

		if (!inCurrentWindow) continue;

		accumulateMetrics(summaryAggregate, row);

		const hourlyBucket = toUtcBucketKey(createdAt, hourlyBucketMinutes);
		if (hourlyBucket) {
			const hourlyAggregate = hourlyAggregates.get(hourlyBucket) ?? emptyAggregateMetrics();
			accumulateMetrics(hourlyAggregate, row);
			hourlyAggregates.set(hourlyBucket, hourlyAggregate);

			for (const attempt of getProviderAttemptRows(row)) {
				const providerId = String(attempt.provider ?? "").trim();
				if (!providerId) continue;
				const byProvider =
					hourlyProviderAggregates.get(hourlyBucket) ?? new Map<string, AggregateMetrics>();
				const providerHourlyAggregate =
					byProvider.get(providerId) ?? emptyAggregateMetrics();
				accumulateAttemptHealth(providerHourlyAggregate, attempt);
				byProvider.set(providerId, providerHourlyAggregate);
				hourlyProviderAggregates.set(hourlyBucket, byProvider);
			}
		}

		const providerId = String(row.provider ?? "").trim();
		if (!providerId) continue;
		providerIds.add(providerId);

		const providerAggregate = providerAggregates.get(providerId) ?? emptyAggregateMetrics();
		accumulateMetrics(providerAggregate, row);
		providerAggregates.set(providerId, providerAggregate);

		const providerBucket = toUtcBucketKey(createdAt, providerBucketMinutes);
		if (providerBucket) {
			const byBucket =
				providerUptimeAggregates.get(providerId) ?? new Map<string, AggregateMetrics>();
			const providerBucketAggregate =
				byBucket.get(providerBucket) ?? emptyAggregateMetrics();
			accumulateMetrics(providerBucketAggregate, row);
			byBucket.set(providerBucket, providerBucketAggregate);
			providerUptimeAggregates.set(providerId, byBucket);
		}
	}

	const providerMeta = new Map<string, { name: string; color: string | null }>();
	if (providerIds.size > 0) {
		const { data } = await args.client
			.from("data_api_providers")
			.select("api_provider_id, api_provider_name, colour")
			.in("api_provider_id", Array.from(providerIds));
		for (const row of data ?? []) {
			const providerId = String(row?.api_provider_id ?? "").trim();
			if (!providerId) continue;
			providerMeta.set(providerId, {
				name: String(row?.api_provider_name ?? providerId).trim() || providerId,
				color:
					typeof row?.colour === "string" && row.colour.trim().length > 0
						? row.colour.trim()
						: null,
			});
		}
	}

	const hourlyBuckets = buildUtcBucketSeries({
		start: currentWindowStart,
		end: now,
		bucketMinutes: hourlyBucketMinutes,
	});

	const hourly = hourlyBuckets.map((bucket) => {
		const aggregate = hourlyAggregates.get(bucket) ?? emptyAggregateMetrics();
		return {
			bucket,
			avgThroughput:
				aggregate.throughputSamples > 0
					? aggregate.throughputSum / aggregate.throughputSamples
					: null,
			avgLatencyMs:
				aggregate.latencySamples > 0 ? aggregate.latencySum / aggregate.latencySamples : null,
			avgGenerationMs:
				aggregate.generationSamples > 0
					? aggregate.generationSum / aggregate.generationSamples
					: null,
			requests: aggregate.totalRequests,
			successPct:
				aggregate.healthRequests > 0
					? (aggregate.healthSuccessfulRequests / aggregate.healthRequests) * 100
					: null,
		};
	});

	const successSeries = hourlyBuckets.map((bucket) => {
		const aggregate = hourlyAggregates.get(bucket) ?? emptyAggregateMetrics();
		const providerMetrics = hourlyProviderAggregates.get(bucket);
		const providerUptimes = providerMetrics
			? Array.from(providerMetrics.values())
					.map((value) =>
						value.healthRequests > 0
							? (value.healthSuccessfulRequests / value.healthRequests) * 100
							: null,
					)
					.filter((value): value is number => value != null)
			: [];
		const providerCount = providerUptimes.length;
		return {
			bucket,
			overallSuccessPct:
				aggregate.healthRequests > 0
					? (aggregate.healthSuccessfulRequests / aggregate.healthRequests) * 100
					: null,
			worstProviderSuccessPct:
				providerCount > 1 ? Math.min(...providerUptimes) : null,
			providerCount,
			requests: aggregate.totalRequests,
		};
	});

	const providerBuckets = buildUtcBucketSeries({
		start: currentWindowStart,
		end: now,
		bucketMinutes: providerBucketMinutes,
	});

	const providerPerformance = Array.from(providerAggregates.entries())
		.map(([providerId, aggregate]) => {
			const meta = providerMeta.get(providerId);
			const bucketMap = providerUptimeAggregates.get(providerId);
			return {
				provider: providerId,
				providerName: meta?.name ?? providerId,
				providerColor: meta?.color ?? null,
				avgThroughput:
					aggregate.throughputSamples > 0
						? aggregate.throughputSum / aggregate.throughputSamples
						: null,
				avgLatencyMs:
					aggregate.latencySamples > 0
						? aggregate.latencySum / aggregate.latencySamples
						: null,
				avgGenerationMs:
					aggregate.generationSamples > 0
						? aggregate.generationSum / aggregate.generationSamples
						: null,
				requests: aggregate.totalRequests,
				uptimePct:
					aggregate.healthRequests > 0
						? (aggregate.healthSuccessfulRequests / aggregate.healthRequests) * 100
						: null,
				uptimeBuckets: providerBuckets.map((bucket, index) => {
					const providerAggregateForBucket =
						bucketMap?.get(bucket) ?? emptyAggregateMetrics();
					const start = bucket;
					const end =
						providerBuckets[index + 1] ??
						new Date(
							new Date(bucket).getTime() + providerBucketMinutes * 60 * 1000,
						)
							.toISOString()
							.replace(".000Z", "");
					return {
						start,
						end,
						successPct:
							providerAggregateForBucket.healthRequests > 0
								? (providerAggregateForBucket.healthSuccessfulRequests /
										providerAggregateForBucket.healthRequests) *
									100
								: null,
					};
				}),
			};
		})
		.sort((a, b) => b.requests - a.requests || a.providerName.localeCompare(b.providerName));

	if (summaryAggregate.totalRequests <= 0 && providerPerformance.length <= 0) {
		return null;
	}

	return {
		summary: aggregateToSummary(summaryAggregate),
		prevSummary: aggregateToSummary(prevSummaryAggregate),
		hourly,
		successSeries,
		providerPerformance,
	};
}

async function getProviderDailySeries7d(
	client: any,
	modelId: string,
	preferredProviders: string[] = [],
): Promise<ModelProviderDailyPoint[]> {
	const aliases = await getModelAliases(client, modelId);
	const now = new Date();
	const start = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
	);
	start.setUTCDate(start.getUTCDate() - 6);

	const sanitizedPreferredProviders = preferredProviders
		.map((provider) => provider.trim())
		.filter(Boolean);

	try {
		const rows = await fetchGatewayRequestStatsRows({
			client,
			modelIds: aliases,
			fromIso: start.toISOString(),
			toIso: now.toISOString(),
			providerIds:
				sanitizedPreferredProviders.length > 0
					? sanitizedPreferredProviders
					: undefined,
		});

		type Aggregate = {
			requests: number;
			throughputSum: number;
			throughputSamples: number;
			latencySum: number;
			latencySamples: number;
			generationSum: number;
			generationSamples: number;
		};

		const aggregateByProviderDay = new Map<string, Aggregate>();
		const requestCountByProvider = new Map<string, number>();

		for (const row of rows) {
			const provider = String(row?.provider ?? "").trim();
			if (!provider) continue;
			const createdAt = new Date(String(row?.created_at ?? ""));
			if (!Number.isFinite(createdAt.getTime())) continue;
			const day = toUtcDayKey(createdAt);
			if (!day) continue;

			const latencyMs = toFiniteNumber(row.latency_ms);
			const generationMs = toFiniteNumber(row.generation_ms);
			const explicitThroughput = toFiniteNumber(row.throughput);
			const outputTokens = extractOutputTokensFromUsage(row.usage) ?? 0;
			const derivedThroughput =
				explicitThroughput != null && explicitThroughput > 0
					? explicitThroughput
					: generationMs != null && generationMs > 0 && outputTokens > 0
						? (outputTokens * 1000) / generationMs
						: null;
			const healthImpact = classifyRequestHealthImpact(row);

			const key = `${provider}::${day}`;
			const current = aggregateByProviderDay.get(key) ?? {
				requests: 0,
				throughputSum: 0,
				throughputSamples: 0,
				latencySum: 0,
				latencySamples: 0,
				generationSum: 0,
				generationSamples: 0,
			};

			current.requests += 1;
			if (healthImpact === "success") {
				if (derivedThroughput != null && derivedThroughput > 0) {
					current.throughputSum += derivedThroughput;
					current.throughputSamples += 1;
				}
				if (latencyMs != null && latencyMs > 0) {
					current.latencySum += latencyMs;
					current.latencySamples += 1;
				}
				if (generationMs != null && generationMs > 0) {
					current.generationSum += generationMs;
					current.generationSamples += 1;
				}
			}

			aggregateByProviderDay.set(key, current);
			requestCountByProvider.set(provider, (requestCountByProvider.get(provider) ?? 0) + 1);
		}

		const topProviders =
			sanitizedPreferredProviders.length > 0
				? sanitizedPreferredProviders
				: Array.from(requestCountByProvider.entries())
						.sort((a, b) => b[1] - a[1])
						.slice(0, 3)
						.map(([provider]) => provider);

		if (topProviders.length === 0) return [];

		const { data: providerRows } = await client
			.from("data_api_providers")
			.select("api_provider_id, api_provider_name, colour")
			.in("api_provider_id", topProviders);
		const providerMetaMap = new Map<
			string,
			{ name: string; color: string | null }
		>();
		for (const row of providerRows ?? []) {
			const id = String(row?.api_provider_id ?? "").trim();
			if (!id) continue;
			providerMetaMap.set(id, {
				name: String(row?.api_provider_name ?? id).trim() || id,
				color:
					typeof row?.colour === "string" && row.colour.trim().length > 0
						? row.colour.trim()
						: null,
			});
		}

		const dayKeys = buildLast7DayKeysUtc(now);
		const points: ModelProviderDailyPoint[] = [];
		for (const provider of topProviders) {
			const providerMeta = providerMetaMap.get(provider);
			const providerName = providerMeta?.name ?? provider;
			const providerColor = providerMeta?.color ?? null;
			for (const day of dayKeys) {
				const aggregate = aggregateByProviderDay.get(`${provider}::${day}`);
				if (!aggregate || aggregate.requests <= 0) {
					continue;
				}
				points.push({
					day,
					provider,
					providerName,
					providerColor,
					avgThroughput:
						aggregate.throughputSamples > 0
							? aggregate.throughputSum / aggregate.throughputSamples
							: null,
					avgLatencyMs:
						aggregate.latencySamples > 0
							? aggregate.latencySum / aggregate.latencySamples
							: null,
					avgGenerationMs:
						aggregate.generationSamples > 0
							? aggregate.generationSum / aggregate.generationSamples
							: null,
					requests: aggregate.requests,
				});
			}
		}

		return points;
	} catch (error) {
		console.warn("[perf] provider daily series failed", {
			modelId,
			error,
		});
		return [];
	}
}
