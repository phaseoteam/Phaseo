export type CompactChangeHistory = [
	id: string,
	timestamp: string,
	provider: string,
	model: string,
	endpoint: string | null,
	field: string,
	oldValue: unknown,
	newValue: unknown,
	percentChange: number | null,
	action: "added" | "changed" | "removed" | null,
	commit: string | null,
	entityId: string | null,
	entityType: string | null,
	orgId: string | null,
];

export const MONITOR_HISTORY_CACHE_TAG = "monitor-history";

export type MonitorHistoryFilterOption = { label: string; query: string; value: string };

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
