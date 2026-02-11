import type { SupabaseClient } from "@supabase/supabase-js";
import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";

type RawGatewayRequest = {
	created_at: string;
	success: boolean | number | string | null;
	latency_ms?: number | null;
	generation_ms?: number | null;
	usage?: any;
	provider?: string | null;
	model_id?: string | null;
	error_code?: string | null;
	status_code?: number | null;
};

type ActiveProviderModelRow = {
	api_model_id: string | null;
	provider_id: string | null;
	effective_from?: string | null;
	effective_to?: string | null;
};

type GatewayUsageSnapshotRow = {
	window_start?: string | null;
	window_end?: string | null;
	timeframe_hours?: number | null;
	total_requests?: number | null;
	uptime_pct?: number | null;
	uptime_events?: number | null;
	total_tokens?: number | null;
};

type GatewayUsageSnapshot = {
	windowStart: string | null;
	windowEnd: string | null;
	timeframeHours: number | null;
	totalRequests: number;
	uptimePct: number | null;
	uptimeEvents: number;
	totalTokens: number;
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
const PAGE_SIZE = 1000;
const MAX_PAGES = 12; // cap at 12k rows for marketing snapshot

function coerceNumber(value: unknown, fallback = 0): number {
	if (value == null) return fallback;
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : fallback;
	}
	const parsed = Number.parseFloat(String(value));
	return Number.isFinite(parsed) ? parsed : fallback;
}

function coerceNullableNumber(value: unknown): number | null {
	if (value == null) return null;
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : null;
	}
	const parsed = Number.parseFloat(String(value));
	return Number.isFinite(parsed) ? parsed : null;
}

function getUsageTotalTokens(payload: unknown): number {
	if (payload == null) return 0;

	let normalized: unknown = payload;
	if (typeof payload === "string") {
		try {
			normalized = JSON.parse(payload);
		} catch {
			return 0;
		}
	}

	if (typeof normalized === "number") {
		return Number.isFinite(normalized) ? normalized : 0;
	}

	if (typeof normalized === "object" && normalized !== null) {
		const record = normalized as Record<string, unknown>;
		const candidate =
			record["total_tokens"] ?? record["totalTokens"] ?? null;
		if (candidate == null) return 0;
		return coerceNumber(candidate, 0);
	}

	return 0;
}

function mapUsageSnapshotRow(
	row?: GatewayUsageSnapshotRow | null
): GatewayUsageSnapshot | null {
	if (!row) return null;
	return {
		windowStart:
			typeof row.window_start === "string" ? row.window_start : null,
		windowEnd: typeof row.window_end === "string" ? row.window_end : null,
		timeframeHours: coerceNullableNumber(row.timeframe_hours),
		totalRequests: coerceNumber(row.total_requests, 0),
		uptimePct: coerceNullableNumber(row.uptime_pct),
		uptimeEvents: coerceNumber(row.uptime_events, 0),
		totalTokens: coerceNumber(row.total_tokens, 0),
	};
}

async function fetchGatewayUsageSnapshot(
	client: SupabaseClient,
	hours = HOURS_DEFAULT
): Promise<GatewayUsageSnapshot | null> {
	const { data, error } = await client.rpc(
		"gateway_marketing_uptime_tokens",
		{
			hours_window: hours,
		}
	);

	if (error) {
		throw new Error(
			error.message ?? "Failed to load gateway usage snapshot"
		);
	}

	const rows = Array.isArray(data) ? data : data ? [data] : [];
	return mapUsageSnapshotRow(rows[0] as GatewayUsageSnapshotRow | null);
}

function applyUsageSnapshot(
	metrics: GatewayMarketingMetrics,
	snapshot: GatewayUsageSnapshot | null
): GatewayMarketingMetrics {
	if (!snapshot) return metrics;
	return {
		...metrics,
		summary: {
			...metrics.summary,
			tokens24h:
				typeof snapshot.totalTokens === "number"
					? snapshot.totalTokens
					: metrics.summary.tokens24h,
		},
	};
}

function attachMetricsError(
	metrics: GatewayMarketingMetrics,
	...errors: Array<string | undefined>
): GatewayMarketingMetrics {
	if (metrics.error) return metrics;
	const message = errors.find((err) => typeof err === "string" && err.length);
	if (!message) return metrics;
	return {
		...metrics,
		error: message,
	};
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
	const sum = values.reduce((acc, v) => acc + v, 0);
	return sum / values.length;
}

