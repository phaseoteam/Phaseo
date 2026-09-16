import { describe, expect, it } from "vitest";
import { GatewayTimingTrace, attachGatewayTrace, gatewayTraceFor, observeGatewayStream } from "./gateway-trace";

const encode = (s: string) => new TextEncoder().encode(s);
const content = 'event: response.output_text.delta\r\ndata: {"type":"response.output_text.delta","delta":"hello"}\r\n\r\n';

describe("optional gateway timing diagnostics", () => {
    it("subtracts the union of observed waits and leaves missing coverage unknown", () => {
        const trace = new GatewayTimingTrace(() => 0);
        expect(trace.snapshot().metrics.gatewayElapsedExcludingUpstreamWaitMs).toBeNull();
        trace.providerRequests = 1;
        for (const [name, at] of Object.entries({ gateway_entry: 0, upstream_dispatch: 10, upstream_headers: 110,
            gateway_response_ready: 130, upstream_first_content: 200, downstream_first_content: 205 })) trace.mark(name, at);
        trace.wait(10, 110, "headers");
        trace.wait(130, 200, "body");
        trace.wait(150, 190, "body"); // overlapping work must not be subtracted twice
        trace.wait(210, 230, "body"); // after first content is irrelevant
        expect(trace.snapshot()).toMatchObject({ eligible: true, metrics: {
            beforeDispatchMs: 10, responseSetupMs: 20, contentForwardingMs: 5,
            observedUpstreamWaitMs: 170, gatewayElapsedExcludingUpstreamWaitMs: 35,
        } });
        trace.providerRequests++;
        expect(trace.snapshot().metrics.gatewayElapsedExcludingUpstreamWaitMs).toBeNull();
    });

    it("is request scoped and cannot be enabled by request headers", () => {
        const a = new Request("https://example.com", { headers: { "x-benchmark-trace": "true" } });
        const b = new Request(a);
        expect(gatewayTraceFor(a)).toBeUndefined();
        const trace = new GatewayTimingTrace(); attachGatewayTrace(a, trace);
        expect(gatewayTraceFor(a)).toBe(trace);
        expect(gatewayTraceFor(b)).toBeUndefined();
    });

    it("does not read ahead, preserves fragmented SSE bytes and ignores reasoning/metadata", async () => {
        let now = 0, reads = 0;
        const chunks = [': keepalive\r\n\r\ndata: {"type":"response.created"}\r\n\r\n',
            'data: {"type":"response.reasoning_summary_text.delta","delta":"secret reasoning"}\n\n',
            content.slice(0, 45), content.slice(45)];
        const source = new ReadableStream<Uint8Array>({ pull(controller) {
            now += 10;
            if (reads < chunks.length) controller.enqueue(encode(chunks[reads++]));
            else controller.close();
        } }, { highWaterMark: 0 });
        const original = new Response(source, { headers: { "content-type": "text/event-stream", "x-test": "kept" } });
        Object.defineProperty(original, "url", { value: "https://provider.test/v1/responses" });
        const trace = new GatewayTimingTrace(() => now);
        let finishes = 0;
        const observed = observeGatewayStream(original, trace, "upstream", () => { finishes++; });
        await Promise.resolve();
        expect(reads).toBe(0);
        expect(observed.url).toBe(original.url);
        expect(observed.headers.get("x-test")).toBe("kept");
        expect(await observed.text()).toBe(chunks.join(""));
        expect(trace.marks.upstream_first_body).toBe(10);
        expect(trace.marks.upstream_first_content).toBe(40);
        expect(finishes).toBe(1);
        expect(trace.waits[0]).toEqual({ start: 0, end: 10, kind: "body" });
    });

    it("forwards large frames intact but refuses an incomplete diagnostic result", async () => {
        const payload = 'data: {"type":"response.output_text.delta","delta":"' + 'x'.repeat(70_000) + '"}\n\n';
        const trace = new GatewayTimingTrace();
        const response = observeGatewayStream(new Response(payload, { headers: { "content-type": "text/event-stream" } }), trace, "upstream");
        expect(await response.text()).toBe(payload);
        expect(trace.issues).toContain("upstream_frame_limit");
        expect(trace.snapshot().eligible).toBe(false);
    });

    it("propagates cancellation and read errors without inventing content timing", async () => {
        const trace = new GatewayTimingTrace(); let cancelled = false, finished = 0;
        const source = new ReadableStream({ cancel() { cancelled = true; } });
        const response = observeGatewayStream(new Response(source, { headers: { "content-type": "text/event-stream" } }), trace, "downstream", () => { finished++; });
        await response.body!.cancel();
        expect(cancelled).toBe(true); expect(finished).toBe(1);
        expect(trace.marks.downstream_first_content).toBeUndefined();
        const failed = observeGatewayStream(new Response(new ReadableStream({ pull(c) { c.error(new Error("failed")); } }),
            { headers: { "content-type": "text/event-stream" } }), trace, "upstream");
        await expect(failed.text()).rejects.toThrow("failed");
        expect(trace.issues).toContain("upstream_read_error");
    });
});
