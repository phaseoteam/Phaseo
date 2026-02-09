import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";

type RawGatewayRequest = {
	created_at: string;
	provider: string | null;
	success: boolean | number | string | null;
	latency_ms?: number | null;
	throughput?: number | null;
};

export type ProviderRuntimeStats = {
	providerId: string;
	latencyMs30m: number | null;
	throughput30m: number | null;
	uptimePct3d: number | null;
	requests30m: number;
	requests3d: number;
	successful3d: number;
};

export type ProviderRuntimeStatsMap = Record<string, ProviderRuntimeStats>;

const LOOKBACK_HOURS = 72;
const THROUGHPUT_WINDOW_MINUTES = 30;
const PAGE_SIZE = 1000;
const MAX_PAGES = 20;

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

function isSuccess(value: RawGatewayRequest["success"]): boolean {
	return (
		value === true ||
		value === 1 ||
		value === "1" ||
		value === "true" ||
		value === "t"
	);
}

export async function getModelProviderRuntimeStats(args: {
	modelId: string;
	providerIds: string[];
	modelAliases: string[];
}): Promise<ProviderRuntimeStatsMap> {
	const providerIds = Array.from(new Set(args.providerIds.filter(Boolean))).sort((a, b) =>
		a.localeCompare(b)
	);
	const modelAliases = Array.from(
		new Set([args.modelId, ...args.modelAliases].filter(Boolean))
	).sort((a, b) => a.localeCompare(b));

	if (!providerIds.length || !modelAliases.length) return {};

	const client = createAdminClient();
	const fromIso = new Date(
		Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000
	).toISOString();

	const rows: RawGatewayRequest[] = [];
	try {
		for (let page = 0; page < MAX_PAGES; page++) {
			const from = page * PAGE_SIZE;
			const to = from + PAGE_SIZE - 1;
			const { data, error } = await client
				.from("gateway_requests")
				.select("created_at, provider, success, latency_ms, throughput")
				.in("provider", providerIds)
				.in("model_id", modelAliases)
				.gte("created_at", fromIso)
				.order("created_at", { ascending: false })
				.range(from, to);

			if (error) {
				throw new Error(
					error.message ?? "Failed to load model provider runtime stats"
				);
			}

			if (!data?.length) break;
			rows.push(...(data as RawGatewayRequest[]));
			if (data.length < PAGE_SIZE) break;
		}
	} catch (error) {
		console.warn("Failed to fetch model provider runtime stats", {
			modelId: args.modelId,
			error,
		});
		return {};
	}

	const nowMs = Date.now();
	const min30mMs = nowMs - THROUGHPUT_WINDOW_MINUTES * 60 * 1000;
	const min3dMs = nowMs - LOOKBACK_HOURS * 60 * 60 * 1000;

	const aggregates = new Map<
		string,
		{
			latencies30m: number[];
			throughputs30m: number[];
			requests30m: number;
			requests3d: number;
			successful3d: number;
		}
	>();

	for (const providerId of providerIds) {
		aggregates.set(providerId, {
			latencies30m: [],
			throughputs30m: [],
			requests30m: 0,
			requests3d: 0,
			successful3d: 0,
		});
	}

	for (const row of rows) {
		const providerId = row.provider;
		if (!providerId) continue;
		const entry = aggregates.get(providerId);
		if (!entry) continue;

		const createdAtMs = new Date(row.created_at).getTime();
		if (!Number.isFinite(createdAtMs) || createdAtMs < min3dMs) continue;

		entry.requests3d += 1;
		if (isSuccess(row.success)) entry.successful3d += 1;

		if (createdAtMs >= min30mMs) {
			entry.requests30m += 1;
			if (row.latency_ms != null && Number.isFinite(Number(row.latency_ms))) {
				entry.latencies30m.push(Number(row.latency_ms));
			}
			if (row.throughput != null && Number.isFinite(Number(row.throughput))) {
				entry.throughputs30m.push(Number(row.throughput));
			}
		}
	}

	const out: ProviderRuntimeStatsMap = {};
	for (const providerId of providerIds) {
		const entry = aggregates.get(providerId);
		if (!entry) continue;
		out[providerId] = {
			providerId,
			latencyMs30m: percentile(entry.latencies30m, 0.5),
			throughput30m: percentile(entry.throughputs30m, 0.5),
			uptimePct3d:
				entry.requests3d > 0
					? (entry.successful3d / entry.requests3d) * 100
					: null,
			requests30m: entry.requests30m,
			requests3d: entry.requests3d,
			successful3d: entry.successful3d,
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
	cacheTag("data:gateway_requests");
	cacheTag(`data:gateway_requests:model:${args.modelId}`);

	return getModelProviderRuntimeStats(args);
}
