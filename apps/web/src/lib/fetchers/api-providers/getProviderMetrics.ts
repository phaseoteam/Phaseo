"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";

type ProviderRollupRow = {
	bucket_15m: string;
	canonical_model_id: string | null;
	requests: number | null;
	success_requests: number | null;
	total_tokens: number | null;
	latency_sum_ms: number | null;
	latency_samples: number | null;
	throughput_sum: number | null;
	throughput_samples: number | null;
};

export type ProviderTimeseriesPoint = {
	timestamp: string;
	requests: number;
	uptimePct: number | null;
	avgLatencyMs: number | null;
	avgThroughput: number | null;
	avgGenerationMs: number | null;
};

export type ModelMetricLeaderboardEntry = {
	id: string;
	label: string;
	requests: number;
	value: number | null;
};

export type ProviderMetrics = {
	summary: {
		uptimePct: number | null;
		avgLatencyMs: number | null;
		avgThroughput: number | null;
		avgGenerationMs: number | null;
		requests24h: number;
		successful24h: number;
	};
	timeseries: {
		latency: ProviderTimeseriesPoint[];
		throughput: ProviderTimeseriesPoint[];
	};
	dailyModelLeaderboards: Record<
		string,
		{
			throughput: ModelMetricLeaderboardEntry[];
			latency: ModelMetricLeaderboardEntry[];
			e2e: ModelMetricLeaderboardEntry[];
		}
	>;
};

const HOURS_DEFAULT = 24 * 7;
const PAGE_SIZE = 5000;

type Aggregate = {
	requests: number;
	successRequests: number;
	totalTokens: number;
	latencySum: number;
	latencySamples: number;
	throughputSum: number;
	throughputSamples: number;
};

function toNumber(value: unknown): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

function avg(sum: number, samples: number): number | null {
	if (!Number.isFinite(sum) || !Number.isFinite(samples) || samples <= 0) return null;
	return sum / samples;
}

function bucketStartISO(date: Date): string {
	const bucket = new Date(date);
	bucket.setUTCHours(0, 0, 0, 0);
	return bucket.toISOString();
}

function mergeAggregate(target: Aggregate, row: ProviderRollupRow) {
	target.requests += toNumber(row.requests);
	target.successRequests += toNumber(row.success_requests);
	target.totalTokens += toNumber(row.total_tokens);
	target.latencySum += toNumber(row.latency_sum_ms);
	target.latencySamples += toNumber(row.latency_samples);
	target.throughputSum += toNumber(row.throughput_sum);
	target.throughputSamples += toNumber(row.throughput_samples);
}

function emptyAggregate(): Aggregate {
	return {
		requests: 0,
		successRequests: 0,
		totalTokens: 0,
		latencySum: 0,
		latencySamples: 0,
		throughputSum: 0,
		throughputSamples: 0,
	};
}

async function fetchProviderRollupRows(
	client: SupabaseClient,
	providerId: string,
	hours = HOURS_DEFAULT,
	now = new Date(),
): Promise<ProviderRollupRow[]> {
	const rows: ProviderRollupRow[] = [];
	const toIso = now.toISOString();
	const fromIso = new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();

	for (let from = 0; ; from += PAGE_SIZE) {
		const to = from + PAGE_SIZE - 1;
		const { data, error } = await client
			.from("gateway_usage_rollup_15m_model_provider")
			.select(
				"bucket_15m, canonical_model_id, requests, success_requests, total_tokens, latency_sum_ms, latency_samples, throughput_sum, throughput_samples",
			)
			.eq("provider", providerId)
			.gte("bucket_15m", fromIso)
			.lte("bucket_15m", toIso)
			.order("bucket_15m", { ascending: true })
			.range(from, to);

		if (error) throw new Error(error.message ?? "Failed to load provider rollup data");
		if (!Array.isArray(data) || data.length === 0) break;

		rows.push(...(data as ProviderRollupRow[]));
		if (data.length < PAGE_SIZE) break;
	}

	return rows;
}

function buildModelMetricLeaderboard(
	stats: Map<string, Aggregate> | undefined,
	labels: Map<string, string>,
	metric: "throughput" | "latency" | "e2e",
	limit = 5,
): ModelMetricLeaderboardEntry[] {
	if (!stats || stats.size === 0) return [];

	const rows = Array.from(stats.entries())
		.map(([id, values]) => {
			const metricValue =
				metric === "throughput"
					? avg(values.throughputSum, values.throughputSamples)
					: avg(values.latencySum, values.latencySamples);

			return {
				id,
				label: labels.get(id) ?? id,
				requests: values.requests,
				value: metricValue,
			};
		})
		.filter((row) => row.value != null);

	return rows
		.sort((a, b) =>
			metric === "throughput"
				? Number(b.value) !== Number(a.value)
					? Number(b.value) - Number(a.value)
					: b.requests !== a.requests
						? b.requests - a.requests
						: a.label.localeCompare(b.label)
				: Number(a.value) !== Number(b.value)
					? Number(a.value) - Number(b.value)
					: b.requests !== a.requests
						? b.requests - a.requests
						: a.label.localeCompare(b.label),
		)
		.slice(0, Math.max(1, limit));
}

