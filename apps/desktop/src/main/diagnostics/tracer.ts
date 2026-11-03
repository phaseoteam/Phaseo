import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import { appendFileSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { appendFile, mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { format } from "node:util";

/**
 * A small tracer for the main process, writing a local trace file: each span is one NDJSON line in
 * `<userData>/logs/traces.ndjson`, rotated by size. Lines are buffered and appended in batches off the hot path.
 */

export type SpanAttributes = Record<string, string | number | boolean | undefined>;
export type LogLevel = "warning" | "error";
export type SpanEvent = { name: string; timeUnixNano: string; level: LogLevel };
export type SpanRecord = {
	type: "span"; name: string; traceId: string; spanId: string; parentSpanId?: string;
	startTimeUnixNano: string; endTimeUnixNano: string; durationMs: number;
	attributes: Record<string, string | number | boolean>;
	exit: { _tag: "Success" } | { _tag: "Failure"; cause: string };
	events: SpanEvent[];
};
/** A warning or error logged outside any span. */
export type LogRecord = { type: "log"; level: LogLevel; message: string; timeUnixNano: string };

export type SpanOptions = {
	/** Shorter spans that succeed are not written: for frequent work only worth seeing when it is slow. */
	minDurationMs?: number;
};

export type ActiveSpan = {
	readonly name: string;
	readonly traceId: string;
	readonly spanId: string;
	readonly ended: boolean;
	setAttributes: (attributes: SpanAttributes) => void;
	log: (level: LogLevel, message: string) => void;
	/** Ends the span; an error (or a message) marks it failed. Later calls do nothing. */
	end: (error?: unknown) => void;
	/** Ends the span without writing it: work that turned out to have nothing to do. */
	discard: () => void;
	/** Runs work with this span as the parent of the spans it starts. */
	within: <T>(run: () => T) => T;
};

const MAX_MESSAGE = 4_000, MAX_EVENTS = 50, MAX_ATTRIBUTE = 500;
const context = new AsyncLocalStorage<ActiveSpan>();
const hex = (bytes: number) => randomBytes(bytes).toString("hex");
const nowMs = () => performance.timeOrigin + performance.now();
export function unixNano(ms: number) { const whole = Math.floor(ms); return (BigInt(whole) * 1_000_000n + BigInt(Math.round((ms - whole) * 1e6))).toString(); }

/** Hides the shapes of common tokens and bearer headers; messages come from errors and logs that may quote a request. */
export function redact(text: string) {
	return text.replace(/\b(?:gh[opsur]_|github_pat_|sk-(?:ant-|proj-)?|xox[abp]-)[A-Za-z0-9_-]{12,}/g, "[hidden]").replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [hidden]");
}
export function errorMessage(error: unknown) {
	const text = error instanceof Error ? error.message || error.name : typeof error === "string" ? error : "Failure";
	return redact(text.trim() || "Failure").slice(0, MAX_MESSAGE);
}
function cleanAttributes(attributes: SpanAttributes | undefined, into: Record<string, string | number | boolean>) {
	if (attributes) for (const [key, value] of Object.entries(attributes)) if (value !== undefined) into[key] = typeof value === "string" ? redact(value).slice(0, MAX_ATTRIBUTE) : value;
}

export type TraceSink = (record: SpanRecord | LogRecord) => void;
let sink: TraceSink | undefined;
/** Where finished spans and logs go; nothing is kept until one is set (tests and early start-up). */
export function setTraceSink(next: TraceSink | undefined) { sink = next; }

export function startSpan(name: string, attributes?: SpanAttributes, options: SpanOptions = {}): ActiveSpan {
	const parent = context.getStore(), started = nowMs(), clock = performance.now();
	const record: Record<string, string | number | boolean> = {}; cleanAttributes(attributes, record);
	const events: SpanEvent[] = [];
	let ended = false;
	const span: ActiveSpan = {
		name, traceId: parent?.traceId ?? hex(16), spanId: hex(8),
		get ended() { return ended; },
		setAttributes: values => cleanAttributes(values, record),
		discard: () => { ended = true; },
		log: (level, message) => { if (!ended && events.length < MAX_EVENTS) events.push({ name: redact(message).slice(0, MAX_MESSAGE), timeUnixNano: unixNano(nowMs()), level }); },
		end: error => {
			if (ended) return; ended = true;
			const durationMs = performance.now() - clock;
			if (!sink || (error === undefined && options.minDurationMs !== undefined && durationMs < options.minDurationMs)) return;
			sink({ type: "span", name, traceId: span.traceId, spanId: span.spanId, ...(parent ? { parentSpanId: parent.spanId } : {}), startTimeUnixNano: unixNano(started), endTimeUnixNano: unixNano(started + durationMs), durationMs: Math.round(durationMs * 1000) / 1000, attributes: record, exit: error === undefined ? { _tag: "Success" } : { _tag: "Failure", cause: errorMessage(error) }, events });
		},
		within: run => context.run(span, run),
	};
	return span;
}

/** Runs sync or async work in a span; a thrown error or rejection marks it failed and passes through unchanged. */
export function span<T>(name: string, attributes: SpanAttributes | undefined, run: (span: ActiveSpan) => T, options?: SpanOptions): T {
	const active = startSpan(name, attributes, options);
	let result: T;
	try { result = active.within(() => run(active)); }
	catch (error) { active.end(error); throw error; }
	if (result instanceof Promise) return result.then(value => { active.end(); return value; }, error => { active.end(error); throw error; }) as T;
	active.end();
	return result;
}

/** Records finished synchronous work (begun at `performance.now()` `startedAt`) only when it took at least `minDurationMs`. */
export function recordIfSlow(name: string, startedAt: number, minDurationMs: number, attributes?: SpanAttributes, error?: unknown) {
	const durationMs = performance.now() - startedAt;
	if (!sink || (durationMs < minDurationMs && error === undefined)) return;
	const parent = context.getStore(), ended = nowMs(), record: Record<string, string | number | boolean> = {}; cleanAttributes(attributes, record);
	sink({ type: "span", name, traceId: parent?.traceId ?? hex(16), spanId: hex(8), ...(parent ? { parentSpanId: parent.spanId } : {}), startTimeUnixNano: unixNano(ended - durationMs), endTimeUnixNano: unixNano(ended), durationMs: Math.round(durationMs * 1000) / 1000, attributes: record, exit: error === undefined ? { _tag: "Success" } : { _tag: "Failure", cause: errorMessage(error) }, events: [] });
}

export function currentSpan() { return context.getStore(); }

/** A warning or error: on the current span when there is one, otherwise a log record of its own. */
export function traceLog(level: LogLevel, message: string) {
	// Timers and listeners set up inside a span keep it as their context after it ends; their logs stand alone.
	const active = context.getStore();
	if (active && !active.ended) { active.log(level, message); return; }
	if (sink) sink({ type: "log", level, message: redact(message).slice(0, MAX_MESSAGE), timeUnixNano: unixNano(nowMs()) });
}

let consolePatched = false;
/** Copies the main process's console warnings and errors into the trace file; the console still prints them. */
export function captureConsole(target: Pick<Console, "warn" | "error"> = console) {
	if (consolePatched) return; consolePatched = true;
	const { warn, error } = target;
	let inside = false;
	const wrap = (level: LogLevel, original: (...args: unknown[]) => void) => (...args: unknown[]) => {
		original.apply(target, args);
		if (inside) return;
		inside = true;
		try { traceLog(level, format(...args)); } catch { /* Logging must never fail the caller. */ } finally { inside = false; }
	};
	target.warn = wrap("warning", warn);
	target.error = wrap("error", error);
}

/** The rotated files, oldest first, then the current one. */
export function rotatedTracePaths(file: string, maxFiles: number) {
	const backups = Math.max(0, Math.floor(maxFiles) - 1);
	return [...Array.from({ length: backups }, (_, index) => `${file}.${backups - index}`), file];
}

/**
 * Appends NDJSON lines in batches: a timer flushes every second, or sooner once a quarter of a megabyte waits.
 * Rotates before a write would take the file past `maxBytes`, keeping `maxFiles` files in all.
 * When the disk falls behind, lines beyond `maxBufferBytes` are dropped rather than held.
 */
export class TraceFileWriter {
	readonly file: string;
	private buffer: string[] = [];
	private bufferBytes = 0;
	private size: number | undefined;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private writing: Promise<void> = Promise.resolve();
	private closed = false;
	dropped = 0;
	constructor(readonly directory: string, private readonly options: { maxBytes?: number; maxFiles?: number; flushMs?: number; maxBufferBytes?: number } = {}) {
		this.file = path.join(directory, "traces.ndjson");
	}
	get maxFiles() { return this.options.maxFiles ?? 3; }
	write(record: SpanRecord | LogRecord) {
		if (this.closed) return;
		let line: string;
		try { line = `${JSON.stringify(record)}\n`; } catch { return; }
		if (this.bufferBytes + line.length > (this.options.maxBufferBytes ?? 4 * 1024 * 1024)) { this.dropped++; return; }
		this.buffer.push(line); this.bufferBytes += line.length;
		if (this.bufferBytes >= 256 * 1024) void this.flush();
		else if (!this.timer) { this.timer = setTimeout(() => { this.timer = undefined; void this.flush(); }, this.options.flushMs ?? 1_000); this.timer.unref?.(); }
	}
	/** Writes what is buffered; resolves once it (and any earlier write) is on disk. */
	flush(): Promise<void> {
		if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
		if (!this.buffer.length) return this.writing;
		const chunk = this.buffer.join(""); this.buffer = []; this.bufferBytes = 0;
		this.writing = this.writing.then(() => this.append(chunk)).catch(() => { /* A failed write loses its batch, never the app. */ });
		return this.writing;
	}
	private async append(chunk: string) {
		const bytes = Buffer.byteLength(chunk);
		if (this.size === undefined) { await mkdir(this.directory, { recursive: true }); this.size = await stat(this.file).then(value => value.size, () => 0); }
		if (this.size > 0 && this.size + bytes > (this.options.maxBytes ?? 10 * 1024 * 1024)) await this.rotate();
		await appendFile(this.file, chunk); this.size += bytes;
	}
	private async rotate() {
		const paths = rotatedTracePaths(this.file, this.maxFiles);
		if (paths.length > 1) await rm(paths[0], { force: true });
		for (let index = 1; index < paths.length; index++) await rename(paths[index], paths[index - 1]).catch(() => undefined);
		if (paths.length === 1) await rm(this.file, { force: true });
		this.size = 0;
	}
	/** At quit: writes what is left synchronously, since no later tick is coming. */
	closeSync() {
		if (this.closed) return; this.closed = true;
		if (this.timer) clearTimeout(this.timer);
		if (!this.buffer.length) return;
		const chunk = this.buffer.join(""); this.buffer = [];
		try {
			mkdirSync(this.directory, { recursive: true });
			const size = this.size ?? (() => { try { return statSync(this.file).size; } catch { return 0; } })();
			if (size > 0 && size + Buffer.byteLength(chunk) > (this.options.maxBytes ?? 10 * 1024 * 1024)) {
				const paths = rotatedTracePaths(this.file, this.maxFiles);
				rmSync(paths[0], { force: true });
				for (let index = 1; index < paths.length; index++) try { renameSync(paths[index], paths[index - 1]); } catch { /* Missing backups are fine. */ }
			}
			appendFileSync(this.file, chunk);
		} catch { /* Quitting continues regardless. */ }
	}
}
