import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import type { TraceDiagnostics, TraceFailureSummary, TraceLogEvent, TraceRecentFailure, TraceSpanOccurrence, TraceSpanSummary } from "../../shared/diagnostics";
import { rotatedTracePaths } from "./tracer";

/** Spans at least this long count as slow. */
export const SLOW_SPAN_THRESHOLD_MS = 1_000;
const TOP_LIMIT = 10, RECENT_LIMIT = 20;
/** A line longer than this is counted as unreadable rather than parsed. */
const MAX_LINE = 1024 * 1024;

const text = (value: unknown) => typeof value === "string" && value.trim() ? value : null;
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
function nanoTime(value: unknown): number | null {
	const raw = text(value);
	if (!raw || !/^\d{1,25}$/.test(raw)) return null;
	try { return Number(BigInt(raw) / 1_000_000n); } catch { return null; }
}
const iso = (ms: number) => new Date(ms).toISOString();

function insertBounded<A>(items: A[], item: A, limit: number, order: (left: A, right: A) => number) {
	if (items.length >= limit && order(item, items[items.length - 1]!) >= 0) return;
	items.push(item); items.sort(order);
	if (items.length > limit) items.length = limit;
}
type Timed<A> = A & { at: number };
const slowestFirst = (left: TraceSpanOccurrence, right: TraceSpanOccurrence) => right.durationMs - left.durationMs;
const latestFirst = (left: { at: number }, right: { at: number }) => right.at - left.at;

/** Counts trace lines one at a time, keeping only bounded top-N lists; the files themselves are never held in memory. */
export function makeTraceAggregator(slowSpanThresholdMs = SLOW_SPAN_THRESHOLD_MS) {
	let recordCount = 0, parseErrorCount = 0, failureCount = 0, slowSpanCount = 0;
	let firstSpanAt: number | null = null, lastSpanAt: number | null = null;
	const spansByName = new Map<string, { count: number; failureCount: number; totalDurationMs: number; maxDurationMs: number }>();
	const failuresByKey = new Map<string, Timed<TraceFailureSummary>>();
	const latestFailures: Timed<TraceRecentFailure>[] = [];
	const slowestSpans: TraceSpanOccurrence[] = [];
	const logs: Timed<TraceLogEvent>[] = [];
	const logLevelCounts: Record<string, number> = {};
	const addLog = (event: Timed<TraceLogEvent>) => {
		logLevelCounts[event.level] = (logLevelCounts[event.level] ?? 0) + 1;
		insertBounded(logs, event, RECENT_LIMIT, latestFirst);
	};

	const addLine = (line: string) => {
		if (!line.trim()) return;
		if (line.length > MAX_LINE) { parseErrorCount++; return; }
		let parsed: unknown;
		try { parsed = JSON.parse(line); } catch { parseErrorCount++; return; }
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) { parseErrorCount++; return; }
		const record = parsed as Record<string, unknown>;
		if (record.type === "log") {
			const at = nanoTime(record.timeUnixNano), level = text(record.level), message = text(record.message);
			if (at === null || !level || !message) { parseErrorCount++; return; }
			addLog({ spanName: "Main process", level, message: message.trim(), seenAt: iso(at), at });
			return;
		}
		const name = text(record.name), traceId = text(record.traceId), spanId = text(record.spanId), durationMs = finite(record.durationMs), ended = nanoTime(record.endTimeUnixNano), started = nanoTime(record.startTimeUnixNano);
		if (!name || !traceId || !spanId || durationMs === null || ended === null) { parseErrorCount++; return; }
		recordCount++;
		if (started !== null && (firstSpanAt === null || started < firstSpanAt)) firstSpanAt = started;
		if (lastSpanAt === null || ended > lastSpanAt) lastSpanAt = ended;
		const exit = record.exit && typeof record.exit === "object" ? record.exit as Record<string, unknown> : undefined;
		const failed = exit?._tag === "Failure";
		if (failed) failureCount++;
		const summary = spansByName.get(name) ?? { count: 0, failureCount: 0, totalDurationMs: 0, maxDurationMs: 0 };
		summary.count++; summary.totalDurationMs += durationMs; summary.maxDurationMs = Math.max(summary.maxDurationMs, durationMs);
		if (failed) summary.failureCount++;
		spansByName.set(name, summary);
		const endedAt = iso(ended), occurrence = { name, durationMs, endedAt, traceId, spanId };
		if (durationMs >= slowSpanThresholdMs) slowSpanCount++;
		insertBounded(slowestSpans, occurrence, TOP_LIMIT, slowestFirst);
		if (failed) {
			const cause = text(exit?.cause)?.trim() ?? "Failure";
			insertBounded(latestFailures, { ...occurrence, cause, at: ended }, RECENT_LIMIT, latestFirst);
			const key = `${name}\0${cause}`, existing = failuresByKey.get(key), latest = !existing || ended > existing.at;
			failuresByKey.set(key, { name, cause, count: (existing?.count ?? 0) + 1, lastSeenAt: latest ? endedAt : existing.lastSeenAt, traceId: latest ? traceId : existing.traceId, spanId: latest ? spanId : existing.spanId, at: latest ? ended : existing.at });
		}
		if (Array.isArray(record.events)) for (const raw of record.events) {
			if (!raw || typeof raw !== "object") continue;
			const event = raw as Record<string, unknown>, level = text(event.level);
			if (!level) continue;
			const at = nanoTime(event.timeUnixNano) ?? ended;
			addLog({ spanName: name, level, message: text(event.name)?.trim() ?? "Log event", seenAt: iso(at), traceId, spanId, at });
		}
	};

	const finish = (input: { traceFilePath: string; logsDirectory: string; scannedFilePaths: string[]; readAt: string; error?: string; partialFailure?: boolean }): TraceDiagnostics => {
		const topSpansByCount: TraceSpanSummary[] = [...spansByName.entries()]
			.map(([name, value]) => ({ name, count: value.count, failureCount: value.failureCount, totalDurationMs: value.totalDurationMs, averageDurationMs: value.count ? value.totalDurationMs / value.count : 0, maxDurationMs: value.maxDurationMs }))
			.sort((left, right) => right.count - left.count || right.maxDurationMs - left.maxDurationMs)
			.slice(0, TOP_LIMIT);
		const strip = <A extends { at: number }>({ at, ...rest }: A) => { void at; return rest; };
		return {
			...input,
			recordCount, parseErrorCount, failureCount, slowSpanThresholdMs, slowSpanCount, logLevelCounts,
			...(firstSpanAt !== null ? { firstSpanAt: iso(firstSpanAt) } : {}), ...(lastSpanAt !== null ? { lastSpanAt: iso(lastSpanAt) } : {}),
			topSpansByCount, slowestSpans,
			commonFailures: [...failuresByKey.values()].sort((left, right) => right.count - left.count || right.at - left.at).slice(0, TOP_LIMIT).map(strip),
			latestFailures: latestFailures.map(strip),
			latestWarningAndErrorLogs: logs.map(strip),
		};
	};
	return { addLine, finish };
}

