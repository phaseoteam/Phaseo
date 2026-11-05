import { tracesUrl, type TraceExport } from "../../shared/traceExport";
import { resolveSecretValues } from "../secretReferences";
import type { LogRecord, SpanRecord } from "./tracer";

type OtlpValue = { stringValue: string } | { boolValue: boolean } | { intValue: string } | { doubleValue: number };
const value = (entry: string | number | boolean): OtlpValue => typeof entry === "string" ? { stringValue: entry } : typeof entry === "boolean" ? { boolValue: entry } : Number.isInteger(entry) ? { intValue: String(entry) } : { doubleValue: entry };
const attributes = (entries: Record<string, string | number | boolean>) => Object.entries(entries).map(([key, entry]) => ({ key, value: value(entry) }));

/** One batch of the tracer's spans as an OTLP/HTTP JSON body. */
export function otlpBody(spans: SpanRecord[], version: string) {
	return {
		resourceSpans: [{
			resource: { attributes: attributes({ "service.name": "phaseo-desktop", "service.version": version, "os.type": process.platform }) },
			scopeSpans: [{
				scope: { name: "phaseo-desktop" },
				spans: spans.map(span => ({
					traceId: span.traceId, spanId: span.spanId, ...(span.parentSpanId ? { parentSpanId: span.parentSpanId } : {}), name: span.name, kind: 1,
					startTimeUnixNano: span.startTimeUnixNano, endTimeUnixNano: span.endTimeUnixNano, attributes: attributes(span.attributes),
					status: span.exit._tag === "Success" ? { code: 1 } : { code: 2, message: span.exit.cause },
					events: span.events.map(event => ({ name: event.name, timeUnixNano: event.timeUnixNano, attributes: attributes({ level: event.level }) })),
				})),
			}],
		}],
	};
}

/**
 * Sends finished spans to the collector Settings → Diagnostics names, in batches every few seconds. A collector that is
 * down loses those batches rather than holding memory or slowing the app; logs stay in the local file only.
 */
export class OtlpExporter {
	private settings: TraceExport = { endpoint: null, headers: {} };
	private queue: SpanRecord[] = [];
	private timer?: ReturnType<typeof setTimeout>;
	private sending = false;
	lastError?: string;
	constructor(private readonly version: string, private readonly fetcher: typeof fetch = fetch, private readonly batchMs = 5_000) {}

	configure(settings: TraceExport) { this.settings = settings; if (!settings.endpoint) { this.queue = []; clearTimeout(this.timer); this.timer = undefined; } }

	add(record: SpanRecord | LogRecord) {
		if (!this.settings.endpoint || record.type !== "span" || record.name.startsWith("otlp.")) return;
		if (this.queue.length >= 2000) this.queue.shift();
		this.queue.push(record);
		this.timer ??= setTimeout(() => { this.timer = undefined; void this.flush(); }, this.batchMs);
		this.timer.unref?.();
	}

	async flush() {
		const endpoint = this.settings.endpoint;
		if (!endpoint || this.sending || !this.queue.length) return;
		const batch = this.queue.splice(0, 500);
		this.sending = true;
		try {
			const headers = await resolveSecretValues(this.settings.headers);
			const response = await this.fetcher(tracesUrl(endpoint), { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(otlpBody(batch, this.version)), signal: AbortSignal.timeout(10_000) });
			this.lastError = response.ok ? undefined : `The collector answered ${response.status}.`;
		} catch (error) { this.lastError = error instanceof Error ? error.message : "The collector could not be reached."; }
		finally { this.sending = false; }
		if (this.queue.length) this.timer ??= setTimeout(() => { this.timer = undefined; void this.flush(); }, this.batchMs);
	}
}
