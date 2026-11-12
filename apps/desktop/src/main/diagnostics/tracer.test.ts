import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { captureConsole, recordIfSlow, redact, rotatedTracePaths, setTraceSink, span, startSpan, traceLog, TraceFileWriter, type LogRecord, type SpanRecord } from "./tracer";

const collect = () => { const records: (SpanRecord | LogRecord)[] = []; setTraceSink(record => records.push(record)); return records; };
afterEach(() => setTraceSink(undefined));

describe("tracer", () => {
	it("records sync and async spans with their parent and outcome", async () => {
		const records = collect();
		const value = await span("outer", { harness: "codex", skipped: undefined }, async () => {
			span("inner", undefined, () => 1);
			await new Promise(resolve => setTimeout(resolve, 5));
			await expect(span("failing", undefined, async () => { throw new Error("gh failed with ghp_abcdefghijklmnopqrstuvwxyz"); })).rejects.toThrow("gh failed");
			return "done";
		});
		expect(value).toBe("done");
		const [inner, failing, outer] = records as SpanRecord[];
		expect(records.map(record => (record as SpanRecord).name)).toEqual(["inner", "failing", "outer"]);
		expect(outer).toMatchObject({ type: "span", attributes: { harness: "codex" }, exit: { _tag: "Success" } });
		expect(outer.parentSpanId).toBeUndefined();
		expect(outer.attributes).not.toHaveProperty("skipped");
		expect(inner).toMatchObject({ traceId: outer.traceId, parentSpanId: outer.spanId });
		expect(failing).toMatchObject({ parentSpanId: outer.spanId, exit: { _tag: "Failure", cause: "gh failed with [hidden]" } });
		expect(outer.durationMs).toBeGreaterThanOrEqual(4);
		expect(BigInt(outer.endTimeUnixNano) > BigInt(outer.startTimeUnixNano)).toBe(true);
	});

	it("rethrows synchronous errors and leaves fast or discarded work unwritten", () => {
		const records = collect();
		expect(() => span("sync", undefined, () => { throw new Error("boom"); })).toThrow("boom");
		span("quick", undefined, () => 1, { minDurationMs: 1_000 });
		expect(() => span("quick failure", undefined, () => { throw new Error("no"); }, { minDurationMs: 1_000 })).toThrow("no");
		const discarded = startSpan("nothing to do"); discarded.discard(); discarded.end();
		recordIfSlow("store.save-task", performance.now(), 50);
		recordIfSlow("store.batch", performance.now() - 80, 50);
		expect(records.map(record => (record as SpanRecord).name)).toEqual(["sync", "quick failure", "store.batch"]);
	});

	it("attaches logs to the open span and writes the rest on their own", () => {
		const records = collect();
		const active = startSpan("turn.run");
		active.within(() => traceLog("warning", "Slow catalog"));
		active.end();
		active.within(() => traceLog("error", "After the turn"));
		traceLog("error", "Bearer abcdefghijklmnop leaked");
		expect((records[0] as SpanRecord).events).toEqual([expect.objectContaining({ name: "Slow catalog", level: "warning" })]);
		expect(records.slice(1)).toEqual([expect.objectContaining({ type: "log", level: "error", message: "After the turn" }), expect.objectContaining({ type: "log", message: "Bearer [hidden] leaked" })]);
	});

	it("copies console warnings and errors without changing what they print", () => {
		const records = collect(), printed: unknown[][] = [];
		const target = { warn: (...args: unknown[]) => printed.push(["warn", ...args]), error: (...args: unknown[]) => printed.push(["error", ...args]) };
		captureConsole(target);
		target.warn("Model catalog refresh failed: %s", "timeout");
		target.error(new Error("Workspace shutdown failed."));
		expect(printed).toHaveLength(2);
		expect(records).toEqual([expect.objectContaining({ level: "warning", message: "Model catalog refresh failed: timeout" }), expect.objectContaining({ level: "error", message: expect.stringContaining("Workspace shutdown failed.") })]);
	});

	it("redacts token shapes", () => {
		expect(redact("token sk-ant-abcdefghijklmnop12 and github_pat_1234567890abcdef")).toBe("token [hidden] and [hidden]");
	});
});

describe("trace file writer", () => {
	let directory: string;
	afterEach(() => rmSync(directory, { recursive: true, force: true }));

	it("batches lines and rotates at the size limit, keeping three files", async () => {
		directory = mkdtempSync(path.join(tmpdir(), "phaseo-trace-writer-"));
		const writer = new TraceFileWriter(directory, { maxBytes: 400, maxFiles: 3, flushMs: 60_000 });
		const line = (index: number): LogRecord => ({ type: "log", level: "warning", message: `message ${index} ${"x".repeat(100)}`, timeUnixNano: "1" });
		writer.write(line(0));
		expect(existsSync(writer.file)).toBe(false);
		await writer.flush();
		expect(readFileSync(writer.file, "utf8").trim().split("\n")).toHaveLength(1);
		for (let index = 1; index < 12; index++) { writer.write(line(index)); await writer.flush(); }
		const [oldest, older, current] = rotatedTracePaths(writer.file, 3);
		for (const file of [oldest, older, current]) { expect(existsSync(file)).toBe(true); expect(statSync(file).size).toBeLessThanOrEqual(400); }
		expect(existsSync(`${writer.file}.3`)).toBe(false);
		expect(readFileSync(current, "utf8")).toContain("message 11");
		writer.write(line(12));
		writer.closeSync();
		expect(readFileSync(current, "utf8")).toContain("message 12");
		writer.write(line(13));
		await writer.flush();
		expect(readFileSync(current, "utf8")).not.toContain("message 13");
	});

	it("drops lines rather than holding them when the buffer is full", () => {
		directory = mkdtempSync(path.join(tmpdir(), "phaseo-trace-writer-"));
		const writer = new TraceFileWriter(directory, { maxBufferBytes: 200, flushMs: 60_000 });
		for (let index = 0; index < 5; index++) writer.write({ type: "log", level: "error", message: "y".repeat(80), timeUnixNano: "1" });
		expect(writer.dropped).toBe(4);
		writer.closeSync();
	});
});
