"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";
import { classifyGatewayRequestForUptime } from "@/lib/fetchers/gateway/uptimeClassification";

type RawGatewayRequest = {
	created_at: string;
	success: boolean | number | string | null;
	latency_ms?: number | null;
	throughput?: number | null;
	generation_ms?: number | null;
	provider?: string | null;
	model_id?: string | null;
	error_code?: string | null;
	status_code?: number | null;
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
const PAGE_SIZE = 1000;
const MAX_PAGES = 12;

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

function bucketStartISO(date: Date): string {
	const bucket = new Date(date);
	bucket.setUTCHours(0, 0, 0, 0);
	return bucket.toISOString();
}

async function fetchProviderRequests(
	client: SupabaseClient,
	providerId: string,
	hours = HOURS_DEFAULT,
	now = new Date()
): Promise<RawGatewayRequest[]> {
	const rows: RawGatewayRequest[] = [];
	const toIso = now.toISOString();
	const fromIso = new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();

	const startDay = new Date(fromIso);
	startDay.setUTCHours(0, 0, 0, 0);
	const endDay = new Date(now);
	endDay.setUTCHours(0, 0, 0, 0);

	for (let day = new Date(startDay); day <= endDay; day.setUTCDate(day.getUTCDate() + 1)) {
		const dayStartIso = day.toISOString();
		const nextDay = new Date(day.getTime() + 24 * 60 * 60 * 1000);
		const dayEndIso = nextDay.toISOString();

		const effectiveFrom = day.getTime() === startDay.getTime() ? fromIso : dayStartIso;
		const effectiveTo = day.getTime() === endDay.getTime() ? toIso : dayEndIso;

		for (let page = 0; page < MAX_PAGES; page++) {
			const from = page * PAGE_SIZE;
			const to = from + PAGE_SIZE - 1;

			const { data, error } = await client
				.from("gateway_requests")
				.select(
					"created_at, success, latency_ms, throughput, generation_ms, provider, model_id, error_code, status_code"
				)
				.eq("provider", providerId)
				.gte("created_at", effectiveFrom)
				.lt("created_at", effectiveTo)
				.order("created_at", { ascending: true })
				.range(from, to);

			if (error) throw new Error(error.message ?? "Failed to load provider data");
			if (!data?.length) break;

			rows.push(
				...(data as RawGatewayRequest[]).filter((row) => Boolean(row?.created_at))
			);

			if (data.length < PAGE_SIZE) break;
		}
	}

	return rows;
}

function buildModelMetricLeaderboard(
	stats: Map<
		string,
		{
			requests: number;
			latencies: number[];
			throughputs: number[];
			generations: number[];
		}
	> | undefined,
	labels: Map<string, string>,
	metric: "throughput" | "latency" | "e2e",
	limit = 5
): ModelMetricLeaderboardEntry[] {
	if (!stats || stats.size === 0) return [];

	const rows = Array.from(stats.entries())
		.map(([id, values]) => ({
			id,
			label: labels.get(id) ?? id,
			requests: values.requests,
			value:
				metric === "throughput"
					? percentile(values.throughputs, 0.5)
					: metric === "latency"
						? percentile(values.latencies, 0.5)
						: percentile(values.generations, 0.5),
		}))
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
						: a.label.localeCompare(b.label)
		)
		.slice(0, Math.max(1, limit));
}

