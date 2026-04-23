"use cache";

import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";
import { getTopApps } from "./top-apps";

const DEFAULT_DAYS = 30;
const DEFAULT_TOP_APPS = 20;
const PAGE_SIZE = 5000;
const MAX_FILTERED_PAGES = 8;
const MAX_FALLBACK_PAGES = 4;
const USAGE_FETCH_DEBUG_ENABLED = process.env.DEBUG_GATEWAY_USAGE_FETCHERS === "1";

type ProviderAppRollupRow = {
	bucket_15m: string;
	app_id: string | null;
	total_tokens: number | null;
};

type ProviderAppRequestRow = {
	created_at: string;
	app_id: string | null;
	usage: unknown;
};

type AppMetaRow = {
	id: string;
	title: string | null;
	url: string | null;
	image_url: string | null;
};

export type ProviderAppSeriesApp = {
	appId: string;
	title: string;
	url: string | null;
	imageUrl: string | null;
	totalTokens: number;
};

export type ProviderAppSeriesPoint = {
	bucket: string;
	appId: string;
	tokens: number;
};

export type ProviderAppTokenTimeseries = {
	apps: ProviderAppSeriesApp[];
	points: ProviderAppSeriesPoint[];
};

function logUsageFetch(stage: string, payload: Record<string, unknown>): void {
	if (!USAGE_FETCH_DEBUG_ENABLED) return;
	console.info(`[gateway-usage-fetchers] ${stage}`, payload);
}

function toIsoDate(value: Date): string {
	return value.toISOString().slice(0, 10);
}

