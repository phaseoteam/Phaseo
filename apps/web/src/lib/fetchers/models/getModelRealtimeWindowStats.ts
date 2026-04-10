import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";

const DEFAULT_WINDOW_MINUTES = 30;
const PAGE_SIZE = 5000;

type GatewayRequestRow = {
	latency_ms: number | string | null;
	throughput: number | string | null;
	generation_ms: number | string | null;
	usage: unknown;
};

export type ModelRealtimeWindowStats = {
	requestsInWindow: number;
	latencyP50Ms: number | null;
	throughputP50TokPerSec: number | null;
};

function toFiniteNumber(value: unknown): number | null {
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

function extractOutputTokens(usage: unknown): number | null {
	if (!usage || typeof usage !== "object") return null;
	const usageRecord = usage as Record<string, unknown>;
	const keysInPriorityOrder = [
		"output_tokens",
		"completion_tokens",
		"generated_tokens",
		"response_tokens",
		"outputTokens",
		"completionTokens",
		"total_tokens",
		"totalTokens",
	];
	for (const key of keysInPriorityOrder) {
		const value = toFiniteNumber(usageRecord[key]);
		if (value != null && value > 0) return value;
	}
	return null;
}

async function getModelAliases(
	client: ReturnType<typeof createAdminClient>,
	modelId: string,
): Promise<string[]> {
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

	for (const query of [byModelId, byApiModelId]) {
		if (query.error) {
			console.warn("[compare] failed to load model aliases for realtime stats", {
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

async function fetchGatewayRequestsWindow(
	client: ReturnType<typeof createAdminClient>,
	modelIds: string[],
	fromIso: string,
	toIso: string,
): Promise<GatewayRequestRow[]> {
	const rows: GatewayRequestRow[] = [];

	for (let offset = 0; ; offset += PAGE_SIZE) {
		const to = offset + PAGE_SIZE - 1;
		const { data, error } = await client
			.from("gateway_requests")
			.select("latency_ms, throughput, generation_ms, usage")
			.in("model_id", modelIds)
			.gte("created_at", fromIso)
			.lte("created_at", toIso)
			.order("created_at", { ascending: true })
			.range(offset, to);

		if (error) {
			throw new Error(error.message ?? "Failed to fetch realtime model stats");
		}
		if (!Array.isArray(data) || data.length === 0) break;
		rows.push(...(data as GatewayRequestRow[]));
		if (data.length < PAGE_SIZE) break;
	}

	return rows;
}

export async function getModelRealtimeWindowStats(
	modelId: string,
	windowMinutes: number = DEFAULT_WINDOW_MINUTES,
): Promise<ModelRealtimeWindowStats> {
	const windowSizeMinutes =
		Number.isFinite(windowMinutes) && windowMinutes > 0
			? Math.round(windowMinutes)
			: DEFAULT_WINDOW_MINUTES;

	const client = createAdminClient();
	const aliases = await getModelAliases(client, modelId);
	if (!aliases.length) {
		return {
			requestsInWindow: 0,
			latencyP50Ms: null,
			throughputP50TokPerSec: null,
		};
	}

	const now = new Date();
	const from = new Date(now.getTime() - windowSizeMinutes * 60_000);

	let rows: GatewayRequestRow[] = [];
	try {
		rows = await fetchGatewayRequestsWindow(
			client,
			aliases,
			from.toISOString(),
			now.toISOString(),
		);
	} catch (error) {
		console.warn("[compare] failed to fetch realtime model usage window", {
			modelId,
			error,
		});
		return {
			requestsInWindow: 0,
			latencyP50Ms: null,
			throughputP50TokPerSec: null,
		};
	}

	const latencies: number[] = [];
	const throughputs: number[] = [];

	for (const row of rows) {
		const latencyMs = toFiniteNumber(row.latency_ms);
		if (latencyMs != null && latencyMs > 0) {
			latencies.push(latencyMs);
		}

		const rawThroughput = toFiniteNumber(row.throughput);
		if (rawThroughput != null && rawThroughput > 0) {
			throughputs.push(rawThroughput);
			continue;
		}

		const generationMs = toFiniteNumber(row.generation_ms);
		const outputTokens = extractOutputTokens(row.usage);
		if (
			generationMs != null &&
			generationMs > 0 &&
			outputTokens != null &&
			outputTokens > 0
		) {
			throughputs.push((outputTokens * 1000) / generationMs);
		}
	}

	return {
		requestsInWindow: rows.length,
		latencyP50Ms: percentile(latencies, 0.5),
		throughputP50TokPerSec: percentile(throughputs, 0.5),
	};
}

export async function getModelRealtimeWindowStatsCached(
	modelId: string,
	windowMinutes: number = DEFAULT_WINDOW_MINUTES,
): Promise<ModelRealtimeWindowStats> {
	"use cache";

	cacheLife("minutes");
	cacheTag("data:gateway_requests");
	cacheTag("data:gateway_usage_rollups");
	cacheTag(`data:gateway_requests:model:${modelId}`);

	return getModelRealtimeWindowStats(modelId, windowMinutes);
}
