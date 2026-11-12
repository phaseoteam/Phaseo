import type { DiagnosticsProcess, ProcessCpuBucket, ResourceBucket, ResourceHistory, ResourceProcessSummary } from "../../shared/diagnostics";
import { processKey } from "./processTable";

type Row = { key: string; pid: number; ppid: number; name: string; command: string; label?: string; depth: number; cpuPercent: number; rssBytes: number };
type Sample = { at: number; rows: Row[]; bytes: number };

export type ResourceHistoryLimits = { maxAgeMs: number; maxSamples: number; maxBytes: number };
/** An hour at the fastest interval, and never more than a few megabytes however long the command lines. */
export const DEFAULT_HISTORY_LIMITS: ResourceHistoryLimits = { maxAgeMs: 60 * 60_000, maxSamples: 1_800, maxBytes: 8 * 1024 * 1024 };
const MAX_COMMAND = 300;
/** The longest gap one sample's CPU rate is taken to cover (twice the slowest interval), and the first sample's when sampling on request. */
const MAX_SAMPLE_GAP_MS = 10_000, DEFAULT_GAP_MS = 3_000;

/**
 * Process samples kept in memory only, bounded by age, count and approximate size, so a large process tree
 * shortens the history rather than growing it. Nothing is written to disk; it empties when the app quits.
 */
export class ResourceHistoryStore {
	private samples: Sample[] = [];
	private bytes = 0;
	constructor(private readonly limits: ResourceHistoryLimits = DEFAULT_HISTORY_LIMITS) {}
	get sampleCount() { return this.samples.length; }
	get retainedBytes() { return this.bytes; }
	add(at: number, processes: DiagnosticsProcess[]) {
		const rows = processes.map(process => ({ key: processKey(process.pid, process.startTimeMs), pid: process.pid, ppid: process.ppid, name: process.name.slice(0, 120), command: process.command.slice(0, MAX_COMMAND), ...(process.label ? { label: process.label.slice(0, 120) } : {}), depth: process.depth, cpuPercent: process.cpuPercent, rssBytes: process.rssBytes }));
		// Strings count twice (UTF-16); each row has some fixed overhead.
		const bytes = rows.reduce((total, row) => total + 96 + (row.key.length + row.name.length + row.command.length + (row.label?.length ?? 0)) * 2, 64);
		this.samples.push({ at, rows, bytes }); this.bytes += bytes;
		this.prune(at);
	}
	private prune(now: number) {
		while (this.samples.length && (this.samples.length > this.limits.maxSamples || this.bytes > this.limits.maxBytes || now - this.samples[0].at > this.limits.maxAgeMs)) this.bytes -= this.samples.shift()!.bytes;
	}
	clear() { this.samples = []; this.bytes = 0; }

	summarise(input: { windowMs: number; bucketMs: number; now: number; sampleIntervalMs: number; rootPid: number }): ResourceHistory {
		this.prune(input.now);
		const start = input.now - input.windowMs, count = Math.max(1, Math.ceil(input.windowMs / input.bucketMs));
		const inWindow = this.samples.filter(sample => sample.at > start && sample.at <= input.now);
		const bucketOf = (at: number) => Math.min(count - 1, Math.max(0, Math.floor((at - start) / input.bucketMs)));
		const totals = Array.from({ length: count }, () => ({ sum: 0, max: 0, samples: 0, rss: 0, processes: 0 }));
		const perProcess = new Map<string, { row: Row; latest: Row; samples: number; sum: number; max: number; maxRss: number; cpuMs: number; buckets: { sum: number; max: number; samples: number }[]; lastAt: number }>();
		for (const [index, sample] of inWindow.entries()) {
			const bucket = totals[bucketOf(sample.at)];
			const cpu = sample.rows.reduce((total, row) => total + row.cpuPercent, 0), rss = sample.rows.reduce((total, row) => total + row.rssBytes, 0);
			bucket.sum += cpu; bucket.max = Math.max(bucket.max, cpu); bucket.samples++; bucket.rss = Math.max(bucket.rss, rss); bucket.processes = Math.max(bucket.processes, sample.rows.length);
			// CPU time approximated as each sample's rate held since the previous sample, at most `MAX_SAMPLE_GAP_MS`: time the page was closed was not sampled.
			const gap = index > 0 ? sample.at - inWindow[index - 1].at : input.sampleIntervalMs || DEFAULT_GAP_MS;
			const span = Math.max(0, Math.min(gap, MAX_SAMPLE_GAP_MS));
			for (const row of sample.rows) {
				let entry = perProcess.get(row.key);
				if (!entry) { entry = { row, latest: row, samples: 0, sum: 0, max: 0, maxRss: 0, cpuMs: 0, buckets: Array.from({ length: count }, () => ({ sum: 0, max: 0, samples: 0 })), lastAt: 0 }; perProcess.set(row.key, entry); }
				entry.latest = row; entry.lastAt = sample.at; entry.samples++; entry.sum += row.cpuPercent; entry.max = Math.max(entry.max, row.cpuPercent); entry.maxRss = Math.max(entry.maxRss, row.rssBytes); entry.cpuMs += row.cpuPercent / 100 * span;
				const own = entry.buckets[bucketOf(sample.at)]; own.sum += row.cpuPercent; own.max = Math.max(own.max, row.cpuPercent); own.samples++;
			}
		}
		const latestAt = inWindow.at(-1)?.at;
		const buckets: ResourceBucket[] = totals.map((bucket, index) => ({ startedAt: new Date(start + index * input.bucketMs).toISOString(), endedAt: new Date(Math.min(input.now, start + (index + 1) * input.bucketMs)).toISOString(), avgCpuPercent: bucket.samples ? bucket.sum / bucket.samples : 0, maxCpuPercent: bucket.max, maxRssBytes: bucket.rss, maxProcessCount: bucket.processes }));
		const processes: ResourceProcessSummary[] = [...perProcess.values()]
			.map(entry => ({
				key: entry.row.key, pid: entry.latest.pid, ppid: entry.latest.ppid, name: entry.latest.name, command: entry.latest.command, ...(entry.latest.label ? { label: entry.latest.label } : {}), depth: entry.latest.depth, isRoot: entry.latest.pid === input.rootPid,
				currentCpuPercent: entry.lastAt === latestAt ? entry.latest.cpuPercent : 0, avgCpuPercent: entry.sum / entry.samples, maxCpuPercent: entry.max, cpuSeconds: entry.cpuMs / 1000,
				currentRssBytes: entry.lastAt === latestAt ? entry.latest.rssBytes : 0, maxRssBytes: entry.maxRss, sampleCount: entry.samples,
				buckets: entry.buckets.map((bucket): ProcessCpuBucket => bucket.samples ? { avgCpuPercent: bucket.sum / bucket.samples, maxCpuPercent: bucket.max } : null),
			}))
			// The root first, then the busiest; a long tail of idle helpers is cut.
			.sort((left, right) => Number(right.isRoot) - Number(left.isRoot) || right.cpuSeconds - left.cpuSeconds || right.maxRssBytes - left.maxRssBytes)
			.slice(0, 50);
		return { readAt: new Date(input.now).toISOString(), windowMs: input.windowMs, bucketMs: input.bucketMs, sampleIntervalMs: input.sampleIntervalMs, retainedSampleCount: this.samples.length, totalCpuSeconds: processes.reduce((total, process) => total + process.cpuSeconds, 0), buckets, processes };
	}
}