function buildDayBuckets(since: Date, days: number): string[] {
	const buckets: string[] = [];
	for (let i = 0; i < days; i++) {
		const day = new Date(since);
		day.setUTCDate(since.getUTCDate() + i);
		buckets.push(toIsoDate(day));
	}
	return buckets;
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

function isUnknownAppIdentity(appId: string, title: string | null | undefined): boolean {
	const normalizedId = appId.trim().toLowerCase();
	const normalizedTitle = (title ?? "").trim().toLowerCase();
	if (!normalizedId) return true;

	return (
		normalizedId === "unknown" ||
		normalizedId === "unknown-app" ||
		normalizedId === "unknown_app" ||
		normalizedTitle === "unknown" ||
		normalizedTitle === "unknown app"
	);
}

async function fetchProviderAppRollupRows(
	apiProviderId: string,
	sinceIso: string,
	nowIso: string,
	appIds?: string[],
	maxPages = MAX_FILTERED_PAGES,
): Promise<ProviderAppRollupRow[]> {
	const supabase = createAdminClient();
	const rows: ProviderAppRollupRow[] = [];
	let hitPageCap = true;
	let pagesFetched = 0;
	let hadError = false;

	if (Array.isArray(appIds) && appIds.length === 0) {
		logUsageFetch("provider_app_rollup_query", {
			providerId: apiProviderId,
			filteredAppIds: 0,
			pagesFetched: 0,
			rows: 0,
			hitPageCap: false,
			hadError: false,
		});
		return rows;
	}

	for (let page = 0, from = 0; page < Math.max(1, maxPages); page += 1, from += PAGE_SIZE) {
		pagesFetched += 1;
		const to = from + PAGE_SIZE - 1;
		const query = supabase
			.from("gateway_requests")
			.select("created_at, app_id, usage")
			.eq("provider", apiProviderId)
			.gte("created_at", sinceIso)
			.lte("created_at", nowIso)
			.order("created_at", { ascending: true })
			.range(from, to);
		const { data, error } = await query;

		if (error) {
			hadError = true;
			hitPageCap = false;
			console.error("Error loading provider app rollup rows for chart:", error);
			break;
		}
		if (!Array.isArray(data) || data.length === 0) {
			hitPageCap = false;
			break;
		}

		for (const row of (data ?? []) as ProviderAppRequestRow[]) {
			const appId = String(row?.app_id ?? "").trim();
			if (!appId) continue;
			if (Array.isArray(appIds) && appIds.length > 0 && !appIds.includes(appId)) {
				continue;
			}

			rows.push({
				bucket_15m: String(row.created_at ?? "").trim(),
				app_id: appId,
				total_tokens: getTotalTokensFromUsage(row.usage),
			});
		}
		if (data.length < PAGE_SIZE) {
			hitPageCap = false;
			break;
		}
	}

	if (rows.length > 0 && hitPageCap) {
		console.warn(
			`Provider app token rows may be truncated for provider=${apiProviderId} pages=${maxPages}`,
		);
	}
	logUsageFetch("provider_app_rollup_query", {
		providerId: apiProviderId,
		filteredAppIds: Array.isArray(appIds) ? appIds.length : null,
		pagesFetched,
		rows: rows.length,
		hitPageCap,
		hadError,
		maxPages,
		pageSize: PAGE_SIZE,
	});

	return rows;
}

function topAppsPeriodForDays(days: number): "day" | "week" | "month" {
	if (days <= 1) return "day";
	if (days <= 7) return "week";
	return "month";
}

async function fetchAppMetaByIds(appIds: string[]): Promise<Map<string, AppMetaRow>> {
	const map = new Map<string, AppMetaRow>();
	if (!appIds.length) return map;

	const supabase = createAdminClient();
	const { data, error } = await supabase
		.from("api_apps")
		.select("id, title, url, image_url")
		.in("id", appIds);

	if (error) {
		console.error("Error loading app metadata for timeseries:", error);
		return map;
	}

	for (const row of data ?? []) {
		const id = String((row as any)?.id ?? "").trim();
		if (!id) continue;
		map.set(id, {
			id,
			title: ((row as any)?.title as string | null) ?? null,
			url: ((row as any)?.url as string | null) ?? null,
			image_url: ((row as any)?.image_url as string | null) ?? null,
		});
	}

	return map;
}

export async function getProviderAppTokenTimeseries(
	apiProviderId: string,
	options?: {
		days?: number;
		topApps?: number;
	},
): Promise<ProviderAppTokenTimeseries> {
	const requestedDays = options?.days;
	const days =
		typeof requestedDays === "number" &&
		Number.isFinite(requestedDays) &&
		requestedDays > 0
			? Math.max(1, Math.round(requestedDays))
			: DEFAULT_DAYS;
	if (days >= 30) {
		cacheLife("days");
	} else if (days >= 7) {
		cacheLife("hours");
	} else {
		cacheLife("minutes");
	}
	cacheTag("data:gateway_usage_rollups");
	cacheTag(`data:gateway_usage_rollups:provider:${apiProviderId}`);
	cacheTag(`data:api_providers:${apiProviderId}`);

	if (!apiProviderId) return { apps: [], points: [] };

	const requestedTopApps = options?.topApps;
	const topAppsLimit =
		typeof requestedTopApps === "number" &&
		Number.isFinite(requestedTopApps) &&
		requestedTopApps > 0
			? Math.max(1, Math.round(requestedTopApps))
			: DEFAULT_TOP_APPS;

	const now = new Date();
	const since = new Date(now);
	since.setUTCDate(since.getUTCDate() - (days - 1));
	since.setUTCHours(0, 0, 0, 0);

	const sinceIso = since.toISOString();
	const nowIso = now.toISOString();
	const dayBuckets = buildDayBuckets(since, days);
	const dayBucketSet = new Set(dayBuckets);

	const topApps = await getTopApps(
		apiProviderId,
		topAppsPeriodForDays(days),
		Math.max(topAppsLimit * 5, topAppsLimit),
	);
	const preferredAppIds = topApps
		.map((app) => String(app?.app_id ?? "").trim())
		.filter(Boolean);
	logUsageFetch("provider_app_top_ids", {
		providerId: apiProviderId,
		days,
		limit: Math.max(topAppsLimit * 5, topAppsLimit),
		count: preferredAppIds.length,
		source: "getTopApps",
	});

	const rollupRows = await fetchProviderAppRollupRows(
		apiProviderId,
		sinceIso,
		nowIso,
		preferredAppIds,
		MAX_FILTERED_PAGES,
	);
	const fallbackRows = !rollupRows.length
		? await fetchProviderAppRollupRows(
			apiProviderId,
			sinceIso,
			nowIso,
			undefined,
			MAX_FALLBACK_PAGES,
		)
		: [];
	const sourceRows = rollupRows.length > 0 ? rollupRows : fallbackRows;
	if (!sourceRows.length) return { apps: [], points: [] };

	const totalByApp = new Map<string, number>();
	const tokensByDayAndApp = new Map<string, Map<string, number>>();

	for (const row of sourceRows) {
		const appId = String(row?.app_id ?? "").trim();
		if (!appId) continue;

		const tokens = Number(row?.total_tokens ?? 0);
		if (!Number.isFinite(tokens) || tokens <= 0) continue;

		const day = toIsoDate(new Date(row.bucket_15m));
		if (!dayBucketSet.has(day)) continue;

		totalByApp.set(appId, (totalByApp.get(appId) ?? 0) + tokens);
		const dayMap = tokensByDayAndApp.get(day) ?? new Map<string, number>();
		dayMap.set(appId, (dayMap.get(appId) ?? 0) + tokens);
		tokensByDayAndApp.set(day, dayMap);
	}

	const topAppIds = Array.from(totalByApp.entries())
		.sort((a, b) => b[1] - a[1])
		.map(([appId]) => appId)
		.slice(0, topAppsLimit);

	if (!topAppIds.length) return { apps: [], points: [] };

	const topAppMetaById = new Map(
		topApps
			.map((app) => [String(app?.app_id ?? "").trim(), app] as const)
			.filter(([appId]) => Boolean(appId)),
	);
	const missingMetaIds = topAppIds.filter((appId) => !topAppMetaById.has(appId));
	const appMetaById = await fetchAppMetaByIds(missingMetaIds);
	const apps: ProviderAppSeriesApp[] = topAppIds
		.map((appId) => {
			const topMeta = topAppMetaById.get(appId);
			const meta = appMetaById.get(appId);
			const title = topMeta?.title?.trim() || meta?.title?.trim() || appId;
			if (isUnknownAppIdentity(appId, title)) return null;

			return {
				appId,
				title,
				url: topMeta?.url ?? meta?.url ?? null,
				imageUrl: topMeta?.image_url ?? meta?.image_url ?? null,
				totalTokens: Math.round(totalByApp.get(appId) ?? 0),
			};
		})
		.filter((value): value is ProviderAppSeriesApp => Boolean(value));

	if (!apps.length) return { apps: [], points: [] };

	const points: ProviderAppSeriesPoint[] = [];
	for (const day of dayBuckets) {
		const dayMap = tokensByDayAndApp.get(day) ?? new Map<string, number>();
		for (const app of apps) {
			points.push({
				bucket: day,
				appId: app.appId,
				tokens: Math.round(dayMap.get(app.appId) ?? 0),
			});
		}
	}
	logUsageFetch("provider_app_token_timeseries", {
		providerId: apiProviderId,
		days,
		topAppsLimit,
		preferredAppIds: preferredAppIds.length,
		rollupRows: rollupRows.length,
		fallbackRows: fallbackRows.length,
		sourceRows: sourceRows.length,
		apps: apps.length,
		points: points.length,
	});

	return { apps, points };
}
