import { cacheLife, cacheTag } from "next/cache";
import type { CompactChangeHistory } from "@/components/monitor/MonitorHistoryClient";
import { createAdminClient } from "@/utils/supabase/admin";

const DEFAULT_COMMIT_PAGE_SIZE = 18;

export const MONITOR_HISTORY_CACHE_TAG = "monitor-history";

export type MonitorHistoryFilterOption = {
	label: string;
	query: string;
	value: string;
};

export type MonitorHistoryDbPage = {
	entries: CompactChangeHistory[];
	generatedAt?: string;
	hasMore: boolean;
	lastSha?: string;
	nextCommitOffset: number;
	sourceBase?: string;
	sourceHead?: string;
	totalChanges: number;
	totalCommits: number;
};

export type MonitorHistoryInitialData = {
	initialPage: MonitorHistoryDbPage;
	modelOptions: MonitorHistoryFilterOption[];
	providerOptions: MonitorHistoryFilterOption[];
};

export type MonitorHistoryPageFilters = {
	changeType?: string;
	commitLimit?: number;
	commitOffset?: number;
	model?: string;
	provider?: string;
};

type MonitorHistoryFilterOptionRow = {
	option_kind: string | null;
	option_label: string | null;
	option_value: string | null;
};

type MonitorHistoryPageRow = {
	action: "added" | "changed" | "removed" | null;
	commit_sha: string | null;
	committed_at: string | null;
	endpoint: string | null;
	entity_id: string | null;
	entity_type: string | null;
	event_id: string | null;
	field: string | null;
	model_id: string | null;
	new_value: unknown;
	old_value: unknown;
	org_id: string | null;
	percent_change: number | null;
	provider_kind: string | null;
};

type MonitorHistoryStatsRow = {
	generated_at: string | null;
	last_sha: string | null;
	source_base: string | null;
	source_head: string | null;
	total_changes: number | null;
	total_commits: number | null;
};

type NormalizedMonitorHistoryPageFilters = {
	changeType: string | null;
	commitLimit: number;
	commitOffset: number;
	model: string | null;
	provider: string | null;
};

function normalizeCommitLimit(value: number | undefined) {
	if (!Number.isFinite(value)) return DEFAULT_COMMIT_PAGE_SIZE;
	return Math.max(1, Math.min(50, Number(value)));
}

function normalizeCommitOffset(value: number | undefined) {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Number(value));
}

function normalizeFilters(
	filters: MonitorHistoryPageFilters = {},
): NormalizedMonitorHistoryPageFilters {
	return {
		changeType:
			filters.changeType && filters.changeType !== "all"
				? filters.changeType.trim() || null
				: null,
		commitLimit: normalizeCommitLimit(filters.commitLimit),
		commitOffset: normalizeCommitOffset(filters.commitOffset),
		model: filters.model?.trim() || null,
		provider: filters.provider?.trim() || null,
	};
}

async function fetchFilterOptionsFromDbUncached() {
	const supabase = createAdminClient();
	const { data, error } = await supabase.rpc("get_monitor_history_filter_options");

	if (error) throw error;

	const modelOptions: MonitorHistoryFilterOption[] = [];
	const providerOptions: MonitorHistoryFilterOption[] = [];

	for (const row of (data ?? []) as MonitorHistoryFilterOptionRow[]) {
		const value = String(row.option_value ?? "").trim();
		const label = String(row.option_label ?? "").trim();
		if (!value || !label) continue;

		const option = {
			label,
			query: `${label} ${value}`,
			value,
		} satisfies MonitorHistoryFilterOption;

		if (row.option_kind === "model") {
			modelOptions.push(option);
			continue;
		}

		if (row.option_kind === "provider") {
			providerOptions.push(option);
		}
	}

	return { modelOptions, providerOptions };
}

async function fetchFilterOptionsFromDb() {
	"use cache";
	cacheLife("minutes");
	cacheTag(MONITOR_HISTORY_CACHE_TAG);
	return fetchFilterOptionsFromDbUncached();
}

async function fetchMonitorHistoryPageFromDbUncached(
	filters: NormalizedMonitorHistoryPageFilters,
): Promise<MonitorHistoryDbPage> {
	const supabase = createAdminClient();

	const [{ data: statsData, error: statsError }, { data: pageData, error: pageError }] =
		await Promise.all([
			supabase.rpc("get_monitor_history_stats", {
				p_change_kind: filters.changeType,
				p_model: filters.model,
				p_provider: filters.provider,
			}),
			supabase.rpc("get_monitor_history_page", {
				p_change_kind: filters.changeType,
				p_commit_limit: filters.commitLimit,
				p_commit_offset: filters.commitOffset,
				p_model: filters.model,
				p_provider: filters.provider,
			}),
		]);

	if (statsError) throw statsError;
	if (pageError) throw pageError;

	const statsRow = ((statsData ?? [])[0] ?? null) as MonitorHistoryStatsRow | null;
	const totalCommits = Number(statsRow?.total_commits ?? 0);
	const nextCommitOffset = filters.commitOffset + filters.commitLimit;

	return {
		entries: ((pageData ?? []) as MonitorHistoryPageRow[]).map(
			(row): CompactChangeHistory => [
				String(row.event_id ?? ""),
				row.committed_at ?? "",
				String(row.provider_kind ?? "model"),
				String(row.model_id ?? ""),
				row.endpoint ?? null,
				row.field ?? "",
				row.old_value ?? null,
				row.new_value ?? null,
				row.percent_change ?? null,
				row.action ?? null,
				row.commit_sha ?? null,
				row.entity_id ?? null,
				row.entity_type ?? null,
				row.org_id ?? null,
			],
		),
		generatedAt: statsRow?.generated_at ?? undefined,
		hasMore: totalCommits > nextCommitOffset,
		lastSha: statsRow?.last_sha ?? undefined,
		nextCommitOffset,
		sourceBase: statsRow?.source_base ?? undefined,
		sourceHead: statsRow?.source_head ?? undefined,
		totalChanges: Number(statsRow?.total_changes ?? 0),
		totalCommits,
	};
}

export async function fetchMonitorHistoryPageFromDb(
	filters: MonitorHistoryPageFilters = {},
): Promise<MonitorHistoryDbPage> {
	return fetchMonitorHistoryPageFromDbUncached(normalizeFilters(filters));
}

export async function fetchMonitorHistoryPage(
	filters: MonitorHistoryPageFilters = {},
): Promise<MonitorHistoryDbPage> {
	return fetchMonitorHistoryPageFromDb(filters);
}

async function getInitialMonitorHistoryPageCached(): Promise<MonitorHistoryDbPage> {
	"use cache";
	cacheLife("minutes");
	cacheTag(MONITOR_HISTORY_CACHE_TAG);
	return fetchMonitorHistoryPageFromDbUncached(normalizeFilters({}));
}

export async function getMonitorHistoryInitialData(): Promise<MonitorHistoryInitialData> {
	const [{ modelOptions, providerOptions }, initialPage] = await Promise.all([
		fetchFilterOptionsFromDb(),
		getInitialMonitorHistoryPageCached(),
	]);

	return {
		initialPage,
		modelOptions,
		providerOptions,
	};
}
