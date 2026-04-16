import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";

export type ProviderRuntimeStats = {
	providerId: string;
	latencyMs30m: number | null;
	throughput30m: number | null;
	uptimePct3d: number | null;
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
	requests30m: number;
	requests3d: number;
	successful3d: number;
};

export type ProviderRuntimeStatsMap = Record<string, ProviderRuntimeStats>;

type RuntimeRollupRow = {
	bucket_15m: string;
	provider: string;
	requests: number | null;
	success_requests: number | null;
	input_tokens: number | null;
	output_tokens: number | null;
	latency_sum_ms: number | null;
	latency_samples: number | null;
	throughput_sum: number | null;
	throughput_samples: number | null;
};

type GatewayRequestUsageRow = {
	provider: string | null;
	usage: unknown;
};

type CacheUsageAggregate = {
	cachedTokens: number;
};

type Aggregate = {
	requests30m: number;
	requests3d: number;
	successful3d: number;
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
	dayRequests: [number, number, number];
	daySuccessful: [number, number, number];
};

const PAGE_SIZE = 5000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_GATEWAY_REQUEST_PAGES = 4;

function toNumber(value: unknown): number {
	const num = Number(value);
	return Number.isFinite(num) ? num : 0;
}

function toInt(value: unknown): number {
	const num = Number(value);
	return Number.isFinite(num) ? Math.max(0, Math.trunc(num)) : 0;
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

function emptyCacheUsageAggregate(): CacheUsageAggregate {
	return {
		cachedTokens: 0,
	};
}

function normaliseCacheTokenPct(numerator: number, denominator: number): number | null {
	if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
		return null;
	}
	const ratio = (numerator / denominator) * 100;
	if (!Number.isFinite(ratio)) return null;
	return Math.min(100, Math.max(0, ratio));
}

function aggregateCacheUsageByProvider(
	rows: GatewayRequestUsageRow[],
): Map<string, CacheUsageAggregate> {
	const aggregateByProvider = new Map<string, CacheUsageAggregate>();

	for (const row of rows) {
		const providerId = String(row.provider ?? "").trim();
		if (!providerId) continue;

		const cachedReadTokens = extractCachedReadTokensFromUsage(row.usage);
		if (cachedReadTokens == null || cachedReadTokens <= 0) continue;

		const current = aggregateByProvider.get(providerId) ?? emptyCacheUsageAggregate();
		current.cachedTokens += cachedReadTokens;
		aggregateByProvider.set(providerId, current);
	}

	return aggregateByProvider;
}

