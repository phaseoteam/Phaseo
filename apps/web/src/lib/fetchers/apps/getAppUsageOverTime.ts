import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";

export type RangeKey = "1h" | "1d" | "1w" | "4w" | "1m" | "1y";
const PAGE_SIZE = 5000;

function fromForRange(key: RangeKey): Date {
	const now = new Date();
	const d = new Date(now);
	if (key === "1h") d.setHours(now.getHours() - 1);
	else if (key === "1d") d.setDate(now.getDate() - 1);
	else if (key === "1w") d.setDate(now.getDate() - 7);
	else if (key === "4w") d.setDate(now.getDate() - 28);
	else if (key === "1m") d.setMonth(now.getMonth() - 1);
	else if (key === "1y") d.setFullYear(now.getFullYear() - 1);
	return d;
}

export type AppUsageRow = {
	created_at: string;
	usage: any;
	cost_nanos: number;
	model_id: string;
	provider: string;
	success: boolean;
	requests?: number;
	successful_requests?: number;
};

export async function getAppUsageOverTime(
	appId: string,
	range: RangeKey = "4w"
): Promise<AppUsageRow[]> {
	"use cache";

	cacheLife("days");
	cacheTag("data:app_usage");
	cacheTag(`data:app_usage:${appId}`);
	cacheTag(`data:app_usage:${appId}:${range}`);

	const supabase = await createAdminClient();

	const from = fromForRange(range).toISOString();
	const nowIso = new Date().toISOString();
	const rows: AppUsageRow[] = [];

	for (let offset = 0; ; offset += PAGE_SIZE) {
		const to = offset + PAGE_SIZE - 1;
		const { data, error } = await supabase
			.from("gateway_usage_rollup_15m_app_model")
			.select(
				"bucket_15m, canonical_model_id, requests, success_requests, total_tokens, total_cost_nanos",
			)
			.eq("app_id", appId)
			.gte("bucket_15m", from)
			.lte("bucket_15m", nowIso)
			.order("bucket_15m", { ascending: true })
			.range(offset, to);

		if (error) {
			console.error("Error fetching app usage rollups:", error);
			return [];
		}
		if (!Array.isArray(data) || data.length === 0) break;

		for (const row of data) {
			const createdAt = String((row as any)?.bucket_15m ?? "").trim();
			const modelId = String((row as any)?.canonical_model_id ?? "").trim();
			const requests = Number((row as any)?.requests ?? 0);
			const successRequests = Number((row as any)?.success_requests ?? 0);
			const totalTokens = Number((row as any)?.total_tokens ?? 0);
			const totalCostNanos = Number((row as any)?.total_cost_nanos ?? 0);

			if (!createdAt || !modelId) continue;

			rows.push({
				created_at: createdAt,
				usage: { total_tokens: Number.isFinite(totalTokens) ? totalTokens : 0 },
				cost_nanos: Number.isFinite(totalCostNanos) ? totalCostNanos : 0,
				model_id: modelId,
				provider: "",
				success: (Number.isFinite(successRequests) ? successRequests : 0) > 0,
				requests: Number.isFinite(requests) ? Math.max(0, requests) : 0,
				successful_requests: Number.isFinite(successRequests)
					? Math.max(0, successRequests)
					: 0,
			});
		}

		if (data.length < PAGE_SIZE) break;
	}

	return rows;
}

export async function getRecentAppRequests(
	appId: string,
	limit = 10,
): Promise<AppUsageRow[]> {
	"use cache";

	cacheLife("minutes");
	cacheTag("data:app_usage");
	cacheTag(`data:app_usage:${appId}`);
	cacheTag(`data:app_usage:${appId}:recent`);

	const supabase = await createAdminClient();
	const safeLimit = Math.max(1, Math.min(100, Math.round(limit)));

	const { data, error } = await supabase
		.from("gateway_requests")
		.select("created_at, usage, cost_nanos, model_id, provider, success")
		.eq("app_id", appId)
		.order("created_at", { ascending: false })
		.limit(safeLimit);

	if (error) {
		console.error("Error fetching recent app requests:", error);
		return [];
	}

	return (data ?? []) as AppUsageRow[];
}
