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
