"use cache";

import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";

const DEFAULT_DAYS = 30;
const DEFAULT_TOP_APPS = 20;
const PAGE_SIZE = 1000;
const MAX_PAGES_PER_DAY = 12;

type TopAppRpcRow = {
	app_id: string | null;
	title: string | null;
	url: string | null;
	total_tokens: number | null;
};

type GatewayAppRequestRow = {
	created_at: string;
	app_id: string | null;
	usage: unknown;
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

function parseTokenValue(value: unknown): number {
	if (value == null) return 0;
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : 0;
	}
	const numeric = Number.parseFloat(String(value));
	return Number.isFinite(numeric) ? numeric : 0;
}

function getUsageTotalTokens(usage: unknown): number {
	if (usage == null) return 0;

	let normalized = usage;
	if (typeof usage === "string") {
		try {
			normalized = JSON.parse(usage);
		} catch {
			return 0;
		}
	}

	if (typeof normalized !== "object" || normalized == null) {
		return 0;
	}

	const record = normalized as Record<string, unknown>;
	const totalTokens = parseTokenValue(
		record.total_tokens ?? record.totalTokens ?? null,
	);
	if (totalTokens > 0) return totalTokens;

	const priorityKeys = [
		"input_tokens",
		"output_tokens",
		"input_text_tokens",
		"output_text_tokens",
		"input_audio_tokens",
		"output_audio_tokens",
		"input_video_tokens",
		"output_video_tokens",
		"input_image_tokens",
		"output_image_tokens",
		"cached_read_text_tokens",
		"cached_write_text_tokens",
		"cached_read_audio_tokens",
		"cached_write_audio_tokens",
		"cached_read_video_tokens",
		"cached_write_video_tokens",
		"cached_read_image_tokens",
		"cached_write_image_tokens",
	] as const;

	let sum = 0;
	for (const key of priorityKeys) {
		sum += parseTokenValue(record[key]);
	}
	if (sum > 0) return sum;

	let fallback = 0;
	for (const [key, value] of Object.entries(record)) {
		const lower = key.toLowerCase();
		if (!lower.endsWith("_tokens")) continue;
		if (lower === "total_tokens") continue;
		if (lower.includes("reasoning")) continue;
		fallback += parseTokenValue(value);
	}
	return fallback;
}

function toIsoDate(value: Date): string {
	return value.toISOString().slice(0, 10);
}

async function fetchTopAppsForWindow(
	apiProviderId: string,
	sinceIso: string,
	limit: number,
): Promise<ProviderAppSeriesApp[]> {
	const supabase = createAdminClient();

	const { data, error } = await supabase.rpc("get_top_apps_stats", {
		p_provider: apiProviderId,
		p_since: sinceIso,
		p_limit: limit,
	});

	if (error) {
		console.error("Error loading provider top apps for timeseries:", error);
		return [];
	}

	const rows = ((data ?? []) as TopAppRpcRow[]).filter(
		(row): row is Required<Pick<TopAppRpcRow, "app_id">> & TopAppRpcRow =>
			Boolean(row.app_id),
	);
	if (!rows.length) return [];

	const appIds = rows
		.map((row) => String(row.app_id).trim())
		.filter(Boolean);

	const imageById = new Map<string, string | null>();
	const { data: appRows, error: appError } = await supabase
		.from("api_apps")
		.select("id, image_url")
		.in("id", appIds);

	if (appError) {
		console.error("Error loading app metadata for timeseries:", appError);
	}

	for (const appRow of appRows ?? []) {
		const id = String((appRow as any).id ?? "").trim();
		if (!id) continue;
		imageById.set(id, ((appRow as any).image_url as string | null) ?? null);
	}

	return rows.map((row) => {
		const appId = String(row.app_id).trim();
		return {
			appId,
			title: row.title?.trim() || appId,
			url: row.url ?? null,
			imageUrl: imageById.get(appId) ?? null,
			totalTokens: Number(row.total_tokens ?? 0),
		};
	});
}

