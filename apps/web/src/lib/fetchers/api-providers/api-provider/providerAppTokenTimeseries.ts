"use cache";

import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";

const DEFAULT_DAYS = 30;
const DEFAULT_TOP_APPS = 20;
const PAGE_SIZE = 5000;

type ProviderAppRollupRow = {
	bucket_15m: string;
	app_id: string | null;
	total_tokens: number | null;
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
): Promise<ProviderAppRollupRow[]> {
	const supabase = createAdminClient();
	const rows: ProviderAppRollupRow[] = [];

	for (let from = 0; ; from += PAGE_SIZE) {
		const to = from + PAGE_SIZE - 1;
		const { data, error } = await supabase
			.from("gateway_usage_rollup_15m_provider_app")
			.select("bucket_15m, app_id, total_tokens")
			.eq("provider", apiProviderId)
			.gte("bucket_15m", sinceIso)
			.lte("bucket_15m", nowIso)
			.order("bucket_15m", { ascending: true })
			.range(from, to);

		if (error) {
			console.error("Error loading provider app rollup rows for chart:", error);
			break;
		}
		if (!Array.isArray(data) || data.length === 0) break;

		rows.push(...(data as ProviderAppRollupRow[]));
		if (data.length < PAGE_SIZE) break;
	}

	return rows;
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
	cacheLife("minutes");
	cacheTag("data:gateway_usage_rollups");
	cacheTag(`data:gateway_usage_rollups:provider:${apiProviderId}`);

	if (!apiProviderId) return { apps: [], points: [] };

	const days = Math.max(1, options?.days ?? DEFAULT_DAYS);
	const topAppsLimit = Math.max(1, options?.topApps ?? DEFAULT_TOP_APPS);

	const now = new Date();
	const since = new Date(now);
	since.setUTCDate(since.getUTCDate() - (days - 1));
	since.setUTCHours(0, 0, 0, 0);

	const sinceIso = since.toISOString();
	const nowIso = now.toISOString();
	const dayBuckets = buildDayBuckets(since, days);
	const dayBucketSet = new Set(dayBuckets);

	const rollupRows = await fetchProviderAppRollupRows(
		apiProviderId,
		sinceIso,
		nowIso,
	);
	if (!rollupRows.length) return { apps: [], points: [] };

	const totalByApp = new Map<string, number>();
	const tokensByDayAndApp = new Map<string, Map<string, number>>();

	for (const row of rollupRows) {
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

	const appMetaById = await fetchAppMetaByIds(topAppIds);
	const apps: ProviderAppSeriesApp[] = topAppIds
		.map((appId) => {
			const meta = appMetaById.get(appId);
			const title = meta?.title?.trim() || appId;
			if (isUnknownAppIdentity(appId, title)) return null;

			return {
				appId,
				title,
				url: meta?.url ?? null,
				imageUrl: meta?.image_url ?? null,
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

	return { apps, points };
}
