import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeTraceAggregator, readTraceDiagnostics } from "./traceDiagnostics";

const nano = (iso: string) => `${BigInt(Date.parse(iso)) * 1_000_000n}`;
function spanLine(name: string, durationMs: number, ended: string, extra: Record<string, unknown> = {}) {
	return JSON.stringify({ type: "span", name, traceId: `trace-${name}-${ended}`, spanId: `span-${name}-${ended}`, startTimeUnixNano: nano(new Date(Date.parse(ended) - durationMs).toISOString()), endTimeUnixNano: nano(ended), durationMs, attributes: {}, exit: { _tag: "Success" }, events: [], ...extra });
}
const failure = (cause: string) => ({ exit: { _tag: "Failure", cause } });

describe("trace aggregation", () => {
	it("counts spans, failures, slow spans and unreadable lines", () => {
		const aggregator = makeTraceAggregator(1_000);
		for (const line of [
			spanLine("turn.run", 4_000, "2026-10-16T10:00:04.000Z"),
			spanLine("git.diff", 20, "2026-10-16T10:00:05.000Z"),
			spanLine("git.diff", 1_000, "2026-10-16T10:00:06.000Z", failure("git exited with 128")),
			spanLine("git.diff", 30, "2026-10-16T10:00:07.000Z", failure("git exited with 128")),
			spanLine("gh pr diff", 300, "2026-10-16T10:00:08.000Z", failure("gh failed")),
			"{ not json",
			"[1,2,3]",
			JSON.stringify({ name: "missing ids", durationMs: 4 }),
			"",
			"   ",
		]) aggregator.addLine(line);
		const result = aggregator.finish({ traceFilePath: "traces.ndjson", logsDirectory: "logs", scannedFilePaths: ["traces.ndjson"], readAt: "2026-10-16T10:01:00.000Z" });
		expect(result).toMatchObject({ recordCount: 5, parseErrorCount: 3, failureCount: 3, slowSpanCount: 2, slowSpanThresholdMs: 1_000, firstSpanAt: "2026-10-16T10:00:00.000Z", lastSpanAt: "2026-10-16T10:00:08.000Z" });
		expect(result.latestFailures.map(value => value.name)).toEqual(["gh pr diff", "git.diff", "git.diff"]);
		expect(result.commonFailures[0]).toMatchObject({ name: "git.diff", cause: "git exited with 128", count: 2, lastSeenAt: "2026-10-16T10:00:07.000Z" });
		expect(result.slowestSpans.map(value => value.durationMs)).toEqual([4_000, 1_000, 300, 30, 20]);
		expect(result.topSpansByCount[0]).toMatchObject({ name: "git.diff", count: 3, failureCount: 2, maxDurationMs: 1_000, averageDurationMs: 350 });
	});

	it("keeps the most recent warnings and errors from spans and from the console", () => {
		const aggregator = makeTraceAggregator();
		aggregator.addLine(spanLine("models.discover", 10, "2026-10-16T10:00:00.000Z", { events: [{ name: "Catalog was slow", timeUnixNano: nano("2026-10-16T09:59:59.000Z"), level: "warning" }, { name: "ignored", timeUnixNano: nano("2026-10-16T09:59:59.500Z") }] }));
		aggregator.addLine(JSON.stringify({ type: "log", level: "error", message: "Workspace shutdown failed.", timeUnixNano: nano("2026-10-16T10:00:02.000Z") }));
		aggregator.addLine(JSON.stringify({ type: "log", level: "error", timeUnixNano: nano("2026-10-16T10:00:03.000Z") }));
		const result = aggregator.finish({ traceFilePath: "t", logsDirectory: "l", scannedFilePaths: [], readAt: "2026-10-16T10:01:00.000Z" });
		expect(result.latestWarningAndErrorLogs).toEqual([
			{ spanName: "Main process", level: "error", message: "Workspace shutdown failed.", seenAt: "2026-10-16T10:00:02.000Z" },
			{ spanName: "models.discover", level: "warning", message: "Catalog was slow", seenAt: "2026-10-16T09:59:59.000Z", traceId: "trace-models.discover-2026-10-16T10:00:00.000Z", spanId: "span-models.discover-2026-10-16T10:00:00.000Z" },
		]);
		expect(result.logLevelCounts).toEqual({ error: 1, warning: 1 });
		expect(result.parseErrorCount).toBe(1);
		expect(result.recordCount).toBe(1);
	});

	it("bounds its lists however many spans it reads", () => {
		const aggregator = makeTraceAggregator();
		for (let index = 0; index < 500; index++) aggregator.addLine(spanLine(`span.${index % 40}`, index, new Date(Date.UTC(2026, 9, 16, 10, 0, 0, index)).toISOString(), failure(`cause ${index % 30}`)));
		const result = aggregator.finish({ traceFilePath: "t", logsDirectory: "l", scannedFilePaths: [], readAt: "2026-10-16T11:00:00.000Z" });
		expect(result.latestFailures).toHaveLength(20);
		expect(result.latestFailures[0].durationMs).toBe(499);
		expect(result.commonFailures).toHaveLength(10);
		expect(result.slowestSpans).toHaveLength(10);
		expect(result.slowestSpans[0].durationMs).toBe(499);
		expect(result.topSpansByCount).toHaveLength(10);
	});
});

describe("reading trace files", () => {
	let directory: string;
	afterEach(() => rmSync(directory, { recursive: true, force: true }));

	it("reads rotated files oldest first and reports a missing log folder", async () => {
		directory = mkdtempSync(path.join(tmpdir(), "phaseo-traces-"));
		const file = path.join(directory, "traces.ndjson");
		expect(await readTraceDiagnostics({ traceFilePath: file, logsDirectory: directory, maxFiles: 3 })).toMatchObject({ recordCount: 0, error: expect.stringContaining("No trace files") });
		writeFileSync(`${file}.2`, `${spanLine("old", 5, "2026-10-16T09:00:00.000Z")}\n`);
		writeFileSync(file, `${spanLine("new", 7, "2026-10-16T10:00:00.000Z")}\r\nbroken\n`);
		const result = await readTraceDiagnostics({ traceFilePath: file, logsDirectory: directory, maxFiles: 3 });
		expect(result.scannedFilePaths).toEqual([`${file}.2`, `${file}.1`, file]);
		expect(result).toMatchObject({ recordCount: 2, parseErrorCount: 1, firstSpanAt: "2026-10-16T08:59:59.995Z", lastSpanAt: "2026-10-16T10:00:00.000Z" });
		expect(result.error).toBeUndefined();
	});
});
