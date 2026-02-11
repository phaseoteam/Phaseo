"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";

type RawGatewayRequest = {
	created_at: string;
	success: boolean | number | string | null;
	latency_ms?: number | null;
	throughput?: number | null;
	generation_ms?: number | null;
	usage?: any;
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
};

// Default lookback is 7 days (expressed in hours)
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

function average(values: number[]): number | null {
	if (!values.length) return null;
	const sum = values.reduce((acc, v) => acc + v, 0);
	return sum / values.length;
}

function bucketStartISO(date: Date): string {
	const bucket = new Date(date);
	bucket.setUTCHours(0, 0, 0, 0);
	return bucket.toISOString();
}

function isUserError(row: RawGatewayRequest): boolean {
	const code = String(row?.error_code ?? "").toLowerCase();
	if (code.startsWith("user:")) return true;
	if (code.startsWith("upstream:")) return false;
	if (code.startsWith("system:")) return false;
	const sc = Number(row?.status_code ?? 0);
	if (Number.isFinite(sc)) {
		if (sc >= 500) return false;
		if (sc === 408 || sc === 429) return false;
		if (sc >= 400 && sc < 500) return true;
	}
	return false;
}

function isSuccessfulForUptime(row: RawGatewayRequest): boolean {
	const successFlag =
		row.success === true ||
		row.success === 1 ||
		row.success === "true" ||
		row.success === "t";
	if (successFlag) return true;

	const statusCode = Number(row?.status_code ?? 0);
	if (Number.isFinite(statusCode) && statusCode > 0 && statusCode < 400) {
		return true;
	}

	if (isUserError(row)) return true;
	return false;
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

	// We'll iterate over each calendar day in the range and fetch that day's rows as a "page".
	// For the first/last day we trim the bounds to `fromIso`/`toIso` so we only fetch the requested window.
	const startDay = new Date(fromIso);
	startDay.setUTCHours(0, 0, 0, 0);
	const endDay = new Date(now);
	endDay.setUTCHours(0, 0, 0, 0);

	for (let day = new Date(startDay); day <= endDay; day.setUTCDate(day.getUTCDate() + 1)) {
		const dayStartIso = day.toISOString();
		const nextDay = new Date(day.getTime() + 24 * 60 * 60 * 1000);
		const dayEndIso = nextDay.toISOString();

		// Trim first/last day to the exact window
		const effectiveFrom = day.getTime() === startDay.getTime() ? fromIso : dayStartIso;
		const effectiveTo = day.getTime() === endDay.getTime() ? toIso : dayEndIso;

		// Paginate within the day in case there are > PAGE_SIZE rows for a single day
		for (let page = 0; page < MAX_PAGES; page++) {
			const from = page * PAGE_SIZE;
			const to = from + PAGE_SIZE - 1;
			const { data, error } = await client
				.from("gateway_requests")
				.select(
					"created_at, success, latency_ms, throughput, generation_ms, usage, provider, model_id, error_code, status_code"
				)
				.eq("provider", providerId)
				.gte("created_at", effectiveFrom)
				.lt("created_at", effectiveTo)
				.order("created_at", { ascending: true })
				.range(from, to);

			if (error) throw new Error(error.message ?? "Failed to load provider data");
			if (!data?.length) break; // nothing for this page/day

			rows.push(
				...(data as RawGatewayRequest[]).filter((row) => Boolean(row?.created_at))
			);

			if (data.length < PAGE_SIZE) break; // fetched all rows for this day
		}
	}

	return rows;
}

function buildProviderMetricsFromRows(
	rows: RawGatewayRequest[],
	now = new Date(),
	hours = HOURS_DEFAULT
): ProviderMetrics {
	const buckets = new Map<
		string,
		{
			requests: number;
			success: number;
			latencies: number[];
			throughputs: number[];
			generations: number[];
		}
	>();

	let totalRequests = 0;
	let totalSuccess = 0;
	const allLatencies: number[] = [];
	const allThroughputs: number[] = [];
	const allGenerations: number[] = [];

	for (const row of rows) {
		const createdAt = new Date(row.created_at);
		if (Number.isNaN(createdAt.getTime())) continue;

		const bucketKey = bucketStartISO(createdAt);
		const bucket =
			buckets.get(bucketKey) ??
			{ requests: 0, success: 0, latencies: [], throughputs: [], generations: [] };

		bucket.requests += 1;
		totalRequests += 1;

		const success = isSuccessfulForUptime(row);
		if (success) {
			bucket.success += 1;
			totalSuccess += 1;
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

		buckets.set(bucketKey, bucket);
	}

	const latencySeries: ProviderTimeseriesPoint[] = [];
	const throughputSeries: ProviderTimeseriesPoint[] = [];

	const startTime = new Date(now.getTime() - hours * 60 * 60 * 1000);
	const endTime = now;

	// Generate all day buckets from start to end
	for (let time = new Date(startTime); time <= endTime; time.setUTCDate(time.getUTCDate() + 1)) {
		const bucketKey = bucketStartISO(time);
		const data = buckets.get(bucketKey);
		const uptime = data ? (data.requests > 0 ? (data.success / data.requests) * 100 : null) : null;
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
	}

	const uptimePct =
		totalRequests > 0 ? (totalSuccess / totalRequests) * 100 : null;
	const avgLatency = percentile(allLatencies, 0.5);
	const avgThroughput = percentile(allThroughputs, 0.5);
	const avgGeneration = percentile(allGenerations, 0.5);

	return {
		summary: {
			uptimePct,
			avgLatencyMs: avgLatency,
			avgThroughput,
			avgGenerationMs: avgGeneration,
			requests24h: totalRequests,
			successful24h: totalSuccess,
		},
		timeseries: {
			latency: latencySeries,
			throughput: throughputSeries,
		},
	};
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
			// Return empty metrics if no data
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
			};
		}

		return buildProviderMetricsFromRows(rows, now, hours);
	} catch (err: any) {
		console.error("Failed to load provider metrics:", err);
		// Return empty metrics on error
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
		};
	}
}