function buildProviderMetricsFromRows(
	rows: RawGatewayRequest[],
	now = new Date(),
	hours = HOURS_DEFAULT,
	modelLabels: Map<string, string> = new Map()
): ProviderMetrics {
	const buckets = new Map<
		string,
		{
			requests: number;
			uptimeEvents: number;
			uptimeSuccess: number;
			latencies: number[];
			throughputs: number[];
			generations: number[];
		}
	>();
	const modelStatsByBucket = new Map<
		string,
		Map<
			string,
			{
				requests: number;
				latencies: number[];
				throughputs: number[];
				generations: number[];
			}
		>
	>();

	let totalRequests = 0;
	let totalUptimeEvents = 0;
	let totalUptimeSuccess = 0;
	const allLatencies: number[] = [];
	const allThroughputs: number[] = [];
	const allGenerations: number[] = [];

	for (const row of rows) {
		const createdAt = new Date(row.created_at);
		if (Number.isNaN(createdAt.getTime())) continue;

		const bucketKey = bucketStartISO(createdAt);
		const bucket =
			buckets.get(bucketKey) ??
			{
				requests: 0,
				uptimeEvents: 0,
				uptimeSuccess: 0,
				latencies: [],
				throughputs: [],
				generations: [],
			};

		bucket.requests += 1;
		totalRequests += 1;

		const uptimeOutcome = classifyGatewayRequestForUptime(row);
		if (uptimeOutcome !== "exclude") {
			bucket.uptimeEvents += 1;
			totalUptimeEvents += 1;
			if (uptimeOutcome === "count_success") {
				bucket.uptimeSuccess += 1;
				totalUptimeSuccess += 1;
			}
		}

		if (row.latency_ms != null && Number.isFinite(Number(row.latency_ms))) {
			const latency = Number(row.latency_ms);
			bucket.latencies.push(latency);
			allLatencies.push(latency);
		}
		if (row.throughput != null && Number.isFinite(Number(row.throughput))) {
			const throughput = Number(row.throughput);
			bucket.throughputs.push(throughput);
			allThroughputs.push(throughput);
		}
		if (row.generation_ms != null && Number.isFinite(Number(row.generation_ms))) {
			const generation = Number(row.generation_ms);
			bucket.generations.push(generation);
			allGenerations.push(generation);
		}

		const modelId = row.model_id?.trim();
		if (modelId) {
			const bucketModels = modelStatsByBucket.get(bucketKey) ?? new Map();
			const modelStats = bucketModels.get(modelId) ?? {
				requests: 0,
				latencies: [],
				throughputs: [],
				generations: [],
			};
			modelStats.requests += 1;
			if (row.latency_ms != null && Number.isFinite(Number(row.latency_ms))) {
				modelStats.latencies.push(Number(row.latency_ms));
			}
			if (row.throughput != null && Number.isFinite(Number(row.throughput))) {
				modelStats.throughputs.push(Number(row.throughput));
			}
			if (row.generation_ms != null && Number.isFinite(Number(row.generation_ms))) {
				modelStats.generations.push(Number(row.generation_ms));
			}
			bucketModels.set(modelId, modelStats);
			modelStatsByBucket.set(bucketKey, bucketModels);
		}

		buckets.set(bucketKey, bucket);
	}

	const latencySeries: ProviderTimeseriesPoint[] = [];
	const throughputSeries: ProviderTimeseriesPoint[] = [];
	const dailyModelLeaderboards: ProviderMetrics["dailyModelLeaderboards"] = {};

	const startTime = new Date(now.getTime() - hours * 60 * 60 * 1000);
	const endTime = now;

	for (let time = new Date(startTime); time <= endTime; time.setUTCDate(time.getUTCDate() + 1)) {
		const bucketKey = bucketStartISO(time);
		const data = buckets.get(bucketKey);
		const uptime = data
			? data.uptimeEvents > 0
				? (data.uptimeSuccess / data.uptimeEvents) * 100
				: null
			: null;
		const avgLatency = data ? percentile(data.latencies, 0.5) : null;
		const avgThroughput = data ? percentile(data.throughputs, 0.5) : null;
		const avgGeneration = data ? percentile(data.generations, 0.5) : null;

		const point: ProviderTimeseriesPoint = {
			timestamp: bucketKey,
			requests: data?.requests ?? 0,
			uptimePct: uptime,
			avgLatencyMs: avgLatency,
			avgThroughput,
			avgGenerationMs: avgGeneration,
		};

		latencySeries.push(point);
		throughputSeries.push(point);

		const dayStats = modelStatsByBucket.get(bucketKey);
		dailyModelLeaderboards[bucketKey] = {
			throughput: buildModelMetricLeaderboard(dayStats, modelLabels, "throughput", 5),
			latency: buildModelMetricLeaderboard(dayStats, modelLabels, "latency", 5),
			e2e: buildModelMetricLeaderboard(dayStats, modelLabels, "e2e", 5),
		};
	}

	return {
		summary: {
			uptimePct:
				totalUptimeEvents > 0
					? (totalUptimeSuccess / totalUptimeEvents) * 100
					: null,
			avgLatencyMs: percentile(allLatencies, 0.5),
			avgThroughput: percentile(allThroughputs, 0.5),
			avgGenerationMs: percentile(allGenerations, 0.5),
			requests24h: totalRequests,
			successful24h: totalUptimeSuccess,
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
	modelIds: string[]
): Promise<Map<string, string>> {
	const map = new Map<string, string>();
	if (!modelIds.length) return map;

	const { data, error } = await client
		.from("data_models")
		.select("model_id, model_name")
		.in("model_id", modelIds);

	if (error) {
		console.error("Failed to load model labels for provider metrics:", error);
		return map;
	}

	for (const row of data ?? []) {
		const modelId = String((row as any).model_id ?? "").trim();
		if (!modelId) continue;
		const modelName = String((row as any).model_name ?? "").trim();
		map.set(modelId, modelName || modelId);
	}

	return map;
}

export async function getProviderMetrics(
	providerId: string,
	hours = HOURS_DEFAULT
): Promise<ProviderMetrics> {
	"use cache";
	cacheLife("minutes");
	cacheTag("data:gateway_requests");
	cacheTag(`data:gateway_requests:provider:${providerId}`);

	const now = new Date();
	const client = createAdminClient();

	try {
		const rows = await fetchProviderRequests(client, providerId, hours, now);

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
				timeseries: {
					latency: [],
					throughput: [],
				},
				dailyModelLeaderboards: {},
			};
		}

		const modelIds = Array.from(
			new Set(
				rows
					.map((row) => row.model_id?.trim())
					.filter((value): value is string => Boolean(value))
			)
		);

		const modelLabels = await fetchModelLabels(client, modelIds);
		return buildProviderMetricsFromRows(rows, now, hours, modelLabels);
	} catch (err: any) {
		console.error("Failed to load provider metrics:", err);
		return {
			summary: {
				uptimePct: null,
				avgLatencyMs: null,
				avgThroughput: null,
				avgGenerationMs: null,
				requests24h: 0,
				successful24h: 0,
			},
			timeseries: {
				latency: [],
				throughput: [],
			},
			dailyModelLeaderboards: {},
		};
	}
}