async function fetchProviderAppRowsForDay(
	apiProviderId: string,
	dayStartIso: string,
	dayEndIso: string,
	appIds: string[],
): Promise<GatewayAppRequestRow[]> {
	if (!appIds.length) return [];

	const supabase = createAdminClient();
	const rows: GatewayAppRequestRow[] = [];

	for (let page = 0; page < MAX_PAGES_PER_DAY; page++) {
		const from = page * PAGE_SIZE;
		const to = from + PAGE_SIZE - 1;

		const { data, error } = await supabase
			.from("gateway_requests")
			.select("created_at, app_id, usage")
			.eq("provider", apiProviderId)
			.gte("created_at", dayStartIso)
			.lt("created_at", dayEndIso)
			.in("app_id", appIds)
			.order("created_at", { ascending: true })
			.range(from, to);

		if (error) {
			console.error("Error loading provider app request rows for chart:", error);
			break;
		}
		if (!data?.length) break;

		rows.push(...(data as GatewayAppRequestRow[]));
		if (data.length < PAGE_SIZE) break;
	}

	return rows;
}

export async function getProviderAppTokenTimeseries(
	apiProviderId: string,
	options?: {
		days?: number;
		topApps?: number;
	},
): Promise<ProviderAppTokenTimeseries> {
	cacheLife("minutes");
	cacheTag("data:gateway_requests");
	cacheTag(`data:gateway_requests:provider:${apiProviderId}`);

	if (!apiProviderId) return { apps: [], points: [] };

	const days = Math.max(1, options?.days ?? DEFAULT_DAYS);
	const topAppsLimit = Math.max(1, options?.topApps ?? DEFAULT_TOP_APPS);

	const now = new Date();
	const since = new Date(now);
	since.setUTCDate(since.getUTCDate() - (days - 1));
	since.setUTCHours(0, 0, 0, 0);
	const sinceIso = since.toISOString();

	const apps = await fetchTopAppsForWindow(apiProviderId, sinceIso, topAppsLimit);
	if (!apps.length) return { apps: [], points: [] };

	const appIds = apps.map((app) => app.appId);
	const tokensByBucketAndApp = new Map<string, Map<string, number>>();

	for (let i = 0; i < days; i++) {
		const dayStart = new Date(since);
		dayStart.setUTCDate(since.getUTCDate() + i);
		const dayEnd = new Date(dayStart);
		dayEnd.setUTCDate(dayStart.getUTCDate() + 1);

		const dayRows = await fetchProviderAppRowsForDay(
			apiProviderId,
			dayStart.toISOString(),
			dayEnd.toISOString(),
			appIds,
		);

		for (const row of dayRows) {
			const appId = row.app_id?.trim();
			if (!appId) continue;
			if (!appIds.includes(appId)) continue;

			const tokens = getUsageTotalTokens(row.usage);
			if (!Number.isFinite(tokens) || tokens <= 0) continue;

			const date = new Date(row.created_at);
			if (Number.isNaN(date.getTime())) continue;
			const bucket = toIsoDate(date);

			const bucketMap = tokensByBucketAndApp.get(bucket) ?? new Map();
			bucketMap.set(appId, (bucketMap.get(appId) ?? 0) + tokens);
			tokensByBucketAndApp.set(bucket, bucketMap);
		}
	}

	const points: ProviderAppSeriesPoint[] = [];
	for (let i = 0; i < days; i++) {
		const bucketDate = new Date(since);
		bucketDate.setUTCDate(since.getUTCDate() + i);
		const bucket = toIsoDate(bucketDate);
		const bucketMap = tokensByBucketAndApp.get(bucket) ?? new Map();

		for (const app of apps) {
			points.push({
				bucket,
				appId: app.appId,
				tokens: Math.round(bucketMap.get(app.appId) ?? 0),
			});
		}
	}

	return { apps, points };
}
