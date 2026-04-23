import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";

const PAGE_SIZE = 5000;

export type ModelStats = {
    model_id: string;
    model_name: string;
    request_count: number;
    median_latency_ms: number | null;
    median_throughput: number | null;
    total_tokens?: number | null;
};

type ProviderRequestRow = {
	model_id: string | null;
	canonical_model_id: string | null;
	usage: unknown;
	latency_ms: number | null;
	throughput: number | null;
};

function toRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object") return null;
	return value as Record<string, unknown>;
}

function readUsageInt(usage: Record<string, unknown> | null, key: string): number {
	if (!usage) return 0;
	const raw = usage[key];
	const parsed = Number(raw);
	return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function getTotalTokensFromUsage(usageValue: unknown): number {
	const usage = toRecord(usageValue);
	const directTotal =
		readUsageInt(usage, "total_tokens") || readUsageInt(usage, "tokens");
	if (directTotal > 0) return directTotal;

	return (
		readUsageInt(usage, "input_tokens") +
		readUsageInt(usage, "output_tokens") +
		readUsageInt(usage, "prompt_tokens") +
		readUsageInt(usage, "completion_tokens")
	);
}

export async function getTopModels(
    apiProviderId: string,
    includeHidden: boolean,
    count: number = 6
): Promise<ModelStats[]> {
    const supabase = createAdminClient();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    try {
        const aggregate = new Map<
            string,
            {
                requestCount: number;
                totalTokens: number;
                latencySum: number;
                latencySamples: number;
                throughputSum: number;
                throughputSamples: number;
            }
        >();

        for (let offset = 0; ; offset += PAGE_SIZE) {
            const { data, error } = await supabase
                .from("gateway_requests")
                .select("model_id, canonical_model_id, usage, latency_ms, throughput")
                .eq("provider", apiProviderId)
                .gte("created_at", since)
                .order("created_at", { ascending: true })
                .range(offset, offset + PAGE_SIZE - 1);

            if (error) {
                console.error("Error fetching top models:", error);
                return [];
            }
            if (!Array.isArray(data) || data.length === 0) break;

            for (const row of data as ProviderRequestRow[]) {
                const modelId =
                    String(row?.canonical_model_id ?? "").trim() ||
                    String(row?.model_id ?? "").trim();
                if (!modelId) continue;

                const current = aggregate.get(modelId) ?? {
                    requestCount: 0,
                    totalTokens: 0,
                    latencySum: 0,
                    latencySamples: 0,
                    throughputSum: 0,
                    throughputSamples: 0,
                };

                current.requestCount += 1;
                current.totalTokens += getTotalTokensFromUsage(row?.usage);
                const latency = Number(row?.latency_ms ?? 0);
                if (Number.isFinite(latency) && latency > 0) {
                    current.latencySum += latency;
                    current.latencySamples += 1;
                }
                const throughput = Number(row?.throughput ?? 0);
                if (Number.isFinite(throughput) && throughput > 0) {
                    current.throughputSum += throughput;
                    current.throughputSamples += 1;
                }
                aggregate.set(modelId, current);
            }

            if (data.length < PAGE_SIZE) break;
        }

        if (aggregate.size === 0) return [];

        const modelIds = Array.from(aggregate.keys());
        const { data: modelMetaRows } = await supabase
            .from("data_models")
            .select("model_id, name, hidden")
            .in("model_id", modelIds);

        const modelMetaById = new Map(
            (modelMetaRows ?? []).map((row: any) => [String(row?.model_id ?? ""), row] as const),
        );

        let rows = modelIds.map((modelId) => {
            const stats = aggregate.get(modelId)!;
            const meta = modelMetaById.get(modelId) as any;
            return {
                model_id: modelId,
                model_name: String(meta?.name ?? modelId),
                hidden: Boolean(meta?.hidden),
                request_count: stats.requestCount,
                total_tokens: stats.totalTokens,
                median_latency_ms:
                    stats.latencySamples > 0 ? stats.latencySum / stats.latencySamples : null,
                median_throughput:
                    stats.throughputSamples > 0
                        ? stats.throughputSum / stats.throughputSamples
                        : null,
            };
        });

        if (!includeHidden) {
            rows = rows.filter((row) => !row.hidden);
        }

        rows.sort((a, b) => b.request_count - a.request_count);
        rows = rows.slice(0, Math.max(1, count));

        return rows.map((row: any) => ({
            model_id: row.model_id,
            model_name: row.model_name,
            request_count: Number(row.request_count),
            total_tokens:
                row.total_tokens != null ? Number(row.total_tokens) : null,
            median_latency_ms: row.median_latency_ms
                ? Math.round(Number(row.median_latency_ms))
                : null,
            median_throughput: row.median_throughput
                ? Math.round(Number(row.median_throughput) * 100) / 100
                : null,
        }));
    } catch (err) {
        console.error("Unexpected error fetching top models:", err);
        return [];
    }
}

export async function getTopModelsCached(
    apiProviderId: string,
    includeHidden: boolean,
    count: number = 6
): Promise<ModelStats[]> {
	"use cache";

	cacheLife("hours");
	cacheTag("data:gateway_usage_rollups");
	cacheTag(`data:gateway_usage_rollups:provider:${apiProviderId}`);
	cacheTag("data:top_models");
	cacheTag(`data:top_models:provider:${apiProviderId}`);
	cacheTag(`data:api_providers:${apiProviderId}`);

    console.log(`[fetch] HIT JSON for top models - ${apiProviderId}`);
    return getTopModels(apiProviderId, includeHidden, count);
}