function emptyAggregate(): Aggregate {
	return {
		requests30m: 0,
		requests3d: 0,
		successful3d: 0,
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
		dayRequests: [0, 0, 0],
		daySuccessful: [0, 0, 0],
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

async function fetchRuntimeRollupRows(
	client: ReturnType<typeof createAdminClient>,
	modelIds: string[],
	providerIds: string[],
	fromIso: string,
	toIso: string,
): Promise<RuntimeRollupRow[]> {
	const rows: RuntimeRollupRow[] = [];
	for (let offset = 0; ; offset += PAGE_SIZE) {
		const to = offset + PAGE_SIZE - 1;
		const { data, error } = await client
			.from("gateway_usage_rollup_15m_model_provider")
			.select(
				"bucket_15m, provider, requests, success_requests, input_tokens, output_tokens, latency_sum_ms, latency_samples, throughput_sum, throughput_samples",
			)
			.in("canonical_model_id", modelIds)
			.in("provider", providerIds)
			.gte("bucket_15m", fromIso)
			.lte("bucket_15m", toIso)
			.order("bucket_15m", { ascending: true })
			.range(offset, to);

		if (error) {
			throw new Error(error.message ?? "Failed to fetch model provider runtime rollups");
		}
		if (!Array.isArray(data) || data.length === 0) break;
		rows.push(...(data as RuntimeRollupRow[]));
		if (data.length < PAGE_SIZE) break;
	}
	return rows;
}

async function fetchGatewayRequestRowsForHour(args: {
	client: ReturnType<typeof createAdminClient>;
	modelIds: string[];
	providerIds: string[];
	fromIso: string;
	toIso: string;
}): Promise<GatewayRequestUsageRow[]> {
	const rows: GatewayRequestUsageRow[] = [];

	for (
		let page = 0, offset = 0;
		page < MAX_GATEWAY_REQUEST_PAGES;
		page += 1, offset += PAGE_SIZE
	) {
		const to = offset + PAGE_SIZE - 1;
		const { data, error } = await args.client
			.from("gateway_requests")
			.select("provider, usage")
			.in("model_id", args.modelIds)
			.in("provider", args.providerIds)
			.gte("created_at", args.fromIso)
			.lte("created_at", args.toIso)
			.order("created_at", { ascending: true })
			.range(offset, to);

		if (error) {
			throw new Error(error.message ?? "Failed to fetch gateway request usage rows");
		}
		if (!Array.isArray(data) || data.length === 0) break;
		rows.push(...(data as GatewayRequestUsageRow[]));
		if (data.length < PAGE_SIZE) break;
	}

	return rows;
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
	let rows: RuntimeRollupRow[];
	try {
		rows = await fetchRuntimeRollupRows(client, modelIds, providerIds, fromIso, toIso);
	} catch (error) {
		console.warn("Failed to fetch model provider runtime stats", {
			modelId: args.modelId,
			error,
		});
		return {};
	}

	let cacheUsageByProvider = new Map<string, CacheUsageAggregate>();
	try {
		const hourRows = await fetchGatewayRequestRowsForHour({
			client,
			modelIds,
			providerIds,
			fromIso: new Date(nowMs - ONE_HOUR_MS).toISOString(),
			toIso,
		});
		cacheUsageByProvider = aggregateCacheUsageByProvider(hourRows);
	} catch (error) {
		console.warn("Failed to fetch model provider cache token stats", {
			modelId: args.modelId,
			error,
		});
	}

	const aggregateByProvider = new Map<string, Aggregate>();

	for (const row of rows) {
		const providerId = String(row?.provider ?? "").trim();
		if (!providerId) continue;

		const bucketDate = new Date(String(row?.bucket_15m ?? ""));
		if (!Number.isFinite(bucketDate.getTime())) continue;

		const aggregate = aggregateByProvider.get(providerId) ?? emptyAggregate();
		const requests = toInt(row.requests);
		const successful = toInt(row.success_requests);
		const inputTokens = toInt(row.input_tokens);
		const outputTokens = toInt(row.output_tokens);
		const latencySum = toNumber(row.latency_sum_ms);
		const latencySamples = toInt(row.latency_samples);
		const throughputSum = toNumber(row.throughput_sum);
		const throughputSamples = toInt(row.throughput_samples);

		aggregate.requests3d += requests;
		aggregate.successful3d += successful;
		aggregate.latencySum3d += latencySum;
		aggregate.latencySamples3d += latencySamples;
		aggregate.throughputSum3d += throughputSum;
		aggregate.throughputSamples3d += throughputSamples;

		const dayOffset = dayOffsetFromUtcMidnight(nowUtcMidnightMs, bucketDate);
		if (dayOffset != null) {
			aggregate.dayRequests[dayOffset] += requests;
			aggregate.daySuccessful[dayOffset] += successful;
		}

		if (bucketDate.getTime() >= nowMs - THIRTY_MINUTES_MS) {
			aggregate.requests30m += requests;
			aggregate.latencySum30m += latencySum;
			aggregate.latencySamples30m += latencySamples;
			aggregate.throughputSum30m += throughputSum;
			aggregate.throughputSamples30m += throughputSamples;
		}
		if (bucketDate.getTime() >= nowMs - ONE_HOUR_MS) {
			aggregate.inputTokens1h += inputTokens;
			aggregate.outputTokens1h += outputTokens;
		}

		aggregateByProvider.set(providerId, aggregate);
	}

	const out: ProviderRuntimeStatsMap = {};

	for (const providerId of providerIds) {
		const aggregate = aggregateByProvider.get(providerId) ?? emptyAggregate();
		const cacheAggregate =
			cacheUsageByProvider.get(providerId) ?? emptyCacheUsageAggregate();
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
				aggregate.requests3d > 0
					? (aggregate.successful3d / aggregate.requests3d) * 100
					: null,
			inputTokens1h: aggregate.inputTokens1h,
			outputTokens1h: aggregate.outputTokens1h,
			cachedReadTokens1h: cacheAggregate.cachedTokens,
			cacheTokenPct1h: normaliseCacheTokenPct(
				cacheAggregate.cachedTokens,
				aggregate.inputTokens1h + aggregate.outputTokens1h,
			),
			uptimeDaily3d: [
				{
					dayOffset: 0,
					requests: aggregate.dayRequests[0],
					successful: aggregate.daySuccessful[0],
					uptimePct:
						aggregate.dayRequests[0] > 0
							? (aggregate.daySuccessful[0] / aggregate.dayRequests[0]) * 100
							: null,
				},
				{
					dayOffset: 1,
					requests: aggregate.dayRequests[1],
					successful: aggregate.daySuccessful[1],
					uptimePct:
						aggregate.dayRequests[1] > 0
							? (aggregate.daySuccessful[1] / aggregate.dayRequests[1]) * 100
							: null,
				},
				{
					dayOffset: 2,
					requests: aggregate.dayRequests[2],
					successful: aggregate.daySuccessful[2],
					uptimePct:
						aggregate.dayRequests[2] > 0
							? (aggregate.daySuccessful[2] / aggregate.dayRequests[2]) * 100
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

	cacheLife("minutes");
	cacheTag("data:gateway_usage_rollups");
	cacheTag("data:gateway_requests");
	cacheTag(`data:gateway_usage_rollups:model:${args.modelId}`);

	return getModelProviderRuntimeStats(args);
}