function buildProviderMetricsFromRollups(
	rows: ProviderRollupRow[],
	now = new Date(),
	hours = HOURS_DEFAULT,
	modelLabels: Map<string, string> = new Map(),
): ProviderMetrics {
	const dayBuckets = new Map<string, Aggregate>();
	const dayModelBuckets = new Map<string, Map<string, Aggregate>>();
	const totals = emptyAggregate();

	for (const row of rows) {
		const bucketDate = new Date(row.bucket_15m);
		if (!Number.isFinite(bucketDate.getTime())) continue;
		const dayKey = bucketStartISO(bucketDate);

		const dayAgg = dayBuckets.get(dayKey) ?? emptyAggregate();
		mergeAggregate(dayAgg, row);
		dayBuckets.set(dayKey, dayAgg);

		mergeAggregate(totals, row);

		const modelId = String(row.canonical_model_id ?? "").trim();
		if (!modelId) continue;

		const modelMap = dayModelBuckets.get(dayKey) ?? new Map<string, Aggregate>();
		const modelAgg = modelMap.get(modelId) ?? emptyAggregate();
		mergeAggregate(modelAgg, row);
		modelMap.set(modelId, modelAgg);
		dayModelBuckets.set(dayKey, modelMap);
	}

	const startTime = new Date(now.getTime() - hours * 60 * 60 * 1000);
	const endTime = now;
	const latencySeries: ProviderTimeseriesPoint[] = [];
	const throughputSeries: ProviderTimeseriesPoint[] = [];
	const dailyModelLeaderboards: ProviderMetrics["dailyModelLeaderboards"] = {};

	for (
		let cursor = new Date(startTime);
		cursor <= endTime;
		cursor.setUTCDate(cursor.getUTCDate() + 1)
	) {
		const bucketKey = bucketStartISO(cursor);
		const dayAgg = dayBuckets.get(bucketKey) ?? emptyAggregate();
		const point: ProviderTimeseriesPoint = {
			timestamp: bucketKey,
			requests: dayAgg.requests,
			uptimePct:
				dayAgg.requests > 0
					? (dayAgg.successRequests / dayAgg.requests) * 100
					: null,
			avgLatencyMs: avg(dayAgg.latencySum, dayAgg.latencySamples),
			avgThroughput: avg(dayAgg.throughputSum, dayAgg.throughputSamples),
			avgGenerationMs: null,
		};

		latencySeries.push(point);
		throughputSeries.push(point);

		const modelStats = dayModelBuckets.get(bucketKey);
		dailyModelLeaderboards[bucketKey] = {
			throughput: buildModelMetricLeaderboard(
				modelStats,
				modelLabels,
				"throughput",
				5,
			),
			latency: buildModelMetricLeaderboard(modelStats, modelLabels, "latency", 5),
			// Generation latency is not in rollup yet; fallback to latency leaderboard.
			e2e: buildModelMetricLeaderboard(modelStats, modelLabels, "e2e", 5),
		};
	}

	return {
		summary: {
			uptimePct:
				totals.requests > 0 ? (totals.successRequests / totals.requests) * 100 : null,
			avgLatencyMs: avg(totals.latencySum, totals.latencySamples),
			avgThroughput: avg(totals.throughputSum, totals.throughputSamples),
			avgGenerationMs: null,
			requests24h: totals.requests,
			successful24h: totals.successRequests,
		},
		timeseries: {
			latency: latencySeries,
			throughput: throughputSeries,
		},
		dailyModelLeaderboards,
	};
}

async function fetchModelLabels(
	client: SupabaseClient,
	modelIds: string[],
): Promise<Map<string, string>> {
	const map = new Map<string, string>();
	if (!modelIds.length) return map;

	const { data, error } = await client
		.from("data_models")
		.select("model_id, name")
		.in("model_id", modelIds);

	if (error) {
		console.error("Failed to load model labels for provider metrics:", error);
		return map;
	}

	for (const row of data ?? []) {
		const modelId = String((row as any)?.model_id ?? "").trim();
		if (!modelId) continue;
		const name = String((row as any)?.name ?? "").trim();
		map.set(modelId, name || modelId);
	}

	return map;
}

export async function getProviderMetrics(
	providerId: string,
	hours = HOURS_DEFAULT,
): Promise<ProviderMetrics> {
	cacheLife("minutes");
	cacheTag("data:gateway_usage_rollups");
	cacheTag(`data:gateway_usage_rollups:provider:${providerId}`);

	if (!providerId) {
		return {
			summary: {
				uptimePct: null,
				avgLatencyMs: null,
				avgThroughput: null,
				avgGenerationMs: null,
				requests24h: 0,
				successful24h: 0,
			},
			timeseries: { latency: [], throughput: [] },
			dailyModelLeaderboards: {},
		};
	}

	const now = new Date();
	const client = createAdminClient();
	let rows: ProviderRollupRow[] = [];
	try {
		rows = await fetchProviderRollupRows(client, providerId, hours, now);
	} catch (error) {
		console.error("Failed to load provider performance rollups:", error);
		return {
			summary: {
				uptimePct: null,
				avgLatencyMs: null,
				avgThroughput: null,
				avgGenerationMs: null,
				requests24h: 0,
				successful24h: 0,
			},
			timeseries: { latency: [], throughput: [] },
			dailyModelLeaderboards: {},
		};
	}

	if (!rows.length) {
		return {
			summary: {
				uptimePct: null,
				avgLatencyMs: null,
				avgThroughput: null,
				avgGenerationMs: null,
				requests24h: 0,
				successful24h: 0,
			},
			timeseries: { latency: [], throughput: [] },
			dailyModelLeaderboards: {},
		};
	}

	const modelIds = Array.from(
		new Set(
			rows
				.map((row) => String(row.canonical_model_id ?? "").trim())
				.filter(Boolean),
		),
	);
	const modelLabels = await fetchModelLabels(client, modelIds);
	return buildProviderMetricsFromRollups(rows, now, hours, modelLabels);
}
