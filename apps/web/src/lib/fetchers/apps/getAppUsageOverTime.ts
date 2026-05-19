import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";

export type RangeKey = "1h" | "1d" | "1w" | "4w" | "1m" | "1y";
const PAGE_SIZE = 5000;
const MAX_SHORT_RANGE_PAGES = 8;
const MAX_LONG_RANGE_PAGES = 6;
const USAGE_FETCH_DEBUG_ENABLED = process.env.DEBUG_GATEWAY_USAGE_FETCHERS === "1";

function isMissingUsageRollupRelation(error: unknown): boolean {
	const message =
		typeof error === "object" && error && "message" in error
			? String((error as { message?: unknown }).message ?? "")
			: String(error ?? "");

	return (
		message.includes('relation "public.gateway_usage_rollup_daily_app_model" does not exist') ||
		message.includes('relation "public.gateway_usage_rollup_15m_app_model" does not exist')
	);
}

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

function logUsageFetch(stage: string, payload: Record<string, unknown>): void {
	if (!USAGE_FETCH_DEBUG_ENABLED) return;
	console.info(`[gateway-usage-fetchers] ${stage}`, payload);
}

function usesDailyRollup(range: RangeKey): boolean {
	return range === "1w" || range === "4w" || range === "1m" || range === "1y";
}

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

	const fromDate = fromForRange(range);
	const from = fromDate.toISOString();
	const nowIso = new Date().toISOString();
	const nowDay = nowIso.slice(0, 10);
	const rows: AppUsageRow[] = [];
	const useDaily = usesDailyRollup(range);
	const fromDay = new Date(fromDate);
	fromDay.setUTCHours(0, 0, 0, 0);
	const fromDayIso = fromDay.toISOString().slice(0, 10);
	let hitPageCap = true;
	let pagesFetched = 0;
	let hadError = false;
	const maxPages = useDaily ? MAX_LONG_RANGE_PAGES : MAX_SHORT_RANGE_PAGES;

	for (
		let page = 0, offset = 0;
		page < maxPages;
		page += 1, offset += PAGE_SIZE
	) {
		pagesFetched += 1;
		const to = offset + PAGE_SIZE - 1;
		const query = useDaily
			? supabase
					.from("gateway_usage_rollup_daily_app_model")
					.select(
						"day_bucket, canonical_model_id, requests, success_requests, total_tokens, total_cost_nanos",
					)
					.eq("app_id", appId)
					.gte("day_bucket", fromDayIso)
					.lte("day_bucket", nowDay)
					.order("day_bucket", { ascending: true })
					.range(offset, to)
			: supabase
					.from("gateway_usage_rollup_15m_app_model")
					.select(
						"bucket_15m, canonical_model_id, requests, success_requests, total_tokens, total_cost_nanos",
					)
					.eq("app_id", appId)
					.gte("bucket_15m", from)
					.lte("bucket_15m", nowIso)
					.order("bucket_15m", { ascending: true })
					.range(offset, to);
		const { data, error } = await query;

		if (error) {
			if (isMissingUsageRollupRelation(error)) {
				return getAppUsageFromGatewayRequests(supabase, appId, from, nowIso);
			}
			hadError = true;
			hitPageCap = false;
			console.error(
				`Error fetching app usage ${useDaily ? "daily" : "15m"} rollups:`,
				error,
			);
			return [];
		}
		if (!Array.isArray(data) || data.length === 0) {
			hitPageCap = false;
			break;
		}

		for (const row of data) {
			const createdAt = String(
				useDaily ? (row as any)?.day_bucket ?? "" : (row as any)?.bucket_15m ?? "",
			).trim();
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

		if (data.length < PAGE_SIZE) {
			hitPageCap = false;
			break;
		}
	}

	if (rows.length > 0 && hitPageCap) {
		console.warn(
			`App usage rows may be truncated for app=${appId} range=${range} mode=${useDaily ? "daily" : "15m"}`,
		);
	}
	logUsageFetch("app_usage_over_time_query", {
		appId,
		range,
		mode: useDaily ? "daily" : "15m",
		pagesFetched,
		rows: rows.length,
		hitPageCap,
		hadError,
		maxPages,
		pageSize: PAGE_SIZE,
		fromIso: useDaily ? fromDayIso : from,
		toIso: useDaily ? nowDay : nowIso,
	});

	return rows;
}

async function getAppUsageFromGatewayRequests(
	supabase: Awaited<ReturnType<typeof createAdminClient>>,
	appId: string,
	from: string,
	to: string,
): Promise<AppUsageRow[]> {
	const rows: AppUsageRow[] = [];

	for (let offset = 0; ; offset += PAGE_SIZE) {
		const { data, error } = await supabase
			.from("gateway_requests")
			.select("created_at, usage, cost_nanos, model_id, provider, success")
			.eq("app_id", appId)
			.gte("created_at", from)
			.lte("created_at", to)
			.order("created_at", { ascending: true })
			.range(offset, offset + PAGE_SIZE - 1);

		if (error) {
			console.error("Error fetching app usage from gateway_requests:", error);
			return [];
		}

		const page = (data ?? []) as AppUsageRow[];
		rows.push(...page);

		if (page.length < PAGE_SIZE) {
			break;
		}
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
