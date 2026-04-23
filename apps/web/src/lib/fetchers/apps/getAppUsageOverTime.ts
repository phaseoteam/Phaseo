import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";

export type RangeKey = "1h" | "1d" | "1w" | "4w" | "1m" | "1y";
const PAGE_SIZE = 5000;
const MAX_SHORT_RANGE_PAGES = 8;
const MAX_LONG_RANGE_PAGES = 6;
const USAGE_FETCH_DEBUG_ENABLED = process.env.DEBUG_GATEWAY_USAGE_FETCHERS === "1";

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

type AppRequestRow = {
	created_at: string;
	usage: unknown;
	cost_nanos: number | null;
	model_id: string | null;
	canonical_model_id?: string | null;
	provider: string | null;
	success: boolean | null;
};

function logUsageFetch(stage: string, payload: Record<string, unknown>): void {
	if (!USAGE_FETCH_DEBUG_ENABLED) return;
	console.info(`[gateway-usage-fetchers] ${stage}`, payload);
}

function usesDailyRollup(range: RangeKey): boolean {
	return range === "1w" || range === "4w" || range === "1m" || range === "1y";
}

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

function bucketIso15m(createdAt: string): string | null {
	const date = new Date(createdAt);
	if (!Number.isFinite(date.getTime())) return null;
	const mins = date.getUTCMinutes();
	date.setUTCMinutes(mins - (mins % 15), 0, 0);
	return date.toISOString();
}

function bucketIsoDay(createdAt: string): string | null {
	const date = new Date(createdAt);
	if (!Number.isFinite(date.getTime())) return null;
	date.setUTCHours(0, 0, 0, 0);
	return date.toISOString();
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
	const rows: AppUsageRow[] = [];
	const useDaily = usesDailyRollup(range);
	const fromDay = new Date(fromDate);
	fromDay.setUTCHours(0, 0, 0, 0);
	const fromDayIso = fromDay.toISOString();
	let hitPageCap = true;
	let pagesFetched = 0;
	let hadError = false;
	const maxPages = useDaily ? MAX_LONG_RANGE_PAGES : MAX_SHORT_RANGE_PAGES;
	const aggregates = new Map<
		string,
		{
			created_at: string;
			model_id: string;
			provider: string;
			cost_nanos: number;
			total_tokens: number;
			requests: number;
			successful_requests: number;
		}
	>();

	for (
		let page = 0, offset = 0;
		page < maxPages;
		page += 1, offset += PAGE_SIZE
	) {
		pagesFetched += 1;
		const to = offset + PAGE_SIZE - 1;
		const query = supabase
			.from("gateway_requests")
			.select("created_at, usage, cost_nanos, model_id, canonical_model_id, provider, success")
			.eq("app_id", appId)
			.gte("created_at", useDaily ? fromDayIso : from)
			.lte("created_at", nowIso)
			.order("created_at", { ascending: true })
			.range(offset, to);
		const { data, error } = await query;

		if (error) {
			hadError = true;
			hitPageCap = false;
			console.error(
				`Error fetching app usage ${useDaily ? "daily" : "15m"} raw rows:`,
				error,
			);
			return [];
		}
		if (!Array.isArray(data) || data.length === 0) {
			hitPageCap = false;
			break;
		}

		for (const row of data as AppRequestRow[]) {
			const modelId =
				String(row?.canonical_model_id ?? "").trim() ||
				String(row?.model_id ?? "").trim();
			if (!modelId) continue;

			const createdAtBucket = useDaily
				? bucketIsoDay(String(row?.created_at ?? ""))
				: bucketIso15m(String(row?.created_at ?? ""));
			if (!createdAtBucket) continue;

			const key = `${createdAtBucket}::${modelId}`;
			const current = aggregates.get(key) ?? {
				created_at: createdAtBucket,
				model_id: modelId,
				provider: String(row?.provider ?? ""),
				cost_nanos: 0,
				total_tokens: 0,
				requests: 0,
				successful_requests: 0,
			};

			current.requests += 1;
			if (row?.success) current.successful_requests += 1;
			current.total_tokens += getTotalTokensFromUsage(row?.usage);
			const costNanos = Number(row?.cost_nanos ?? 0);
			if (Number.isFinite(costNanos)) current.cost_nanos += costNanos;
			aggregates.set(key, current);
		}

		if (data.length < PAGE_SIZE) {
			hitPageCap = false;
			break;
		}
	}

	if (aggregates.size > 0 && hitPageCap) {
		console.warn(
			`App usage rows may be truncated for app=${appId} range=${range} mode=${useDaily ? "daily" : "15m"}`,
		);
	}
	logUsageFetch("app_usage_over_time_query", {
		appId,
		range,
		mode: useDaily ? "raw_daily" : "raw_15m",
		pagesFetched,
		rows: aggregates.size,
		hitPageCap,
		hadError,
		maxPages,
		pageSize: PAGE_SIZE,
		fromIso: useDaily ? fromDayIso : from,
		toIso: useDaily ? nowIso : nowIso,
	});

	for (const value of aggregates.values()) {
		rows.push({
			created_at: value.created_at,
			usage: { total_tokens: value.total_tokens },
			cost_nanos: value.cost_nanos,
			model_id: value.model_id,
			provider: value.provider,
			success: value.successful_requests > 0,
			requests: value.requests,
			successful_requests: value.successful_requests,
		});
	}
	rows.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.model_id.localeCompare(b.model_id));

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