/** Calls `onLine` for each line of a file; false when the file does not exist. */
export async function streamLines(file: string, onLine: (line: string) => void): Promise<boolean> {
	const stream = createReadStream(file, { encoding: "utf8", highWaterMark: 64 * 1024 });
	try {
		const lines = createInterface({ input: stream, crlfDelay: Infinity });
		for await (const line of lines) onLine(line);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return false;
		throw error;
	} finally { stream.destroy(); }
}

/** Reads the current trace file and its rotated copies, oldest first. */
export async function readTraceDiagnostics(options: { traceFilePath: string; logsDirectory: string; maxFiles: number; slowSpanThresholdMs?: number; now?: Date }): Promise<TraceDiagnostics> {
	const paths = rotatedTracePaths(options.traceFilePath, options.maxFiles), aggregator = makeTraceAggregator(options.slowSpanThresholdMs);
	let found = false, failure: string | undefined;
	for (const file of paths) {
		try { if (await streamLines(file, aggregator.addLine)) found = true; }
		catch { failure ??= `Could not read the trace file ${file}.`; }
	}
	const base = { traceFilePath: options.traceFilePath, logsDirectory: options.logsDirectory, scannedFilePaths: paths, readAt: (options.now ?? new Date()).toISOString() };
	if (!found) return aggregator.finish({ ...base, error: failure ?? "No trace files yet. They appear once the app has done some work." });
	return aggregator.finish({ ...base, ...(failure ? { error: failure, partialFailure: true } : {}) });
}