function bucketStartISO(date: Date): string {
	const bucket = new Date(date);
	bucket.setMinutes(0, 0, 0);
	return bucket.toISOString();
}

async function fetchRequests(
	client: SupabaseClient,
	hours = HOURS_DEFAULT,
	now = new Date()
): Promise<RawGatewayRequest[]> {
	const rows: RawGatewayRequest[] = [];
	const toIso = now.toISOString();
	const fromIso = new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();

	for (let page = 0; page < MAX_PAGES; page++) {
		const from = page * PAGE_SIZE;
		const to = from + PAGE_SIZE - 1;
		const { data, error } = await client
			.from("gateway_requests")
			.select(
				"created_at, success, latency_ms, generation_ms, usage, provider, model_id, error_code, status_code"
			)
			.gte("created_at", fromIso)
			.lte("created_at", toIso)
			.order("created_at", { ascending: true })
			.range(from, to);

		if (error) throw new Error(error.message ?? "Failed to load gateway data");
		if (!data?.length) break;

		rows.push(
			...(data as RawGatewayRequest[]).filter((row) =>
				Boolean(row?.created_at)
			)
		);

		if (data.length < PAGE_SIZE) break;
	}

	return rows;
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

async function fetchActiveGatewayModels(
	client: SupabaseClient,
	now = new Date()
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

	console.log("Supabase response for active gateway models:", { data, error });

	if (error) {
		throw new Error(error.message ?? "Failed to load supported models");
	}

	return (data ?? []) as ActiveProviderModelRow[];
}

function buildMetricsFromRows(
	rows: RawGatewayRequest[],
	supportedModels: ActiveProviderModelRow[],
	now = new Date(),
	hours = HOURS_DEFAULT
): GatewayMarketingMetrics {
	const buckets = new Map<
		string,
		{
			requests: number;
			success: number;
			latencies: number[];
			tokens: number;
		}
	>();

	let totalRequests = 0;
	let totalSuccess = 0;
	const allLatencies: number[] = [];
	let totalTokens = 0;
	const timelineHours =
		Number.isFinite(hours) && hours > 0 ? hours : HOURS_DEFAULT;

	for (const row of rows) {
		const createdAt = new Date(row.created_at);
		if (Number.isNaN(createdAt.getTime())) continue;

		const bucketKey = bucketStartISO(createdAt);
		const bucket =
			buckets.get(bucketKey) ??
			{ requests: 0, success: 0, latencies: [], tokens: 0 };

		bucket.requests += 1;
		totalRequests += 1;

		const success = isSuccessfulForUptime(row);
		if (success) {
			bucket.success += 1;
			totalSuccess += 1;
		}

		const latencyCandidate =
			row.generation_ms ?? undefined;
		if (latencyCandidate != null && Number.isFinite(Number(latencyCandidate))) {
			const latency = Number(latencyCandidate);
			bucket.latencies.push(latency);
			allLatencies.push(latency);
		}

		const tokens = getUsageTotalTokens(row.usage);
		if (tokens > 0) {
			bucket.tokens += tokens;
			totalTokens += tokens;
		}

		buckets.set(bucketKey, bucket);
	}

	const uptimeSeries: GatewayTimeseriesPoint[] = [];
	const latencySeries: GatewayTimeseriesPoint[] = [];
	const throughputSeries: GatewayTimeseriesPoint[] = [];

	const sortedKeys = Array.from(buckets.keys()).sort(
		(a, b) => new Date(a).getTime() - new Date(b).getTime()
	);

	const timeline: Array<{
		timestamp: string;
		hoursAgo: number;
		data: {
			requests: number;
			success: number;
			latencies: number[];
			tokens: number;
		};
	}> = [];

	for (let h = timelineHours - 1; h >= 0; h--) {
		const timestamp = bucketStartISO(
			new Date(now.getTime() - h * 60 * 60 * 1000)
		);
		const bucket =
			buckets.get(timestamp) ?? {
				requests: 0,
				success: 0,
				latencies: [],
				tokens: 0,
			};
		timeline.push({ timestamp, hoursAgo: h, data: bucket });
	}

	for (const entry of timeline) {
		const data = entry.data;
		const uptime =
			data.requests > 0 ? (data.success / data.requests) * 100 : null;
		const p95 = percentile(data.latencies, 0.95);
		const p50 = percentile(data.latencies, 0.5);
		const avg = average(data.latencies);
		const requestsPerMin = data.requests / 60;
		const tokensPerMin = data.tokens / 60;

		const point: GatewayTimeseriesPoint = {
			timestamp: entry.timestamp,
			requests: data.requests,
			uptimePct: uptime,
			p50Ms: p50,
			p95Ms: p95,
			avgMs: avg,
			requestsPerMin,
			tokensPerMin,
			hoursAgo: entry.hoursAgo,
		};

		uptimeSeries.push(point);
		latencySeries.push(point);
		throughputSeries.push(point);
	}

	const uptimePct =
		totalRequests > 0 ? (totalSuccess / totalRequests) * 100 : null;
	const latencyP95 = percentile(allLatencies, 0.95);
	const latencyP50 = percentile(allLatencies, 0.5);
	const latencyAvg = average(allLatencies);

	const spanMinutes =
		Number.isFinite(hours) && hours > 0
			? hours * 60
			: Math.max(
				1,
				Math.abs(
					new Date(sortedKeys[sortedKeys.length - 1] ?? now).getTime() -
					new Date(sortedKeys[0] ?? now).getTime()
				) /
				60000
			);
	const requestsPerMinAvg =
		totalRequests > 0 && spanMinutes > 0 ? totalRequests / spanMinutes : null;

	const modelIds = new Set<string>();
	const providerIds = new Set<string>();
	for (const row of supportedModels) {
		if (row.api_model_id) modelIds.add(row.api_model_id);
		if (row.provider_id) providerIds.add(row.provider_id);
	}

	return {
		summary: {
			uptimePct,
			latencyP95Ms: latencyP95,
			latencyP50Ms: latencyP50,
			latencyAvgMs: latencyAvg,
			requests24h: totalRequests,
			successful24h: totalSuccess,
			tokens24h: totalTokens,
			requestsPerMinAvg,
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
		fallback: false,
	};
}

function buildFallbackMetrics(
	supportedModels: ActiveProviderModelRow[],
	now = new Date(),
	hours = HOURS_DEFAULT,
	error?: string
): GatewayMarketingMetrics {
	const uptimeSeries: GatewayTimeseriesPoint[] = [];
	const latencySeries: GatewayTimeseriesPoint[] = [];
	const throughputSeries: GatewayTimeseriesPoint[] = [];

	for (let h = hours - 1; h >= 0; h--) {
		const ts = new Date(now.getTime() - h * 60 * 60 * 1000);
		const point: GatewayTimeseriesPoint = {
			timestamp: bucketStartISO(ts),
			requests: 0,
			uptimePct: 100,
			p50Ms: null,
			p95Ms: null,
			avgMs: null,
			requestsPerMin: 0,
			tokensPerMin: 0,
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
			uptime: uptimeSeries,
			latency: latencySeries,
			throughput: throughputSeries,
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
	hours = HOURS_DEFAULT
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
	cacheTag("data:gateway_requests");

	const now = new Date();
	const client = createAdminClient();

	let supportedRows: ActiveProviderModelRow[] = [];
	let supportedError: string | undefined;
	try {
		supportedRows = await fetchActiveGatewayModels(client, now);
	} catch (err: any) {
		supportedError = String(err?.message ?? err);
		supportedRows = [];
	}

	let usageSnapshot: GatewayUsageSnapshot | null = null;
	let usageSnapshotError: string | undefined;
	try {
		usageSnapshot = await fetchGatewayUsageSnapshot(client, hours);
	} catch (err: any) {
		usageSnapshotError = String(err?.message ?? err);
	}

	try {
		const rows = await fetchRequests(client, hours, now);
		if (!rows.length) {
			const fallback = applyUsageSnapshot(
				buildFallbackMetrics(
					supportedRows,
					now,
					hours,
					"No recent gateway traffic available."
				),
				usageSnapshot
			);
			return attachMetricsError(fallback, supportedError, usageSnapshotError);
		}

		const metrics = applyUsageSnapshot(
			buildMetricsFromRows(rows, supportedRows, now, hours),
			usageSnapshot
		);
		return attachMetricsError(metrics, supportedError, usageSnapshotError);
	} catch (err: any) {
		const errorMessage =
			supportedError ??
			usageSnapshotError ??
			String(
				err?.message ??
				"Unable to load live gateway metrics; falling back to synthetic data."
			);
		const fallback = applyUsageSnapshot(
			buildFallbackMetrics(supportedRows, now, hours, errorMessage),
			usageSnapshot
		);
		return attachMetricsError(fallback, supportedError, usageSnapshotError);
	}
}
