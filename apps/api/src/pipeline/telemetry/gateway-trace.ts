// Optional request-owned diagnostic tracing. No header can enable this; the
// isolated benchmark wrapper explicitly attaches a trace to its Request.
type Interval = { start: number; end: number; kind: "headers" | "body" };
const traces = new WeakMap<Request, GatewayTimingTrace>();
export function attachGatewayTrace(request: Request, trace: GatewayTimingTrace) { traces.set(request, trace); }
export function gatewayTraceFor(request: Request) { return traces.get(request); }

export class GatewayTimingTrace {
    readonly marks: Record<string, number> = {};
    readonly waits: Interval[] = [];
    readonly issues: string[] = [];
    providerRequests = 0;
    constructor(readonly now: () => number = () => performance.now()) {}
    mark(name: string, at = this.now()) { this.marks[name] ??= at; }
    wait(start: number, end: number, kind: Interval["kind"]) {
        if (this.waits.length >= 512) { this.issue("wait_limit"); return; }
        this.waits.push({ start, end, kind });
    }
    issue(value: string) { if (!this.issues.includes(value)) this.issues.push(value); }
    snapshot() {
        const start = this.marks.gateway_entry;
        const end = this.marks.downstream_first_content;
        const eligible = [start, end, this.marks.upstream_dispatch, this.marks.upstream_headers,
            this.marks.upstream_first_content, this.marks.gateway_response_ready].every(Number.isFinite)
            && this.providerRequests === 1 && this.issues.length === 0;
        const intervals = this.waits.map(w => [Math.max(start, w.start), Math.min(end, w.end)])
            .filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
        let excluded = 0, previousEnd = start;
        for (const [a, b] of intervals) {
            excluded += Math.max(0, b - Math.max(a, previousEnd));
            previousEnd = Math.max(previousEnd, b);
        }
        const difference = (a: string, b: string) => Number.isFinite(this.marks[a]) && Number.isFinite(this.marks[b])
            ? this.marks[b] - this.marks[a] : null;
        return { marks: { ...this.marks }, waits: [...this.waits], issues: [...this.issues],
            providerRequests: this.providerRequests, eligible,
            metrics: {
                benchmarkBodyReadMs: difference("benchmark_body_start", "benchmark_body_ready"),
                beforeDispatchMs: difference("gateway_entry", "upstream_dispatch"),
                providerHeadersMs: difference("upstream_dispatch", "upstream_headers"),
                streamPricingMs: difference("stream_pricing_start", "stream_pricing_end"),
                responseSetupMs: difference("upstream_headers", "gateway_response_ready"),
                contentForwardingMs: difference("upstream_first_content", "downstream_first_content"),
                workerToContentMs: difference("gateway_entry", "downstream_first_content"),
                observedUpstreamWaitMs: eligible ? excluded : null,
                gatewayElapsedExcludingUpstreamWaitMs: eligible ? end - start - excluded : null,
            } };
    }
}

/** Observe without teeing, eager draining, changing bytes or storing payloads.
 * Raw arrival means a read completed in this Worker, not a network-wire timestamp.
 * Supported visible-text frames match the benchmark's Responses/Chat/Messages cases. */
export function observeGatewayStream(response: Response, trace: GatewayTimingTrace, side: "upstream" | "downstream", onFinish?: () => void): Response {
    if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream")) {
        trace.issue(`${side}_not_sse`); return response;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "", observed = false, abandoned = false;
    let finished = false;
    const finish = () => {
        if (finished) return;
        finished = true;
        try { onFinish?.(); } catch { trace.issue("trace_persistence_failed"); }
    };
    function inspect(value: Uint8Array, at: number) {
        if (observed || abandoned) return;
        // Hard cap diagnostic memory. Oversized frames still pass through intact.
        if (buffer.length + value.byteLength > 65_536) {
            abandoned = true; buffer = ""; trace.issue(`${side}_frame_limit`); return;
        }
        buffer += decoder.decode(value, { stream: true });
        let boundary: RegExpExecArray | null;
        while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
            const frame = buffer.slice(0, boundary.index);
            buffer = buffer.slice(boundary.index + boundary[0].length);
            const data = frame.split(/\r?\n/).filter(line => line.startsWith("data:"))
                .map(line => line.slice(5).trimStart()).join("\n");
            try {
                const event = JSON.parse(data);
                const text = event.type === "response.output_text.delta" ? event.delta
                    : event.type === "content_block_delta" && event.delta?.type === "text_delta" ? event.delta.text
                    : event.choices?.[0]?.delta?.content;
                if (typeof text === "string" && text.length) {
                    observed = true; buffer = ""; trace.mark(`${side}_first_content`, at); break;
                }
            } catch { /* Comments, [DONE] and malformed events are forwarded unchanged. */ }
        }
    }
    const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
            const started = trace.now();
            try {
                const { value, done } = await reader.read();
                const arrived = trace.now();
                if (side === "upstream" && trace.marks.downstream_first_content === undefined) trace.wait(started, arrived, "body");
                if (done) { trace.mark(`${side}_stream_end`, arrived); controller.close(); finish(); return; }
                trace.mark(`${side}_first_body`, arrived);
                inspect(value, arrived);
                controller.enqueue(value);
            } catch (error) { trace.issue(`${side}_read_error`); controller.error(error); finish(); }
        },
        async cancel(reason) { trace.issue(`${side}_cancelled`); try { await reader.cancel(reason); } finally { finish(); } },
    }, { highWaterMark: 0 });
    const wrapped = new Response(body, response);
    // The fetch Response URL is used by provider diagnostics; reconstructing a
    // Response normally loses it. Preserve its read-only descriptive fields.
    for (const key of ["url", "redirected", "type"] as const) {
        Object.defineProperty(wrapped, key, { value: response[key] });
    }
    return wrapped;
}
