/** Settings → Diagnostics, after T3 Code's page: the app's process tree, its recent resource use and its local traces. */

export type DiagnosticsProcessKind = "main" | "renderer" | "gpu" | "utility" | "agent" | "terminal" | "git" | "mcp" | "process";

export type DiagnosticsProcess = {
	pid: number;
	ppid: number;
	/** With the PID, the process's identity: operating systems reuse PIDs. */
	startTimeMs: number;
	name: string;
	command: string;
	/** What the app knows it as: a terminal's title, a browser tab, an agent CLI. */
	label?: string;
	kind: DiagnosticsProcessKind;
	cpuPercent: number;
	rssBytes: number;
	elapsedMs: number;
	depth: number;
	childPids: number[];
	/** Only processes the app started (not the main process or Electron's own helpers) can be stopped here. */
	stoppable: boolean;
};

export type DiagnosticsProcesses = {
	rootPid: number;
	readAt: string;
	/** Processes below the main process. */
	processCount: number;
	totalCpuPercent: number;
	totalRssBytes: number;
	/** Depth-first, each process followed by its children. */
	processes: DiagnosticsProcess[];
	error?: string;
};

export type ResourceBucket = { startedAt: string; endedAt: string; avgCpuPercent: number; maxCpuPercent: number; maxRssBytes: number; maxProcessCount: number };
export type ProcessCpuBucket = { avgCpuPercent: number; maxCpuPercent: number } | null;

export type ResourceProcessSummary = {
	key: string;
	pid: number;
	ppid: number;
	name: string;
	command: string;
	label?: string;
	depth: number;
	isRoot: boolean;
	currentCpuPercent: number;
	avgCpuPercent: number;
	maxCpuPercent: number;
	cpuSeconds: number;
	currentRssBytes: number;
	maxRssBytes: number;
	sampleCount: number;
	/** One per bucket of the window, empty where the process was not sampled. */
	buckets: ProcessCpuBucket[];
};

export type ResourceHistory = {
	readAt: string;
	windowMs: number;
	bucketMs: number;
	/** 0 when nothing is sampling on a timer (samples are then taken only on request). */
	sampleIntervalMs: number;
	retainedSampleCount: number;
	totalCpuSeconds: number;
	buckets: ResourceBucket[];
	processes: ResourceProcessSummary[];
	error?: string;
};

export const RESOURCE_HISTORY_WINDOWS = [
	{ label: "5m", windowMs: 5 * 60_000, bucketMs: 30_000 },
	{ label: "15m", windowMs: 15 * 60_000, bucketMs: 60_000 },
	{ label: "30m", windowMs: 30 * 60_000, bucketMs: 2 * 60_000 },
	{ label: "1h", windowMs: 60 * 60_000, bucketMs: 5 * 60_000 },
] as const;

export type ResourceHistoryRequest = { windowMs: number; bucketMs: number };

export function validateResourceHistoryRequest(value: unknown): ResourceHistoryRequest {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid resource history request.");
	const { windowMs, bucketMs } = value as Record<string, unknown>;
	const window = RESOURCE_HISTORY_WINDOWS.find(option => option.windowMs === windowMs && option.bucketMs === bucketMs);
	if (!window) throw new Error("Choose a resource history period.");
	return { windowMs: window.windowMs, bucketMs: window.bucketMs };
}

export type StopProcessRequest = { pid: number; startTimeMs: number };
export type StopProcessResult = { stopped: boolean; message?: string; /** The process had already exited or is no longer the one chosen. */ stale?: boolean };

export function validateStopProcessRequest(value: unknown): StopProcessRequest {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid process request.");
	const { pid, startTimeMs } = value as Record<string, unknown>;
	if (!Number.isSafeInteger(pid) || Number(pid) < 1 || Number(pid) > 2 ** 32) throw new Error("Invalid process ID.");
	if (typeof startTimeMs !== "number" || !Number.isFinite(startTimeMs) || startTimeMs < 0) throw new Error("Invalid process start time.");
	return { pid: Number(pid), startTimeMs };
}

export type TraceSpanOccurrence = { name: string; durationMs: number; endedAt: string; traceId: string; spanId: string };
export type TraceRecentFailure = TraceSpanOccurrence & { cause: string };
export type TraceFailureSummary = { name: string; cause: string; count: number; lastSeenAt: string; traceId: string; spanId: string };
export type TraceLogEvent = { spanName: string; level: string; message: string; seenAt: string; traceId?: string; spanId?: string };
export type TraceSpanSummary = { name: string; count: number; failureCount: number; totalDurationMs: number; averageDurationMs: number; maxDurationMs: number };

export type TraceDiagnostics = {
	traceFilePath: string;
	logsDirectory: string;
	scannedFilePaths: string[];
	readAt: string;
	recordCount: number;
	parseErrorCount: number;
	firstSpanAt?: string;
	lastSpanAt?: string;
	failureCount: number;
	slowSpanThresholdMs: number;
	slowSpanCount: number;
	logLevelCounts: Record<string, number>;
	topSpansByCount: TraceSpanSummary[];
	slowestSpans: TraceSpanOccurrence[];
	commonFailures: TraceFailureSummary[];
	latestFailures: TraceRecentFailure[];
	latestWarningAndErrorLogs: TraceLogEvent[];
	/** Some trace files could not be read, so the figures may be incomplete. */
	partialFailure?: boolean;
	error?: string;
};

export type DiagnosticsApi = {
	processes: () => Promise<DiagnosticsProcesses>;
	resources: (request: ResourceHistoryRequest) => Promise<ResourceHistory>;
	traces: () => Promise<TraceDiagnostics>;
	stopProcess: (request: StopProcessRequest) => Promise<StopProcessResult>;
	openLogs: () => Promise<void>;
	/** Samples processes on a timer while at least one window has the page open; returns its interval. */
	subscribe: () => Promise<number>;
	unsubscribe: () => Promise<void>;
};
